from __future__ import annotations

import argparse
import datetime as dt
import math
import os
import random
import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection

from .dashboard_forecast_views import get_forecast_view_sql
from .dashboard_views import DASHBOARD_VIEW_SQL


PRIORITY_BASE_SCORE = {
    "Emergency 1A": 1000,
    "Urgent 1B": 800,
    "Urgent 1C": 650,
    "Urgent 1D": 500,
    "Elective": 300,
}

REQUIRED_LABELS = {
    "urgent": ("priority", "Priority indicates emergency or urgent handling."),
    "before_surgery": ("timing", "Event must occur before a scheduled surgical case."),
    "after_lab_result": ("dependency", "Event was created after a lab or diagnostic result."),
    "oncology": ("specialty", "Event is associated with oncology."),
    "cardiology": ("specialty", "Event is associated with cardiology."),
    "surgery_related": ("category", "Event is directly related to surgery or operating room booking."),
    "routine_followup": ("workflow", "Routine outpatient follow-up event."),
    "diagnostic_followup": ("workflow", "Diagnostic result or imaging review follow-up."),
    "long_wait": ("risk", "Event has waited more than 180 days."),
    "high_priority": ("priority", "Emergency 1A or Urgent 1B event."),
}

OUTPATIENT_ACTIONS = {
    "schedule_new_clinic_visit",
    "schedule_followup_clinic_visit",
    "repeat_followup_clinic_visit",
    "schedule_post_surgery_clinic_visit",
    "repeat_post_surgery_clinic_visit",
    "create_outpatient_event",
    "schedule_outpatient_followup",
    "repeat_outpatient_followup",
}

SURGERY_ACTIONS = {
    "create_case_request",
    "schedule_surgery",
    "create_surgery_event",
    "convert_to_surgery_event",
    "book_operating_room",
    "reactivate_surgery_event",
}

ENTRY_POINT_EVENT_TYPES = {
    "Emerg_Admit",
    "Emerg_Sent_To_Or",
    "Referral",
    "New Clinic Visit",
}

CASE_REQUEST_PRIORITY_BY_SCHEDULING = {
    "Emergency 1A": "1A",
    "Urgent 1B": "1B",
    "Urgent 1C": "1C",
    "Urgent 1D": "1D",
    "Urgent 1E": "1E",
    "Elective": "Elective",
}


@dataclass
class SimulationConfig:
    database_url: str
    history_days: int = 90
    simulation_days: int = 30
    demand_multiplier: float = 1.0
    seed: int = 42
    start_date: dt.date | None = None
    max_arrivals: int | None = None
    create_views: bool = True
    dry_run: bool = False
    pending_status: str = "Queued"


@dataclass
class SimulationResult:
    run_id: str
    arrivals_generated: int
    scheduling_events_created: int
    outpatient_events: int
    surgery_events: int
    scheduled_events: int
    pending_backlog_events: int
    calendar_slots_created: int


def normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+"):
        return database_url
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg2://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return database_url


def row_dicts(result: Any) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in result]


def as_date(value: Any) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


def choose_weighted(
    rng: random.Random,
    rows: list[dict[str, Any]],
    weight_key: str,
) -> dict[str, Any]:
    if not rows:
        raise ValueError("Cannot choose from an empty list.")

    total = sum(max(0.0, float(row.get(weight_key) or 0.0)) for row in rows)
    if total <= 0:
        return rng.choice(rows)

    target = rng.random() * total
    running = 0.0
    for row in rows:
        running += max(0.0, float(row.get(weight_key) or 0.0))
        if running >= target:
            return row
    return rows[-1]


def sample_poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    if lam < 30:
        threshold = math.exp(-lam)
        count = 0
        product = 1.0
        while product > threshold:
            count += 1
            product *= rng.random()
        return count - 1
    return max(0, int(round(rng.gauss(lam, math.sqrt(lam)))))


def ceil_to_step(minutes: int, step: int) -> int:
    if step <= 0:
        return minutes
    return int(math.ceil(minutes / step) * step)


def daterange(start_date: dt.date, days: int) -> list[dt.date]:
    return [start_date + dt.timedelta(days=offset) for offset in range(days)]


class HospitalSimulationService:
    def __init__(self, config: SimulationConfig) -> None:
        self.config = config
        self.rng = random.Random(config.seed)
        self.run_id = uuid.uuid4().hex[:12]

    def run(self) -> SimulationResult:
        engine = create_engine(normalize_database_url(self.config.database_url), future=True)
        with engine.connect() as conn:
            transaction = conn.begin()
            try:
                result = self.run_in_connection(conn)
                if self.config.dry_run:
                    transaction.rollback()
                else:
                    transaction.commit()
                return result
            except Exception:
                transaction.rollback()
                raise

    def run_in_connection(self, conn: Connection) -> SimulationResult:
        start_date = self.config.start_date or dt.date.today()
        history_start = start_date - dt.timedelta(days=self.config.history_days)
        reference = self.fetch_reference_data(conn, start_date)
        self.ensure_required_labels(conn, reference)

        patterns, dow_counts = self.fetch_historical_patterns(conn, history_start, start_date)
        arrivals = self.generate_arrivals(patterns, dow_counts, reference, start_date)
        self.insert_generated_arrivals(conn, arrivals)
        events = self.generate_scheduling_events(arrivals, reference)
        self.insert_scheduling_events(conn, events)
        label_rows = self.insert_event_labels(conn, events, reference)
        self.schedule_events(conn, events, label_rows, start_date)

        if self.config.create_views:
            self.create_dashboard_views(conn)

        scheduled_events = sum(1 for event in events if event["status"] == "Scheduled")
        outpatient_events = sum(1 for event in events if event["event_category"] == "Outpatient")
        surgery_events = sum(1 for event in events if event["event_category"] == "Surgery")

        return SimulationResult(
            run_id=self.run_id,
            arrivals_generated=len(arrivals),
            scheduling_events_created=len(events),
            outpatient_events=outpatient_events,
            surgery_events=surgery_events,
            scheduled_events=scheduled_events,
            pending_backlog_events=len(events) - scheduled_events,
            calendar_slots_created=scheduled_events,
        )

    def fetch_reference_data(self, conn: Connection, as_of_date: dt.date) -> dict[str, Any]:
        entry_points = row_dicts(conn.execute(text("""
            SELECT
                entry_point_id::text AS entry_point_id,
                entry_point_name,
                description
            FROM "DimEntryPoint"
        """)))

        pathways = row_dicts(conn.execute(text("""
            SELECT
                pathway_id::text AS pathway_id,
                pathway_name,
                specialty,
                description
            FROM "DimPathway"
        """)))

        entry_pathway_probabilities = row_dicts(conn.execute(text("""
            SELECT
                epp.entry_point_id::text AS entry_point_id,
                epp.pathway_id::text AS pathway_id,
                p.specialty,
                epp.probability::float AS probability
            FROM "FactEntryPointPathwayProbability" epp
            JOIN "DimPathway" p
                ON p.pathway_id = epp.pathway_id
            WHERE epp.effective_start_date <= :as_of_date
              AND (
                  epp.effective_end_date IS NULL
                  OR epp.effective_end_date >= :as_of_date
              )
        """), {"as_of_date": as_of_date}))

        transitions = row_dicts(conn.execute(text("""
            SELECT
                pathway_transition_id::text AS pathway_transition_id,
                pathway_id::text AS pathway_id,
                entry_point_name,
                entry_point_priority,
                case_priority,
                path_variant,
                current_state,
                next_state,
                probability::float AS probability,
                action_type,
                is_terminal_state,
                max_repeat_count
            FROM "FactPathwayTransition"
        """)))

        outpatient_rules = row_dicts(conn.execute(text("""
            SELECT
                event_type,
                specialty,
                priority,
                slot_duration_min,
                default_duration_min
            FROM "DimOutpatientDurationRule"
        """)))

        surgery_distributions = row_dicts(conn.execute(text("""
            SELECT
                surgery_type,
                specialty,
                priority,
                distribution_type,
                mean_duration_min,
                stddev_duration_min,
                min_duration_min,
                max_duration_min,
                sample_size
            FROM "DimSurgeryDurationDistribution"
        """)))

        labels = row_dicts(conn.execute(text("""
            SELECT
                label_id::text AS label_id,
                label_name,
                label_type,
                description
            FROM "DimEventLabel"
        """)))

        scheduling_rules = row_dicts(conn.execute(text("""
            SELECT
                rule_name,
                label_condition,
                score_adjustment,
                rule_type
            FROM "DimSchedulingRule"
            WHERE is_active = true
        """)))

        if not entry_points:
            raise RuntimeError("DimEntryPoint is empty. Run the seed SQL before simulation.")
        if not pathways:
            raise RuntimeError("DimPathway is empty. Run the seed SQL before simulation.")

        pathway_by_id = {row["pathway_id"]: row for row in pathways}
        entry_points_by_name = {row["entry_point_name"]: row for row in entry_points}
        transitions_by_state: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for transition in transitions:
            key = (transition["pathway_id"], transition["current_state"])
            transitions_by_state.setdefault(key, []).append(transition)

        return {
            "entry_points": entry_points,
            "entry_points_by_name": entry_points_by_name,
            "pathways": pathways,
            "pathway_by_id": pathway_by_id,
            "entry_pathway_probabilities": entry_pathway_probabilities,
            "transitions_by_state": transitions_by_state,
            "outpatient_rules": outpatient_rules,
            "surgery_distributions": surgery_distributions,
            "labels_by_name": {row["label_name"]: row for row in labels},
            "scheduling_rules": scheduling_rules,
        }

    def ensure_required_labels(self, conn: Connection, reference: dict[str, Any]) -> None:
        missing = [
            label_name
            for label_name in REQUIRED_LABELS
            if label_name not in reference["labels_by_name"]
        ]
        if not missing:
            return

        conn.execute(text("""
            INSERT INTO "DimEventLabel" (
                label_id,
                label_type,
                label_name,
                description
            )
            VALUES (
                gen_random_uuid(),
                :label_type,
                :label_name,
                :description
            )
        """), [
            {
                "label_name": label_name,
                "label_type": REQUIRED_LABELS[label_name][0],
                "description": REQUIRED_LABELS[label_name][1],
            }
            for label_name in missing
        ])

        labels = row_dicts(conn.execute(text("""
            SELECT
                label_id::text AS label_id,
                label_name,
                label_type,
                description
            FROM "DimEventLabel"
        """)))
        reference["labels_by_name"] = {row["label_name"]: row for row in labels}

    def fetch_historical_patterns(
        self,
        conn: Connection,
        history_start: dt.date,
        history_end: dt.date,
    ) -> tuple[list[dict[str, Any]], dict[int, dict[str, float]]]:
        params = {
            "history_start": dt.datetime.combine(history_start, dt.time.min),
            "history_end": dt.datetime.combine(history_end, dt.time.min),
        }

        patterns = row_dicts(conn.execute(text("""
            SELECT
                EXTRACT(ISODOW FROM start_datetime)::int AS dow,
                specialty,
                priority,
                event_type,
                table_source,
                COUNT(*)::int AS arrival_count
            FROM "FactHospitalEvent"
            WHERE start_datetime >= :history_start
              AND start_datetime < :history_end
            GROUP BY
                EXTRACT(ISODOW FROM start_datetime)::int,
                specialty,
                priority,
                event_type,
                table_source
        """), params))

        dow_rows = row_dicts(conn.execute(text("""
            SELECT
                EXTRACT(ISODOW FROM start_datetime)::int AS dow,
                COUNT(DISTINCT start_datetime::date)::int AS historical_days,
                COUNT(*)::int AS arrival_count
            FROM "FactHospitalEvent"
            WHERE start_datetime >= :history_start
              AND start_datetime < :history_end
            GROUP BY EXTRACT(ISODOW FROM start_datetime)::int
        """), params))

        if not patterns:
            return self.fallback_patterns(), self.fallback_dow_counts()

        dow_counts = {
            int(row["dow"]): {
                "historical_days": max(1, int(row["historical_days"])),
                "arrival_count": int(row["arrival_count"]),
            }
            for row in dow_rows
        }
        return patterns, dow_counts

    def fallback_patterns(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        specialties = [
            ("Orthopedics", 22),
            ("Cardiology", 18),
            ("Oncology", 21),
            ("General Surgery", 21),
            ("Neurology", 18),
        ]
        priorities = [
            ("Emergency 1A", 8),
            ("Urgent 1B", 14),
            ("Urgent 1C", 22),
            ("Urgent 1D", 24),
            ("Elective", 32),
        ]
        for dow in range(1, 8):
            for specialty, specialty_weight in specialties:
                for priority, priority_weight in priorities:
                    rows.append({
                        "dow": dow,
                        "specialty": specialty,
                        "priority": priority,
                        "event_type": "Referral",
                        "table_source": "fallback_pattern",
                        "arrival_count": specialty_weight * priority_weight,
                    })
        return rows

    def fallback_dow_counts(self) -> dict[int, dict[str, float]]:
        return {
            dow: {
                "historical_days": 13,
                "arrival_count": 55 if dow <= 5 else 24,
            }
            for dow in range(1, 8)
        }

    def generate_arrivals(
        self,
        patterns: list[dict[str, Any]],
        dow_counts: dict[int, dict[str, float]],
        reference: dict[str, Any],
        start_date: dt.date,
    ) -> list[dict[str, Any]]:
        arrivals: list[dict[str, Any]] = []
        patterns_by_dow: dict[int, list[dict[str, Any]]] = {}
        for pattern in patterns:
            patterns_by_dow.setdefault(int(pattern["dow"]), []).append(pattern)

        for arrival_date in daterange(start_date, self.config.simulation_days):
            dow = arrival_date.isoweekday()
            dow_count = dow_counts.get(dow) or {"historical_days": 1, "arrival_count": 0}
            daily_lambda = (
                float(dow_count["arrival_count"])
                / max(1.0, float(dow_count["historical_days"]))
                * self.config.demand_multiplier
            )
            arrival_count = sample_poisson(self.rng, daily_lambda)
            day_patterns = patterns_by_dow.get(dow) or patterns

            for _ in range(arrival_count):
                pattern = choose_weighted(self.rng, day_patterns, "arrival_count")
                arrival_at = self.random_arrival_datetime(arrival_date)
                entry_point = self.assign_entry_point(pattern, reference)
                pathway = self.assign_pathway(pattern, entry_point, reference)
                arrivals.append({
                    "entity_id": str(uuid.uuid4()),
                    "case_id": str(uuid.uuid4()),
                    "arrival_at": arrival_at,
                    "specialty": pattern["specialty"],
                    "priority": pattern["priority"],
                    "source_event_type": pattern["event_type"],
                    "source_table": pattern["table_source"],
                    "entry_point": entry_point,
                    "pathway": pathway,
                })

                if self.config.max_arrivals and len(arrivals) >= self.config.max_arrivals:
                    return arrivals

        return arrivals

    def random_arrival_datetime(self, arrival_date: dt.date) -> dt.datetime:
        if self.rng.random() < 0.72:
            hour = self.rng.randint(8, 16)
        else:
            hour = self.rng.randint(0, 23)
        minute = self.rng.choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
        return dt.datetime.combine(arrival_date, dt.time(hour=hour, minute=minute))

    def assign_entry_point(
        self,
        pattern: dict[str, Any],
        reference: dict[str, Any],
    ) -> dict[str, Any]:
        by_name = reference["entry_points_by_name"]
        event_type = str(pattern.get("event_type") or "")
        table_source = str(pattern.get("table_source") or "")
        priority = str(pattern.get("priority") or "")

        if "Diagnostic" in event_type or "diagnostic" in table_source:
            name = "New Clinic Visit"
        elif "Surgery" in event_type:
            name = "Referral"
        elif priority == "Emergency 1A":
            name = "Emerg_Sent_To_Or" if self.rng.random() < 0.15 else "Emerg_Admit"
        elif "discharge" in table_source.lower():
            name = "New Clinic Visit"
        elif self.rng.random() < 0.08:
            name = "New Clinic Visit"
        else:
            name = "Referral"

        return by_name.get(name) or self.rng.choice(reference["entry_points"])

    def assign_pathway(
        self,
        pattern: dict[str, Any],
        entry_point: dict[str, Any],
        reference: dict[str, Any],
    ) -> dict[str, Any]:
        probabilities = [
            row
            for row in reference["entry_pathway_probabilities"]
            if row["entry_point_id"] == entry_point["entry_point_id"]
        ]
        specialty_matches = [
            row for row in probabilities if row["specialty"] == pattern["specialty"]
        ]
        candidates = specialty_matches or probabilities
        if not candidates:
            candidates = [
                {"pathway_id": row["pathway_id"], "probability": 1.0}
                for row in reference["pathways"]
                if row["specialty"] == pattern["specialty"]
            ] or [{"pathway_id": row["pathway_id"], "probability": 1.0} for row in reference["pathways"]]

        chosen = choose_weighted(self.rng, candidates, "probability")
        return reference["pathway_by_id"][chosen["pathway_id"]]

    def generate_scheduling_events(
        self,
        arrivals: list[dict[str, Any]],
        reference: dict[str, Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        for arrival in arrivals:
            events.extend(self.generate_pathway_events(arrival, reference))
        return events

    def insert_generated_arrivals(
        self,
        conn: Connection,
        arrivals: list[dict[str, Any]],
    ) -> None:
        if not arrivals:
            return

        conn.execute(text("""
            INSERT INTO "FactHospitalEvent" (
                hospital_event_id,
                entity_id,
                case_id,
                start_datetime,
                end_datetime,
                table_source,
                specialty,
                department_name,
                event_type,
                priority,
                status,
                source_encounter_key,
                linked_encounter_key,
                order_key
            )
            VALUES (
                gen_random_uuid(),
                :entity_id,
                :case_id,
                :start_datetime,
                :end_datetime,
                :table_source,
                :specialty,
                :department_name,
                :event_type,
                :priority,
                :status,
                :source_encounter_key,
                :linked_encounter_key,
                :order_key
            )
        """), [
            {
                "entity_id": arrival["entity_id"],
                "case_id": arrival["case_id"],
                "start_datetime": arrival["arrival_at"],
                "end_datetime": arrival["arrival_at"] + dt.timedelta(minutes=30),
                "table_source": "simulation_service",
                "specialty": arrival["specialty"],
                "department_name": self.department_name_for(arrival["specialty"]),
                "event_type": "Simulated Arrival",
                "priority": arrival["priority"],
                "status": "Generated",
                "source_encounter_key": f"SIM-{self.run_id}-{idx:06d}",
                "linked_encounter_key": f"CASE-{arrival['case_id']}",
                "order_key": f"SIM-ORD-{self.run_id}-{idx:06d}",
            }
            for idx, arrival in enumerate(arrivals, start=1)
        ])

    def department_name_for(self, specialty: str) -> str:
        return {
            "Orthopedics": "Fracture and Joint Clinic",
            "Cardiology": "Cardiac Diagnostics",
            "Oncology": "Cancer Centre",
            "General Surgery": "Surgical Assessment Unit",
            "Neurology": "Neurosciences Clinic",
        }.get(specialty, "Specialty Scheduling")

    def case_priority_detail_for(self, arrival: dict[str, Any]) -> str:
        return CASE_REQUEST_PRIORITY_BY_SCHEDULING.get(
            str(arrival.get("priority") or ""),
            "Elective",
        )

    def referral_priority_for(self, arrival: dict[str, Any]) -> str | None:
        tiers = ("P1", "P2", "P3", "P4")
        for label in (
            str(arrival.get("source_event_type") or ""),
            str(arrival.get("source_table") or ""),
        ):
            for tier in tiers:
                if tier in label:
                    return tier
        return self.rng.choice(list(tiers))

    def path_variant_for(self, entry_point_name: str, referral_priority: str | None) -> str | None:
        if entry_point_name != "Referral" or referral_priority not in {"P3", "P4"}:
            return None
        return (
            "second_followup_before_case_request"
            if self.rng.random() < 0.40
            else "second_followup_after_case_request"
        )

    def transition_matches_arrival(
        self,
        transition: dict[str, Any],
        arrival: dict[str, Any],
    ) -> bool:
        entry_point_name = arrival["entry_point"]["entry_point_name"]
        if transition.get("entry_point_name") and transition["entry_point_name"] != entry_point_name:
            return False

        case_priority = self.case_priority_detail_for(arrival)
        if transition.get("case_priority") and transition["case_priority"] != case_priority:
            return False

        referral_priority = self.referral_priority_for(arrival)
        transition_entry_priority = transition.get("entry_point_priority")
        if transition_entry_priority and referral_priority != transition_entry_priority:
            if entry_point_name == "Referral" and referral_priority in {"P1", "P2"}:
                if transition_entry_priority not in {"P1", "P2"}:
                    return False
            elif transition_entry_priority != referral_priority:
                return False

        path_variant = self.path_variant_for(entry_point_name, referral_priority)
        transition_variant = transition.get("path_variant")
        if transition_variant:
            return transition_variant == path_variant
        if path_variant and entry_point_name == "Referral" and referral_priority in {"P3", "P4"}:
            return False
        return True

    def generate_pathway_events(
        self,
        arrival: dict[str, Any],
        reference: dict[str, Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        entry_point_name = arrival["entry_point"]["entry_point_name"]
        state = entry_point_name if entry_point_name in ENTRY_POINT_EVENT_TYPES else "Referral"
        repeat_counts: dict[tuple[str, str], int] = {}
        pathway_id = arrival["pathway"]["pathway_id"]

        for step_index in range(12):
            candidates = reference["transitions_by_state"].get((pathway_id, state), [])
            transitions = [
                row for row in candidates
                if self.transition_matches_arrival(row, arrival)
            ]
            if not transitions:
                break

            transition = choose_weighted(self.rng, transitions, "probability")
            repeat_key = (transition["current_state"], transition["next_state"])
            repeat_counts[repeat_key] = repeat_counts.get(repeat_key, 0) + 1
            max_repeat = int(transition["max_repeat_count"] or 0)
            if max_repeat and repeat_counts[repeat_key] > max_repeat:
                break

            action_type = transition["action_type"]
            if action_type in OUTPATIENT_ACTIONS or action_type in SURGERY_ACTIONS:
                event = self.build_scheduling_event(
                    arrival=arrival,
                    action_type=action_type,
                    step_index=step_index,
                    reference=reference,
                )
                events.append(event)

            if transition["is_terminal_state"]:
                break
            state = transition["next_state"]

        return events

    def build_scheduling_event(
        self,
        arrival: dict[str, Any],
        action_type: str,
        step_index: int,
        reference: dict[str, Any],
    ) -> dict[str, Any]:
        event_category = "Surgery" if action_type in SURGERY_ACTIONS else "Outpatient"
        required_action = self.required_action_for(action_type, arrival)
        ready_at = arrival["arrival_at"] + dt.timedelta(
            days=step_index * self.rng.randint(2, 8) + self.rng.randint(0, 3)
        )
        duration_min = self.estimate_duration(
            event_category=event_category,
            required_action=required_action,
            specialty=arrival["specialty"],
            priority=arrival["priority"],
            reference=reference,
        )
        labels = self.assign_labels(
            event_category=event_category,
            required_action=required_action,
            specialty=arrival["specialty"],
            priority=arrival["priority"],
            entry_point_name=arrival["entry_point"]["entry_point_name"],
            ready_at=ready_at,
            source_event_type=str(arrival.get("source_event_type") or ""),
            source_table=str(arrival.get("source_table") or ""),
        )
        priority_score = self.calculate_priority_score(
            priority=arrival["priority"],
            event_category=event_category,
            labels=labels,
            ready_at=ready_at,
            reference=reference,
        )

        return {
            "event_id": str(uuid.uuid4()),
            "entity_id": arrival["entity_id"],
            "case_id": arrival["case_id"],
            "pathway_id": arrival["pathway"]["pathway_id"],
            "required_action": required_action,
            "event_category": event_category,
            "specialty": arrival["specialty"],
            "priority": arrival["priority"],
            "estimated_duration_min": duration_min,
            "created_at": arrival["arrival_at"],
            "ready_at": ready_at,
            "status": self.config.pending_status,
            "labels": labels,
            "priority_score": priority_score,
        }

    def required_action_for(self, action_type: str, arrival: dict[str, Any]) -> str:
        if action_type in {
            "schedule_new_clinic_visit",
            "create_outpatient_event",
        }:
            return "New Clinic Visit"
        if action_type in {
            "schedule_followup_clinic_visit",
            "repeat_followup_clinic_visit",
            "schedule_outpatient_followup",
            "repeat_outpatient_followup",
            "schedule_post_surgery_clinic_visit",
            "repeat_post_surgery_clinic_visit",
        }:
            return "Follow-up Clinic Visit"
        if action_type in {"create_case_request", "create_surgery_event"}:
            return "CaseRequest"
        if action_type in {"schedule_surgery", "book_operating_room", "convert_to_surgery_event"}:
            return "Surgery"
        return "CaseRequest"

    def estimate_duration(
        self,
        event_category: str,
        required_action: str,
        specialty: str,
        priority: str,
        reference: dict[str, Any],
    ) -> int:
        if event_category == "Outpatient":
            rules = reference["outpatient_rules"]
            exact = [
                row for row in rules
                if row["event_type"] == required_action
                and row["specialty"] == specialty
                and row["priority"] == priority
            ]
            specialty_rules = [
                row for row in rules
                if row["event_type"] == required_action and row["specialty"] == specialty
            ]
            event_rules = [row for row in rules if row["event_type"] == required_action]
            selected = (exact or specialty_rules or event_rules or rules)
            if selected:
                return int(selected[0]["slot_duration_min"] or selected[0]["default_duration_min"])
            return 30

        distributions = [
            row for row in reference["surgery_distributions"]
            if row["specialty"] == specialty and row["priority"] == priority
        ]
        if not distributions:
            distributions = [
                row for row in reference["surgery_distributions"]
                if row["specialty"] == specialty
            ]
        if not distributions:
            return 120

        selected = choose_weighted(self.rng, distributions, "sample_size")
        mean = float(selected["mean_duration_min"])
        stddev = float(selected["stddev_duration_min"])
        sampled = int(round(self.rng.gauss(mean, stddev)))
        return max(
            int(selected["min_duration_min"]),
            min(int(selected["max_duration_min"]), sampled),
        )

    def assign_labels(
        self,
        event_category: str,
        required_action: str,
        specialty: str,
        priority: str,
        entry_point_name: str,
        ready_at: dt.datetime,
        source_event_type: str = "",
        source_table: str = "",
    ) -> set[str]:
        labels: set[str] = set()
        if priority in {"Emergency 1A", "Urgent 1B", "Urgent 1C", "Urgent 1D"}:
            labels.add("urgent")
        if priority in {"Emergency 1A", "Urgent 1B"}:
            labels.add("high_priority")
        if event_category == "Surgery":
            labels.add("surgery_related")
        if required_action == "CaseRequest":
            labels.add("before_surgery")
        if required_action == "New Clinic Visit" and (
            "Diagnostic" in source_event_type
            or "diagnostic" in source_table.lower()
        ):
            labels.add("after_lab_result")
            labels.add("diagnostic_followup")
        if specialty == "Oncology":
            labels.add("oncology")
        if specialty == "Cardiology":
            labels.add("cardiology")
        if event_category == "Outpatient" and (
            priority == "Elective" or required_action == "Follow-up Clinic Visit"
        ):
            labels.add("routine_followup")
        if ready_at.date() <= dt.date.today() - dt.timedelta(days=180):
            labels.add("long_wait")
        return labels

    def calculate_priority_score(
        self,
        priority: str,
        event_category: str,
        labels: set[str],
        ready_at: dt.datetime,
        reference: dict[str, Any],
    ) -> int:
        score = PRIORITY_BASE_SCORE.get(priority, 300)
        if event_category == "Surgery":
            score += 100
        wait_days = max(0, (dt.date.today() - ready_at.date()).days)
        score += min(300, wait_days)

        for rule in reference["scheduling_rules"]:
            if self.rule_matches(rule["label_condition"], labels, priority):
                score += int(rule["score_adjustment"])
        return score

    def rule_matches(self, condition: str, labels: set[str], priority: str) -> bool:
        label_matches = re.findall(r"label_name\s*=\s*'([^']+)'", condition, flags=re.I)
        priority_matches = re.findall(r"priority\s*=\s*'([^']+)'", condition, flags=re.I)
        if label_matches and not any(label in labels for label in label_matches):
            return False
        if priority_matches and priority not in priority_matches:
            return False
        return bool(label_matches or priority_matches)

    def insert_scheduling_events(
        self,
        conn: Connection,
        events: list[dict[str, Any]],
    ) -> None:
        if not events:
            return

        conn.execute(text("""
            INSERT INTO "FactSchedulingEvent" (
                event_id,
                entity_id,
                case_id,
                pathway_id,
                required_action,
                event_category,
                specialty,
                priority,
                estimated_duration_min,
                created_at,
                ready_at,
                status
            )
            VALUES (
                :event_id,
                :entity_id,
                :case_id,
                :pathway_id,
                :required_action,
                :event_category,
                :specialty,
                :priority,
                :estimated_duration_min,
                :created_at,
                :ready_at,
                :status
            )
        """), [
            {
                key: event[key]
                for key in (
                    "event_id",
                    "entity_id",
                    "case_id",
                    "pathway_id",
                    "required_action",
                    "event_category",
                    "specialty",
                    "priority",
                    "estimated_duration_min",
                    "created_at",
                    "ready_at",
                    "status",
                )
            }
            for event in events
        ])

    def insert_event_labels(
        self,
        conn: Connection,
        events: list[dict[str, Any]],
        reference: dict[str, Any],
    ) -> list[dict[str, Any]]:
        label_rows: list[dict[str, Any]] = []
        labels_by_name = reference["labels_by_name"]
        for event in events:
            for label_name in event["labels"]:
                label = labels_by_name.get(label_name)
                if not label:
                    continue
                label_rows.append({
                    "event_id": event["event_id"],
                    "label_id": label["label_id"],
                    "assigned_at": event["created_at"],
                    "source": f"simulation_service:{self.run_id}",
                    "label_name": label_name,
                })

        if not label_rows:
            return label_rows

        conn.execute(text("""
            INSERT INTO "BridgeEventLabel" (
                event_id,
                label_id,
                assigned_at,
                source
            )
            VALUES (
                :event_id,
                :label_id,
                :assigned_at,
                :source
            )
            ON CONFLICT (event_id, label_id) DO NOTHING
        """), [
            {
                "event_id": row["event_id"],
                "label_id": row["label_id"],
                "assigned_at": row["assigned_at"],
                "source": row["source"],
            }
            for row in label_rows
        ])
        return label_rows

    def schedule_events(
        self,
        conn: Connection,
        events: list[dict[str, Any]],
        label_rows: list[dict[str, Any]],
        start_date: dt.date,
    ) -> None:
        if not events:
            return

        capacities = self.load_capacity_state(conn, start_date)
        queue = sorted(
            events,
            key=lambda event: (
                -int(event["priority_score"]),
                event["ready_at"],
                event["event_id"],
            ),
        )
        slot_rows: list[dict[str, Any]] = []
        scheduled_event_ids: list[dict[str, Any]] = []

        for event in queue:
            slot = None
            if event["event_category"] == "Outpatient":
                slot = self.find_outpatient_slot(event, capacities["outpatient"])
            else:
                slot = self.find_surgery_slot(event, capacities["surgery"])

            if not slot:
                event["status"] = self.config.pending_status
                continue

            event["status"] = "Scheduled"
            scheduled_event_ids.append({"event_id": event["event_id"]})
            slot_rows.append({
                "slot_id": str(uuid.uuid4()),
                "event_id": event["event_id"],
                "case_id": event["case_id"],
                "resource_type": event["event_category"],
                "resource_id": slot["resource_id"],
                "scheduled_start": slot["scheduled_start"],
                "scheduled_end": slot["scheduled_end"],
                "duration_min": event["estimated_duration_min"],
                "priority_score": event["priority_score"],
                "slot_status": "Booked",
            })

        if scheduled_event_ids:
            conn.execute(text("""
                UPDATE "FactSchedulingEvent"
                SET status = 'Scheduled'
                WHERE event_id = :event_id
            """), scheduled_event_ids)

        if slot_rows:
            conn.execute(text("""
                INSERT INTO "FactCalendarSlot" (
                    slot_id,
                    event_id,
                    case_id,
                    resource_type,
                    resource_id,
                    scheduled_start,
                    scheduled_end,
                    duration_min,
                    priority_score,
                    slot_status
                )
                VALUES (
                    :slot_id,
                    :event_id,
                    :case_id,
                    :resource_type,
                    :resource_id,
                    :scheduled_start,
                    :scheduled_end,
                    :duration_min,
                    :priority_score,
                    :slot_status
                )
            """), slot_rows)

    def load_capacity_state(
        self,
        conn: Connection,
        start_date: dt.date,
    ) -> dict[str, list[dict[str, Any]]]:
        end_date = start_date + dt.timedelta(days=self.config.simulation_days)
        outpatient = row_dicts(conn.execute(text("""
            SELECT
                specialty,
                provider_id,
                location_id,
                capacity_date,
                start_time,
                end_time,
                slot_length_min,
                max_slots
            FROM "FactOutpatientCapacity"
            WHERE capacity_date >= :start_date
              AND capacity_date < :end_date
            ORDER BY capacity_date, start_time, specialty, provider_id
        """), {"start_date": start_date, "end_date": end_date}))

        surgery = row_dicts(conn.execute(text("""
            SELECT
                operating_room_id,
                surgical_specialty,
                capacity_date,
                start_time,
                end_time,
                available_minutes,
                reserved_minutes
            FROM "FactSurgeryCapacity"
            WHERE capacity_date >= :start_date
              AND capacity_date < :end_date
            ORDER BY capacity_date, start_time, surgical_specialty, operating_room_id
        """), {"start_date": start_date, "end_date": end_date}))

        usage_rows = row_dicts(conn.execute(text("""
            SELECT
                resource_id,
                scheduled_start::date AS capacity_date,
                SUM(duration_min)::int AS used_minutes
            FROM "FactCalendarSlot"
            WHERE scheduled_start::date >= :start_date
              AND scheduled_start::date < :end_date
              AND slot_status IN ('Booked', 'Held', 'Completed')
            GROUP BY resource_id, scheduled_start::date
        """), {"start_date": start_date, "end_date": end_date}))

        usage = {
            (row["resource_id"], as_date(row["capacity_date"])): int(row["used_minutes"] or 0)
            for row in usage_rows
        }

        for row in outpatient:
            capacity_date = as_date(row["capacity_date"])
            used_minutes = usage.get((row["provider_id"], capacity_date), 0)
            row["capacity_date"] = capacity_date
            row["used_slots"] = int(math.ceil(used_minutes / max(1, int(row["slot_length_min"]))))

        for row in surgery:
            capacity_date = as_date(row["capacity_date"])
            row["capacity_date"] = capacity_date
            row["used_minutes"] = usage.get((row["operating_room_id"], capacity_date), 0)

        return {"outpatient": outpatient, "surgery": surgery}

    def find_outpatient_slot(
        self,
        event: dict[str, Any],
        capacities: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        duration = int(event["estimated_duration_min"])
        ready_at = event["ready_at"]
        for capacity in capacities:
            if capacity["specialty"] != event["specialty"]:
                continue
            if capacity["capacity_date"] < ready_at.date():
                continue

            slot_length = int(capacity["slot_length_min"])
            slots_needed = int(math.ceil(duration / slot_length))
            day_start = dt.datetime.combine(capacity["capacity_date"], capacity["start_time"])
            earliest_slot = int(capacity["used_slots"])
            if ready_at.date() == capacity["capacity_date"] and ready_at > day_start:
                minutes_after_start = math.ceil((ready_at - day_start).total_seconds() / 60)
                earliest_slot = max(earliest_slot, int(math.ceil(minutes_after_start / slot_length)))

            if earliest_slot + slots_needed > int(capacity["max_slots"]):
                continue

            scheduled_start = day_start + dt.timedelta(minutes=earliest_slot * slot_length)
            scheduled_end = scheduled_start + dt.timedelta(minutes=duration)
            if scheduled_end.time() > capacity["end_time"]:
                continue

            capacity["used_slots"] = earliest_slot + slots_needed
            return {
                "resource_id": capacity["provider_id"],
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_end,
            }
        return None

    def find_surgery_slot(
        self,
        event: dict[str, Any],
        capacities: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        duration = int(event["estimated_duration_min"])
        ready_at = event["ready_at"]
        for capacity in capacities:
            if capacity["surgical_specialty"] != event["specialty"]:
                continue
            if capacity["capacity_date"] < ready_at.date():
                continue

            day_start = dt.datetime.combine(capacity["capacity_date"], capacity["start_time"])
            usable_minutes = int(capacity["available_minutes"]) - int(capacity["reserved_minutes"])
            offset_minutes = int(capacity["used_minutes"])
            if ready_at.date() == capacity["capacity_date"] and ready_at > day_start:
                minutes_after_start = math.ceil((ready_at - day_start).total_seconds() / 60)
                offset_minutes = max(offset_minutes, ceil_to_step(minutes_after_start, 15))

            if offset_minutes + duration > usable_minutes:
                continue

            scheduled_start = day_start + dt.timedelta(minutes=offset_minutes)
            scheduled_end = scheduled_start + dt.timedelta(minutes=duration)
            if scheduled_end.time() > capacity["end_time"]:
                continue

            capacity["used_minutes"] = offset_minutes + duration
            return {
                "resource_id": capacity["operating_room_id"],
                "scheduled_start": scheduled_start,
                "scheduled_end": scheduled_end,
            }
        return None

    def create_dashboard_views(self, conn: Connection) -> None:
        for statement in DASHBOARD_VIEW_SQL:
            conn.execute(text(statement))
        conn.execute(text(get_forecast_view_sql()))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the hospital event-processing and scheduling simulation."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL"),
        help="PostgreSQL/Supabase connection string. Defaults to DATABASE_URL.",
    )
    parser.add_argument(
        "--history-days",
        type=int,
        default=90,
        help="Number of historical days from FactHospitalEvent used to estimate arrivals.",
    )
    parser.add_argument(
        "--simulation-days",
        type=int,
        default=30,
        help="Number of future days to simulate.",
    )
    parser.add_argument(
        "--demand-multiplier",
        type=float,
        default=1.0,
        help="Scale generated arrivals up or down from historical demand.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for repeatable simulation distributions.",
    )
    parser.add_argument(
        "--start-date",
        type=dt.date.fromisoformat,
        default=None,
        help="Simulation start date in YYYY-MM-DD format. Defaults to today.",
    )
    parser.add_argument(
        "--max-arrivals",
        type=int,
        default=None,
        help="Optional cap for generated arrivals during testing.",
    )
    parser.add_argument(
        "--skip-views",
        action="store_true",
        help="Do not create or replace dashboard KPI views.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the simulation and roll back all inserts/updates.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.database_url:
        raise SystemExit("DATABASE_URL is required. Pass --database-url or set the environment variable.")

    config = SimulationConfig(
        database_url=args.database_url,
        history_days=args.history_days,
        simulation_days=args.simulation_days,
        demand_multiplier=args.demand_multiplier,
        seed=args.seed,
        start_date=args.start_date,
        max_arrivals=args.max_arrivals,
        create_views=not args.skip_views,
        dry_run=args.dry_run,
    )
    result = HospitalSimulationService(config).run()
    print(f"Simulation run_id: {result.run_id}")
    print(f"Arrivals generated: {result.arrivals_generated}")
    print(f"Scheduling events created: {result.scheduling_events_created}")
    print(f"Outpatient queue events: {result.outpatient_events}")
    print(f"Surgery queue events: {result.surgery_events}")
    print(f"Scheduled events: {result.scheduled_events}")
    print(f"Pending backlog events: {result.pending_backlog_events}")
    print(f"Calendar slots created: {result.calendar_slots_created}")
    if config.dry_run:
        print("Dry run complete: transaction rolled back.")


if __name__ == "__main__":
    main()

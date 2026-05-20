import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarClock,
  CalendarRange,
  Clock,
  Crosshair,
  Flag,
  Layers,
  ListOrdered,
  MapPin,
  Shield,
  Stethoscope,
  Timer,
  User,
  UserX,
} from "lucide-react";

export type AppointmentTypeId = "new-clinic" | "follow-up" | "post-surgery";

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentTypeId, string> = {
  "new-clinic": "New Clinic Visit",
  "follow-up": "Follow-up",
  "post-surgery": "Post-Surgery Follow-up",
};

export type FactorKey =
  | "referral_priority"
  | "case_request_priority"
  | "case_request_ordered"
  | "waiting_time"
  | "referral_date"
  | "patient_age"
  | "distance_from_hospital"
  | "previous_no_show"
  | "insurance_priority"
  | "provider_preference"
  | "medical_urgency"
  | "follow_up_urgency"
  | "recommended_follow_up_window"
  | "last_visit_date"
  | "surgery_priority"
  | "required_follow_up_window"
  | "surgery_date";

export const RANKING_LOGIC_OPTIONS = [
  "High > Medium > Low",
  "Low > Medium > High",
  "Earlier Date First",
  "Later Date First",
  "Longest Waiting First",
  "Shortest Waiting First",
  "Yes First",
  "No First",
] as const;

export type RankingLogic = (typeof RANKING_LOGIC_OPTIONS)[number];

export type PriorityRuleRow = {
  id: string;
  factorKey: FactorKey;
  rankingLogic: RankingLogic;
};

export const FACTOR_DEFINITIONS: Record<
  FactorKey,
  { name: string; icon: LucideIcon; description: string }
> = {
  referral_priority: {
    name: "Referral Priority",
    icon: Flag,
    description: "Relative urgency encoded on the referral.",
  },
  case_request_priority: {
    name: "Case Request Priority",
    icon: Layers,
    description: "Priority tier assigned when the case request was submitted.",
  },
  case_request_ordered: {
    name: "Case Request Ordered",
    icon: ListOrdered,
    description: "Preserves stable ordering among otherwise equal requests.",
  },
  waiting_time: {
    name: "Waiting Time",
    icon: Clock,
    description: "Time elapsed since the patient became eligible for an appointment.",
  },
  referral_date: {
    name: "Referral Date",
    icon: Calendar,
    description: "Date the referral was received.",
  },
  patient_age: {
    name: "Patient Age",
    icon: User,
    description: "Patient age used for clinical prioritization policies.",
  },
  distance_from_hospital: {
    name: "Distance from Hospital",
    icon: MapPin,
    description: "Travel distance to the facility.",
  },
  previous_no_show: {
    name: "Previous No-show",
    icon: UserX,
    description: "Whether the patient has a recent missed appointment.",
  },
  insurance_priority: {
    name: "Insurance Priority",
    icon: Shield,
    description: "Contractual or plan-based scheduling tier.",
  },
  provider_preference: {
    name: "Provider Preference",
    icon: Stethoscope,
    description: "Match strength between requested and available providers.",
  },
  medical_urgency: {
    name: "Medical Urgency",
    icon: Activity,
    description: "Clinical urgency per triage and specialty guidance.",
  },
  follow_up_urgency: {
    name: "Follow-up Urgency",
    icon: AlertTriangle,
    description: "Urgency of the follow-up visit relative to prior care plan.",
  },
  recommended_follow_up_window: {
    name: "Recommended Follow-up Window",
    icon: CalendarRange,
    description: "How close the patient is to the recommended follow-up date.",
  },
  last_visit_date: {
    name: "Last Visit Date",
    icon: CalendarClock,
    description: "Date of the patient’s most recent visit.",
  },
  surgery_priority: {
    name: "Surgery Priority",
    icon: Crosshair,
    description: "Relative priority within the surgical program.",
  },
  required_follow_up_window: {
    name: "Required Follow-up Window",
    icon: Timer,
    description: "Proximity to the required post-operative follow-up window.",
  },
  surgery_date: {
    name: "Surgery Date",
    icon: Calendar,
    description: "Scheduled procedure date.",
  },
};

export const AVAILABLE_FACTORS_BY_TYPE: Record<AppointmentTypeId, FactorKey[]> = {
  "new-clinic": [
    "referral_priority",
    "case_request_priority",
    "case_request_ordered",
    "waiting_time",
    "referral_date",
    "patient_age",
    "distance_from_hospital",
    "previous_no_show",
    "insurance_priority",
    "provider_preference",
    "medical_urgency",
  ],
  "follow-up": [
    "follow_up_urgency",
    "case_request_ordered",
    "recommended_follow_up_window",
    "last_visit_date",
    "waiting_time",
    "referral_priority",
    "patient_age",
    "previous_no_show",
    "provider_preference",
    "medical_urgency",
  ],
  "post-surgery": [
    "surgery_priority",
    "case_request_priority",
    "referral_priority",
    "case_request_ordered",
    "required_follow_up_window",
    "surgery_date",
    "waiting_time",
    "patient_age",
    "medical_urgency",
  ],
};

export const DEFAULT_RULE_FACTORS: Record<AppointmentTypeId, FactorKey[]> = {
  "new-clinic": [
    "referral_priority",
    "case_request_priority",
    "case_request_ordered",
    "waiting_time",
    "referral_date",
  ],
  "follow-up": [
    "follow_up_urgency",
    "recommended_follow_up_window",
    "case_request_ordered",
    "last_visit_date",
    "waiting_time",
  ],
  "post-surgery": [
    "surgery_priority",
    "case_request_priority",
    "referral_priority",
    "required_follow_up_window",
    "case_request_ordered",
  ],
};

export const DEFAULT_RANKING_FOR_FACTOR: Partial<Record<FactorKey, RankingLogic>> = {
  referral_priority: "High > Medium > Low",
  case_request_priority: "High > Medium > Low",
  case_request_ordered: "Earlier Date First",
  waiting_time: "Longest Waiting First",
  referral_date: "Earlier Date First",
  follow_up_urgency: "High > Medium > Low",
  recommended_follow_up_window: "Earlier Date First",
  last_visit_date: "Earlier Date First",
  surgery_priority: "High > Medium > Low",
  required_follow_up_window: "Earlier Date First",
  surgery_date: "Earlier Date First",
  patient_age: "High > Medium > Low",
  distance_from_hospital: "Longest Waiting First",
  previous_no_show: "No First",
  insurance_priority: "High > Medium > Low",
  provider_preference: "High > Medium > Low",
  medical_urgency: "High > Medium > Low",
};

type SimScalar =
  | { kind: "tier"; a: "High" | "Medium" | "Low"; b: "High" | "Medium" | "Low" }
  | { kind: "date"; a: string; b: string }
  | { kind: "days"; a: number; b: number }
  | { kind: "boolean"; a: boolean; b: boolean }
  | { kind: "number"; a: number; b: number };

const TIER_SCORE: Record<"High" | "Medium" | "Low", number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

function compareTier(
  logic: RankingLogic,
  a: "High" | "Medium" | "Low",
  b: "High" | "Medium" | "Low",
): "tie" | "a" | "b" {
  const sa = TIER_SCORE[a];
  const sb = TIER_SCORE[b];
  if (sa === sb) return "tie";
  if (logic === "High > Medium > Low") return sa > sb ? "a" : "b";
  if (logic === "Low > Medium > High") return sa < sb ? "a" : "b";
  return "tie";
}

function compareDates(logic: RankingLogic, a: string, b: string): "tie" | "a" | "b" {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (ta === tb || Number.isNaN(ta) || Number.isNaN(tb)) return "tie";
  if (logic === "Earlier Date First") return ta < tb ? "a" : "b";
  if (logic === "Later Date First") return ta > tb ? "a" : "b";
  return "tie";
}

function compareDays(logic: RankingLogic, a: number, b: number): "tie" | "a" | "b" {
  if (a === b) return "tie";
  if (logic === "Longest Waiting First") return a > b ? "a" : "b";
  if (logic === "Shortest Waiting First") return a < b ? "a" : "b";
  return "tie";
}

function compareBoolean(logic: RankingLogic, a: boolean, b: boolean): "tie" | "a" | "b" {
  if (a === b) return "tie";
  if (logic === "Yes First") return a ? "a" : "b";
  if (logic === "No First") return !a ? "a" : "b";
  return "tie";
}

function compareNumbers(logic: RankingLogic, a: number, b: number): "tie" | "a" | "b" {
  if (a === b) return "tie";
  if (logic === "Longest Waiting First" || logic === "Later Date First") return a > b ? "a" : "b";
  if (logic === "Shortest Waiting First" || logic === "Earlier Date First") return a < b ? "a" : "b";
  return "tie";
}

export function compareRule(
  _factorKey: FactorKey,
  logic: RankingLogic,
  sim: SimScalar,
): "tie" | "a" | "b" {
  if (sim.kind === "tier") {
    if (logic === "Earlier Date First" || logic === "Later Date First") {
      return compareDates(
        logic,
        sim.a === "High" ? "2099-01-01" : sim.a === "Medium" ? "2026-06-01" : "2026-01-01",
        sim.b === "High" ? "2099-01-01" : sim.b === "Medium" ? "2026-06-01" : "2026-01-01",
      );
    }
    return compareTier(logic, sim.a, sim.b);
  }
  if (sim.kind === "date") return compareDates(logic, sim.a, sim.b);
  if (sim.kind === "days") return compareDays(logic, sim.a, sim.b);
  if (sim.kind === "boolean") return compareBoolean(logic, sim.a, sim.b);
  if (sim.kind === "number") return compareNumbers(logic, sim.a, sim.b);
  return "tie";
}

export const SIMULATOR_VALUES: Record<FactorKey, SimScalar & { labelA: string; labelB: string }> = {
  referral_priority: {
    kind: "tier",
    a: "Medium",
    b: "High",
    labelA: "Medium",
    labelB: "High",
  },
  case_request_priority: {
    kind: "tier",
    a: "High",
    b: "High",
    labelA: "High",
    labelB: "High",
  },
  case_request_ordered: {
    kind: "date",
    a: "2026-05-02",
    b: "2026-05-02",
    labelA: "May 2, 2026",
    labelB: "May 2, 2026",
  },
  waiting_time: {
    kind: "days",
    a: 18,
    b: 12,
    labelA: "18 days",
    labelB: "12 days",
  },
  referral_date: {
    kind: "date",
    a: "2026-04-10",
    b: "2026-04-18",
    labelA: "Apr 10, 2026",
    labelB: "Apr 18, 2026",
  },
  patient_age: {
    kind: "number",
    a: 67,
    b: 44,
    labelA: "67 years",
    labelB: "44 years",
  },
  distance_from_hospital: {
    kind: "number",
    a: 42,
    b: 8,
    labelA: "42 km",
    labelB: "8 km",
  },
  previous_no_show: {
    kind: "boolean",
    a: false,
    b: true,
    labelA: "No",
    labelB: "Yes",
  },
  insurance_priority: {
    kind: "tier",
    a: "Low",
    b: "Medium",
    labelA: "Low",
    labelB: "Medium",
  },
  provider_preference: {
    kind: "tier",
    a: "High",
    b: "Medium",
    labelA: "High match",
    labelB: "Medium match",
  },
  medical_urgency: {
    kind: "tier",
    a: "Medium",
    b: "Medium",
    labelA: "Medium",
    labelB: "Medium",
  },
  follow_up_urgency: {
    kind: "tier",
    a: "High",
    b: "Medium",
    labelA: "High",
    labelB: "Medium",
  },
  recommended_follow_up_window: {
    kind: "date",
    a: "2026-05-20",
    b: "2026-05-28",
    labelA: "Target May 20",
    labelB: "Target May 28",
  },
  last_visit_date: {
    kind: "date",
    a: "2026-03-01",
    b: "2026-03-01",
    labelA: "Mar 1, 2026",
    labelB: "Mar 1, 2026",
  },
  surgery_priority: {
    kind: "tier",
    a: "High",
    b: "Medium",
    labelA: "High",
    labelB: "Medium",
  },
  required_follow_up_window: {
    kind: "date",
    a: "2026-05-12",
    b: "2026-05-19",
    labelA: "Due May 12",
    labelB: "Due May 19",
  },
  surgery_date: {
    kind: "date",
    a: "2026-06-02",
    b: "2026-06-10",
    labelA: "Jun 2, 2026",
    labelB: "Jun 10, 2026",
  },
};

export function buildDefaultRules(type: AppointmentTypeId): PriorityRuleRow[] {
  return DEFAULT_RULE_FACTORS[type].map((factorKey) => ({
    id: `${type}:${factorKey}`,
    factorKey,
    rankingLogic:
      DEFAULT_RANKING_FOR_FACTOR[factorKey] ?? ("High > Medium > Low" as RankingLogic),
  }));
}

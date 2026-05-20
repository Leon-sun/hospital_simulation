# Hospital Scheduling Simulation Demo

This workspace contains a PostgreSQL/Supabase demo for event-centric hospital scheduling:

- `hospital_event_scheduling_demo.sql` creates the schema and loads demo data.
- `hospital_event_scheduling_seed.sql` reloads mock data into existing tables.
- `run_simulation.py` runs the Python simulation service.
- `dashboard_kpi_views.sql` creates dashboard KPI views without running the simulator.
- `app/` and `components/` contain the Next.js dashboard frontend.

The model is event-centric. It does not create a patient master table; `entity_id` and `case_id` are carried directly on events.

## Setup

### Simulation Service

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set your PostgreSQL or Supabase connection string:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
```

For Supabase, use the pooled or direct database URL from Project Settings. Add SSL options if your environment requires them, for example `?sslmode=require`.

### Frontend

Install the Node dependencies:

```bash
npm install
```

Run the dashboard locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

The What-if Simulation module is available at:

```text
http://127.0.0.1:3000/simulation/what-if
```

The Expected Log overview module is available at:

```text
http://127.0.0.1:3000/simulation/expected-log
```

The dashboard currently uses mocked API data from `lib/mock-dashboard-data.ts` and exposes it through `app/api/dashboard/route.ts`. Replace that route or the `getDashboardData` function when you are ready to connect a real API backed by the simulation tables.

The What-if Simulation module posts scenario conditions to:

```text
POST /api/simulation/run
```

Mock simulation logic lives in `lib/simulation-engine.ts`, the client service wrapper lives in `services/simulation-client.ts`, and the page UI lives in `components/simulation/what-if-simulation.tsx`.

## Expected Log Overview

The Expected Log - Activity Transition Overview page reads from:

```text
GET /api/expected-log/transition-overview?timeRange=last_4_weeks&specialty=Orthopedics
```

For this demo, the endpoint falls back to modular mock inputs in `services/expectedLogService.ts`. The API response is shaped like the future database-backed service: entry sources, activity nodes, transition edges, and summary KPI totals.

Expected counts are calculated in four passes:

1. Historical entry volumes are grouped by inferred entry point, such as Referral, Emergency, and Outpatient Entry.
2. Each entry point is assigned to one or more pathways using `FactEntryPointPathwayProbability`, so `expected_pathway_count = entry_source_count * pathway_probability`.
3. Pathway transitions are applied from `FactPathwayTransition`, so `expected_next_state_count = current_state_count * transition_probability`.
4. Nodes are aggregated by activity/state and edges are aggregated by source, target, and transition type for the flow visualization.

Repeat transitions are bounded with `max_repeat_count`. For example, `Follow-up Visit -> Follow-up Visit` with probability `0.383` and max repeat `3` calculates repeat round 1, round 2, and round 3, then stops so the expected-flow graph cannot loop forever.

Terminal states are marked when `is_terminal_state = true` or the target state contains discharge/closed language. Terminal nodes are returned as completed exit nodes. Non-terminal nodes are treated as waiting backlog in demo mode. When connected to live PostgreSQL data, the same service boundary can derive waiting counts from unscheduled `FactSchedulingEvent` rows and missing/completed `FactCalendarSlot` rows.

## Create Tables And Seed Data

For a new demo database, run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f hospital_event_scheduling_demo.sql
```

To reload only the mock data after the tables already exist:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f hospital_event_scheduling_seed.sql
```

## Run The Simulation

Run the default simulation:

```bash
python run_simulation.py
```

Useful options:

```bash
python run_simulation.py --simulation-days 30 --history-days 90
python run_simulation.py --demand-multiplier 1.25
python run_simulation.py --start-date 2026-05-12
python run_simulation.py --max-arrivals 50 --dry-run
python run_simulation.py --skip-views
```

The service:

1. Reads the past 3 months of `FactHospitalEvent`.
2. Estimates future arrivals for the next month using historical day-of-week, specialty, priority, event type, and source patterns.
3. Inserts generated arrival records into `FactHospitalEvent` with `table_source = 'simulation_service'`.
4. Assigns entry points from `DimEntryPoint`.
5. Assigns pathways using `FactEntryPointPathwayProbability`.
6. Walks pathway transitions using `FactPathwayTransition` probabilities.
7. Creates outpatient and surgery queue events in `FactSchedulingEvent`.
8. Estimates outpatient durations from `DimOutpatientDurationRule`.
9. Estimates surgery durations from `DimSurgeryDurationDistribution`.
10. Assigns event labels in `BridgeEventLabel`.
11. Calculates scheduling priority scores from priority level plus active `DimSchedulingRule` label rules.
12. Schedules events into `FactOutpatientCapacity` and `FactSurgeryCapacity`.
13. Creates `FactCalendarSlot` rows for scheduled events.
14. Leaves unscheduled events as backlog.

The existing schema allows `Queued`, `Ready`, `Scheduled`, `Completed`, and `Cancelled` statuses. The simulator therefore represents pending backlog as `FactSchedulingEvent.status = 'Queued'` with no `FactCalendarSlot`.

## Dashboard Views

The simulator creates these views automatically unless `--skip-views` is used:

- `vw_scheduling_event_waits`
- `vw_dashboard_kpi_summary`
- `vw_wait_time_distribution`
- `vw_backlog_by_priority`
- `vw_average_wait_time_by_priority`

To create or refresh them manually:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f dashboard_kpi_views.sql
```

Example KPI queries:

```sql
SELECT * FROM vw_dashboard_kpi_summary;
SELECT * FROM vw_wait_time_distribution ORDER BY wait_time_bucket;
SELECT * FROM vw_backlog_by_priority ORDER BY backlog_count DESC;
SELECT * FROM vw_average_wait_time_by_priority;
```

## Notes

The service appends simulation output to the existing tables. For a clean run, reload the seed data first with `hospital_event_scheduling_seed.sql`.

Calendar slots are created only when matching future capacity exists. If too many high-priority arrivals are generated or capacity is exhausted, remaining events stay in the queued backlog.

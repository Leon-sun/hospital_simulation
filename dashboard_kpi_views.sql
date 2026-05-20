-- Dashboard KPI views for the hospital scheduling simulation demo.
-- These views use the existing event, slot, and status tables.

CREATE OR REPLACE VIEW vw_scheduling_event_waits AS
SELECT
    e.event_id,
    e.case_id,
    e.event_category,
    e.specialty,
    e.priority,
    e.status,
    e.created_at,
    e.ready_at,
    s.slot_id,
    s.scheduled_start,
    s.scheduled_end,
    s.slot_status,
    CASE
        WHEN e.ready_at IS NULL THEN NULL
        WHEN s.scheduled_start IS NOT NULL THEN
            GREATEST(0, s.scheduled_start::date - e.ready_at::date)
        ELSE
            GREATEST(0, CURRENT_DATE - e.ready_at::date)
    END AS wait_days,
    CASE
        WHEN s.event_id IS NULL AND e.status IN ('Queued', 'Ready') THEN true
        ELSE false
    END AS is_backlog
FROM "FactSchedulingEvent" e
LEFT JOIN LATERAL (
    SELECT
        slot_id,
        event_id,
        scheduled_start,
        scheduled_end,
        slot_status
    FROM "FactCalendarSlot" s
    WHERE s.event_id = e.event_id
      AND s.slot_status IN ('Booked', 'Held', 'Completed')
    ORDER BY s.scheduled_start
    LIMIT 1
) s ON true;

CREATE OR REPLACE VIEW vw_dashboard_kpi_summary AS
SELECT
    COUNT(*) FILTER (WHERE is_backlog) AS total_backlog,
    COUNT(*) FILTER (
        WHERE created_at >= date_trunc('week', CURRENT_DATE)::timestamp
    ) AS added_this_week,
    COUNT(*) FILTER (
        WHERE slot_status = 'Completed'
          AND scheduled_start >= date_trunc('week', CURRENT_DATE)::timestamp
    ) AS completed_this_week,
    ROUND(AVG(wait_days)::numeric, 2) AS average_wait_days,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY wait_days)
        FILTER (WHERE wait_days IS NOT NULL) AS median_wait_days,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY wait_days)
        FILTER (WHERE wait_days IS NOT NULL) AS p90_wait_days,
    ROUND(
        100.0
        * COUNT(*) FILTER (WHERE is_backlog AND wait_days > 180)
        / NULLIF(COUNT(*) FILTER (WHERE is_backlog), 0),
        2
    ) AS percent_backlog_over_6_months
FROM vw_scheduling_event_waits;

CREATE OR REPLACE VIEW vw_wait_time_distribution AS
SELECT
    CASE
        WHEN wait_days IS NULL THEN 'unknown'
        WHEN wait_days <= 7 THEN '0-7 days'
        WHEN wait_days <= 30 THEN '8-30 days'
        WHEN wait_days <= 90 THEN '31-90 days'
        WHEN wait_days <= 180 THEN '91-180 days'
        ELSE '181+ days'
    END AS wait_time_bucket,
    COUNT(*) AS event_count
FROM vw_scheduling_event_waits
GROUP BY 1;

CREATE OR REPLACE VIEW vw_backlog_by_priority AS
SELECT
    priority,
    COUNT(*) AS backlog_count
FROM vw_scheduling_event_waits
WHERE is_backlog
GROUP BY priority;

CREATE OR REPLACE VIEW vw_average_wait_time_by_priority AS
SELECT
    priority,
    ROUND(AVG(wait_days)::numeric, 2) AS average_wait_days,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY wait_days)
        FILTER (WHERE wait_days IS NOT NULL) AS median_wait_days,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY wait_days)
        FILTER (WHERE wait_days IS NOT NULL) AS p90_wait_days
FROM vw_scheduling_event_waits
GROUP BY priority;


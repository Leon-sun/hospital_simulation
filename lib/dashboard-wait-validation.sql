-- Debug validation: surgical wait = Surgery.start_datetime - CaseRequest.start_datetime
-- Run against the seeded hospital scheduling demo database.
-- Replace :priority_filter with a literal or session variable as needed.

-- 1) Count cases by selected priority (FactSchedulingEvent)
SELECT se.priority AS scheduling_priority, COUNT(*) AS case_count
FROM "FactSchedulingEvent" se
GROUP BY se.priority
ORDER BY se.priority;

-- 2) Average surgery request → surgery wait (hours) by priority
WITH per_case AS (
    SELECT
        se.case_id,
        se.priority,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 3600.0 AS wait_hours
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    GROUP BY se.case_id, se.priority
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT priority, ROUND(AVG(wait_hours)::numeric, 4) AS avg_wait_hours, COUNT(*) AS case_count
FROM per_case
GROUP BY priority
ORDER BY priority;

-- 3) Median wait (hours) by priority
WITH per_case AS (
    SELECT
        se.case_id,
        se.priority,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 3600.0 AS wait_hours
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    GROUP BY se.case_id, se.priority
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT
    priority,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wait_hours) AS median_wait_hours,
    COUNT(*) AS case_count
FROM per_case
GROUP BY priority
ORDER BY priority;

-- 4) Percent over max target by priority (strictly greater than max)
WITH per_case AS (
    SELECT
        se.case_id,
        se.priority,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 3600.0 AS wait_hours
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    GROUP BY se.case_id, se.priority
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
),
lagged AS (
    SELECT
        *,
        CASE priority
            WHEN 'Emergency 1A' THEN wait_hours > 2
            WHEN 'Urgent 1B' THEN wait_hours > 8
            WHEN 'Urgent 1C' THEN wait_hours > 48
            WHEN 'Urgent 1D' THEN wait_hours > 7 * 24
            WHEN 'Urgent 1E' THEN wait_hours > 14 * 24
            WHEN 'Elective' THEN wait_hours > 180 * 24
            ELSE false
        END AS exceeded
    FROM per_case
)
SELECT
    priority,
    ROUND((100.0 * SUM(CASE WHEN exceeded THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::numeric, 2) AS pct_over_target,
    COUNT(*) AS case_count
FROM lagged
GROUP BY priority
ORDER BY priority;

-- 5) Sample 10 timelines for Urgent 1B
WITH per_case AS (
    SELECT
        se.case_id,
        se.priority,
        MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) AS surgery_request_time,
        MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) AS surgery_start_time
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Urgent 1B'
    GROUP BY se.case_id, se.priority
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT
    case_id,
    surgery_request_time,
    surgery_start_time,
    EXTRACT(EPOCH FROM (surgery_start_time - surgery_request_time)) / 3600.0 AS wait_hours,
    8::numeric AS target_max_hours,
    (EXTRACT(EPOCH FROM (surgery_start_time - surgery_request_time)) / 3600.0) > 8 AS exceeded_target
FROM per_case
ORDER BY surgery_request_time
LIMIT 10;

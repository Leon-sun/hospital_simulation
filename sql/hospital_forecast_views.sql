-- Pathway-based demand forecasting for the hospital scheduling demo.
--
-- Modeling assumptions (documented for analysts):
--   1. Arrival rates use the trailing 28 calendar days of entry-point hospital events.
--   2. Next-week arrivals = ROUND(average weekly arrivals over that window).
--   3. Downstream volumes propagate through FactPathwayTransition probabilities.
--   4. Forecasts are expected event counts, not booked appointments.
--   5. Capacity / slot availability is modeled separately in FactCalendarSlot.

CREATE OR REPLACE FUNCTION fn_pathway_repeat_expected(
    base_count numeric,
    probability numeric,
    max_repeat_count integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
SELECT CASE
    WHEN base_count IS NULL OR base_count = 0 OR max_repeat_count <= 0 THEN 0::numeric
    WHEN probability = 0 THEN 0::numeric
    WHEN probability = 1 THEN base_count * max_repeat_count::numeric
    ELSE base_count * probability * (1 - POWER(probability, max_repeat_count)) / (1 - probability)
END;
$$;

CREATE OR REPLACE VIEW vw_entry_point_arrival_rate_4w AS
SELECT
    h.event_type AS entry_point_event_type,
    h.specialty,
    COALESCE(h.priority, '') AS priority,
    COUNT(*)::integer AS total_arrivals_4w,
    ROUND(COUNT(*)::numeric / 4.0, 2) AS avg_weekly_arrivals,
    ROUND(COUNT(*)::numeric / 4.0)::integer AS estimated_next_week_arrivals
FROM "FactHospitalEvent" h
WHERE h.event_type IN (
    'Emerg_Admit',
    'Emerg_Sent_To_Or',
    'Referral',
    'New Clinic Visit'
)
  AND h.start_datetime >= CURRENT_DATE - INTERVAL '28 days'
  AND h.start_datetime < CURRENT_DATE + INTERVAL '1 day'
GROUP BY
    h.event_type,
    h.specialty,
    COALESCE(h.priority, '');

COMMENT ON VIEW vw_entry_point_arrival_rate_4w IS
    'Trailing 28-day entry-point arrival rates by event type, specialty, and priority.';

CREATE OR REPLACE VIEW vw_entry_point_case_priority_mix_4w AS
SELECT
    h.event_type AS entry_point_event_type,
    h.specialty,
    COALESCE(h.priority, '') AS entry_point_priority,
    fc.priority_detail AS case_priority,
    COUNT(*)::integer AS case_count_4w,
    ROUND(
        COUNT(*)::numeric
        / NULLIF(
            SUM(COUNT(*)) OVER (
                PARTITION BY h.event_type, h.specialty, COALESCE(h.priority, '')
            ),
            0
        ),
        5
    ) AS case_priority_share
FROM "FactHospitalEvent" h
JOIN "FactCase" fc
    ON fc.case_id = h.case_id
WHERE h.event_type IN (
    'Emerg_Admit',
    'Emerg_Sent_To_Or',
    'Referral',
    'New Clinic Visit'
)
  AND h.start_datetime >= CURRENT_DATE - INTERVAL '28 days'
  AND h.start_datetime < CURRENT_DATE + INTERVAL '1 day'
GROUP BY
    h.event_type,
    h.specialty,
    COALESCE(h.priority, ''),
    fc.priority_detail;

CREATE OR REPLACE VIEW vw_pathway_transition_rates AS
SELECT
    t.entry_point_name,
    t.entry_point_priority,
    t.case_priority,
    p.specialty,
    t.current_state,
    t.next_state,
    ROUND(AVG(t.probability)::numeric, 5) AS probability,
    MAX(t.max_repeat_count) AS max_repeat_count,
    bool_or(t.is_terminal_state) AS is_terminal_state,
    MIN(t.action_type) AS action_type
FROM "FactPathwayTransition" t
JOIN "DimPathway" p
    ON p.pathway_id = t.pathway_id
GROUP BY
    t.entry_point_name,
    t.entry_point_priority,
    t.case_priority,
    p.specialty,
    t.current_state,
    t.next_state;

CREATE OR REPLACE VIEW vw_expected_downstream_events_next_week AS
SELECT
    a.entry_point_event_type,
    a.specialty,
    a.priority AS entry_point_priority,
    tr.case_priority,
    tr.current_state,
    tr.next_state,
    a.estimated_next_week_arrivals,
    tr.probability,
    ROUND(
        a.estimated_next_week_arrivals::numeric * tr.probability,
        2
    ) AS estimated_next_events
FROM vw_entry_point_arrival_rate_4w a
JOIN vw_pathway_transition_rates tr
    ON tr.entry_point_name = a.entry_point_event_type
   AND tr.specialty = a.specialty
   AND tr.current_state = a.entry_point_event_type
   AND tr.entry_point_priority IS NOT DISTINCT FROM NULLIF(a.priority, '');

COMMENT ON VIEW vw_expected_downstream_events_next_week IS
    'One-step downstream forecast from entry arrivals to the first pathway transition.';

CREATE OR REPLACE VIEW vw_forecast_pathway_events_next_week AS
WITH RECURSIVE entry_arrivals AS (
    SELECT *
    FROM vw_entry_point_arrival_rate_4w
),
pathway_weights AS (
    SELECT
        ea.entry_point_event_type,
        ea.specialty,
        ea.priority AS entry_point_priority,
        ea.estimated_next_week_arrivals,
        p.pathway_id,
        epp.probability AS pathway_probability
    FROM entry_arrivals ea
    JOIN "DimEntryPoint" dep
        ON dep.entry_point_name = ea.entry_point_event_type
    JOIN "FactEntryPointPathwayProbability" epp
        ON epp.entry_point_id = dep.entry_point_id
       AND (
           epp.effective_end_date IS NULL
           OR epp.effective_end_date >= CURRENT_DATE
       )
    JOIN "DimPathway" p
        ON p.pathway_id = epp.pathway_id
       AND p.specialty = ea.specialty
),
case_mix AS (
    SELECT *
    FROM vw_entry_point_case_priority_mix_4w
),
case_mix_fallback AS (
    SELECT
        ea.entry_point_event_type,
        ea.specialty,
        ea.priority AS entry_point_priority,
        cp.case_priority,
        1.0 / 6.0 AS case_priority_share
    FROM entry_arrivals ea
    CROSS JOIN (
        VALUES
            ('1A'),
            ('1B'),
            ('1C'),
            ('1D'),
            ('1E'),
            ('Elective')
    ) AS cp(case_priority)
),
effective_case_mix AS (
    SELECT *
    FROM case_mix
    WHERE case_priority_share IS NOT NULL
      AND case_priority_share > 0

    UNION ALL

    SELECT
        fb.entry_point_event_type,
        fb.specialty,
        fb.entry_point_priority,
        fb.case_priority,
        0 AS case_count_4w,
        fb.case_priority_share
    FROM case_mix_fallback fb
    WHERE NOT EXISTS (
        SELECT 1
        FROM case_mix cm
        WHERE cm.entry_point_event_type = fb.entry_point_event_type
          AND cm.specialty = fb.specialty
          AND cm.entry_point_priority = fb.entry_point_priority
    )
),
seed AS (
    SELECT
        0 AS forecast_step,
        pw.entry_point_event_type,
        pw.specialty,
        pw.entry_point_priority,
        ecm.case_priority,
        pw.pathway_id,
        tr.current_state,
        tr.next_state,
        CASE
            WHEN tr.current_state = tr.next_state THEN
                fn_pathway_repeat_expected(
                    pw.estimated_next_week_arrivals::numeric
                    * pw.pathway_probability
                    * ecm.case_priority_share,
                    tr.probability,
                    tr.max_repeat_count
                )
            ELSE
                pw.estimated_next_week_arrivals::numeric
                * pw.pathway_probability
                * ecm.case_priority_share
                * tr.probability
        END AS estimated_event_count,
        tr.probability AS step_probability,
        tr.is_terminal_state,
        tr.max_repeat_count,
        tr.action_type,
        tr.current_state = tr.next_state AS is_repeat_edge
    FROM pathway_weights pw
    JOIN effective_case_mix ecm
        ON ecm.entry_point_event_type = pw.entry_point_event_type
       AND ecm.specialty = pw.specialty
       AND ecm.entry_point_priority = pw.entry_point_priority
    JOIN vw_pathway_transition_rates tr
        ON tr.entry_point_name = pw.entry_point_event_type
       AND tr.specialty = pw.specialty
       AND tr.current_state = pw.entry_point_event_type
       AND tr.entry_point_priority IS NOT DISTINCT FROM NULLIF(pw.entry_point_priority, '')
       AND tr.case_priority = ecm.case_priority
),
forecast AS (
    SELECT *
    FROM seed

    UNION ALL

    SELECT
        f.forecast_step + 1,
        f.entry_point_event_type,
        f.specialty,
        f.entry_point_priority,
        f.case_priority,
        f.pathway_id,
        tr.current_state,
        tr.next_state,
        CASE
            WHEN tr.current_state = tr.next_state THEN
                fn_pathway_repeat_expected(
                    f.estimated_event_count,
                    tr.probability,
                    tr.max_repeat_count
                )
            ELSE
                f.estimated_event_count * tr.probability
        END AS estimated_event_count,
        tr.probability AS step_probability,
        tr.is_terminal_state,
        tr.max_repeat_count,
        tr.action_type,
        tr.current_state = tr.next_state AS is_repeat_edge
    FROM forecast f
    JOIN vw_pathway_transition_rates tr
        ON tr.entry_point_name = f.entry_point_event_type
       AND tr.specialty = f.specialty
       AND tr.case_priority = f.case_priority
       AND tr.current_state = f.next_state
       AND tr.entry_point_priority IS NOT DISTINCT FROM NULLIF(f.entry_point_priority, '')
    WHERE f.forecast_step < 8
      AND NOT f.is_terminal_state
      AND f.estimated_event_count > 0.0001
)
SELECT
    forecast_step,
    entry_point_event_type,
    specialty,
    entry_point_priority,
    case_priority,
    pathway_id,
    current_state,
    next_state,
    ROUND(estimated_event_count, 2) AS estimated_event_count,
    step_probability,
    is_terminal_state,
    max_repeat_count,
    action_type,
    is_repeat_edge
FROM forecast;

COMMENT ON VIEW vw_forecast_pathway_events_next_week IS
    'Multi-step pathway forecast for next week (max depth 8) from 28-day entry arrivals.';

CREATE OR REPLACE FUNCTION fn_forecast_pathway_events_next_week()
RETURNS TABLE (
    forecast_step integer,
    entry_point_event_type text,
    specialty text,
    entry_point_priority text,
    case_priority text,
    pathway_id uuid,
    current_state text,
    next_state text,
    estimated_event_count numeric,
    step_probability numeric,
    is_terminal_state boolean,
    max_repeat_count integer,
    action_type text,
    is_repeat_edge boolean
)
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM vw_forecast_pathway_events_next_week;
$$;

CREATE OR REPLACE VIEW vw_surgery_service_minutes_4w AS
SELECT
    h.specialty,
    ROUND(
        AVG(EXTRACT(EPOCH FROM (h.end_datetime - h.start_datetime)) / 60.0)
    )::integer AS avg_surgery_minutes
FROM "FactHospitalEvent" h
WHERE h.event_type = 'Surgery'
  AND h.end_datetime IS NOT NULL
  AND h.start_datetime >= CURRENT_DATE - INTERVAL '28 days'
GROUP BY h.specialty;

CREATE OR REPLACE VIEW vw_next_week_event_demand_summary AS
WITH forecast_totals AS (
    SELECT
        f.next_state,
        f.specialty,
        f.case_priority,
        ROUND(SUM(f.estimated_event_count), 2) AS total_estimated_events
    FROM vw_forecast_pathway_events_next_week f
    GROUP BY
        f.next_state,
        f.specialty,
        f.case_priority
)
SELECT
    ft.next_state,
    ft.specialty,
    ft.case_priority,
    ft.total_estimated_events,
    CASE ft.next_state
        WHEN 'New Clinic Visit' THEN 45
        WHEN 'Follow-up Clinic Visit' THEN 30
        WHEN 'Post-Surgery Clinic Visit' THEN 30
        WHEN 'CaseRequest' THEN 30
        WHEN 'Surgery' THEN COALESCE(sm.avg_surgery_minutes, 120)
        WHEN 'Referral' THEN 15
        WHEN 'Emerg_Admit' THEN 15
        WHEN 'Emerg_Sent_To_Or' THEN 15
        ELSE 30
    END AS service_minutes_per_event,
    ROUND(
        ft.total_estimated_events
        * CASE ft.next_state
            WHEN 'New Clinic Visit' THEN 45
            WHEN 'Follow-up Clinic Visit' THEN 30
            WHEN 'Post-Surgery Clinic Visit' THEN 30
            WHEN 'CaseRequest' THEN 30
            WHEN 'Surgery' THEN COALESCE(sm.avg_surgery_minutes, 120)
            WHEN 'Referral' THEN 15
            WHEN 'Emerg_Admit' THEN 15
            WHEN 'Emerg_Sent_To_Or' THEN 15
            ELSE 30
        END,
        0
    )::bigint AS total_service_minutes
FROM forecast_totals ft
LEFT JOIN vw_surgery_service_minutes_4w sm
    ON sm.specialty = ft.specialty;

COMMENT ON VIEW vw_next_week_event_demand_summary IS
    'Aggregated next-week demand by downstream event type with default or historical service minutes.';

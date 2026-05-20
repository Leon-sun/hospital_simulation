-- Event-type pathway transitions (specialty × entry_point × entry_point_priority × case_priority)
-- Included from hospital_event_scheduling_demo.sql and hospital_event_scheduling_seed.sql

WITH case_request_progression (
    case_priority,
    prob_case_to_surgery,
    prob_case_to_followup,
    prob_followup_to_surgery
) AS (
    VALUES
        ('1A', 1.00000, 0.00000, 0.00000),
        ('1B', 0.90000, 0.10000, 1.00000),
        ('1C', 0.90000, 0.10000, 1.00000),
        ('1D', 0.75000, 0.25000, 1.00000),
        ('1E', 0.75000, 0.25000, 1.00000),
        ('Elective', 0.70000, 0.30000, 1.00000)
),
pathway_scopes (
    entry_point_name,
    entry_point_priority,
    case_priority,
    path_variant
) AS (
    SELECT 'Emerg_Sent_To_Or', NULL::text, cp.case_priority, NULL::text
    FROM case_request_progression cp

    UNION ALL
    SELECT 'Emerg_Admit', NULL, cp.case_priority, NULL
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'

    UNION ALL
    SELECT 'Emerg_Admit', NULL, '1A', NULL

    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, NULL
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)

    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_before_case_request'
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'

    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request'
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'

    UNION ALL
    SELECT 'Referral', ep, '1A', pv
    FROM (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    CROSS JOIN (VALUES
        ('second_followup_before_case_request'),
        ('second_followup_after_case_request')
    ) AS pv(path_variant)

    UNION ALL
    SELECT 'New Clinic Visit', NULL, cp.case_priority, NULL
    FROM case_request_progression cp
),
transition_edges (
    entry_point_name,
    entry_point_priority,
    case_priority,
    path_variant,
    current_state,
    next_state,
    probability,
    action_type,
    is_terminal_state,
    max_repeat_count
) AS (
    -- Emerg_Sent_To_Or
    SELECT 'Emerg_Sent_To_Or', NULL, cp.case_priority, NULL, 'Emerg_Sent_To_Or', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp

    UNION ALL
    -- Emerg_Admit (non-1A)
    SELECT 'Emerg_Admit', NULL, cp.case_priority, NULL, 'Emerg_Admit', 'CaseRequest', 0.85000, 'create_case_request', false, 1
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Emerg_Admit', NULL, cp.case_priority, NULL, 'Emerg_Admit', 'New Clinic Visit', 0.15000, 'schedule_new_clinic_visit', false, 1
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Emerg_Admit', NULL, cp.case_priority, NULL, 'New Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'

    UNION ALL
    -- Emerg_Admit (1A)
    SELECT 'Emerg_Admit', NULL, '1A', NULL, 'Emerg_Admit', 'CaseRequest', 1.00000, 'create_case_request', false, 1

    UNION ALL
    -- Referral P1/P2 clinic chain (non-1A)
    SELECT 'Referral', ep, cp.case_priority, NULL, 'Referral', 'New Clinic Visit', 1.00000, 'schedule_new_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, NULL, 'New Clinic Visit', 'Follow-up Clinic Visit', 1.00000, 'schedule_followup_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, NULL, 'Follow-up Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'

    UNION ALL
    -- Referral P1/P2 (1A shortcut)
    SELECT 'Referral', ep, '1A', NULL, 'Referral', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)

    UNION ALL
    -- Referral P1/P2 Elective extra follow-up before CaseRequest
    SELECT 'Referral', ep, 'Elective', NULL, 'Follow-up Clinic Visit', 'Follow-up Clinic Visit', 0.35000, 'repeat_followup_clinic_visit', false, 2
    FROM (VALUES ('P1'), ('P2')) AS ep(entry_point_priority)

    UNION ALL
    -- Referral P3/P4 variant A (second follow-up before CaseRequest)
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_before_case_request', 'Referral', 'New Clinic Visit', 1.00000, 'schedule_new_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_before_case_request', 'New Clinic Visit', 'Follow-up Clinic Visit', 1.00000, 'schedule_followup_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_before_case_request', 'Follow-up Clinic Visit', 'Follow-up Clinic Visit', 1.00000, 'repeat_followup_clinic_visit', false, 2
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_before_case_request', 'Follow-up Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'

    UNION ALL
    -- Referral P3/P4 variant B (second follow-up after CaseRequest)
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request', 'Referral', 'New Clinic Visit', 1.00000, 'schedule_new_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request', 'New Clinic Visit', 'Follow-up Clinic Visit', 1.00000, 'schedule_followup_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request', 'Follow-up Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request', 'CaseRequest', 'Follow-up Clinic Visit', 1.00000, 'schedule_followup_clinic_visit', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'Referral', ep, cp.case_priority, 'second_followup_after_case_request', 'Follow-up Clinic Visit', 'Surgery', 1.00000, 'schedule_surgery', false, 1
    FROM case_request_progression cp
    CROSS JOIN (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    WHERE cp.case_priority <> '1A'

    UNION ALL
    -- Referral P3/P4 1A shortcut (both variants)
    SELECT 'Referral', ep, '1A', pv, 'Referral', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM (VALUES ('P3'), ('P4')) AS ep(entry_point_priority)
    CROSS JOIN (VALUES
        ('second_followup_before_case_request'),
        ('second_followup_after_case_request')
    ) AS pv(path_variant)

    UNION ALL
    -- New Clinic Visit entry pathway
    SELECT 'New Clinic Visit', NULL, cp.case_priority, NULL, 'New Clinic Visit', 'Follow-up Clinic Visit', 1.00000, 'schedule_followup_clinic_visit', false, 1
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'New Clinic Visit', NULL, cp.case_priority, NULL, 'Follow-up Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    FROM case_request_progression cp
    WHERE cp.case_priority <> '1A'
    UNION ALL
    SELECT 'New Clinic Visit', NULL, '1A', NULL, 'New Clinic Visit', 'CaseRequest', 1.00000, 'create_case_request', false, 1
    UNION ALL
    SELECT 'New Clinic Visit', NULL, 'Elective', NULL, 'Follow-up Clinic Visit', 'Follow-up Clinic Visit', 0.30000, 'repeat_followup_clinic_visit', false, 2

    UNION ALL
    -- CaseRequest progression (standard paths)
    SELECT ps.entry_point_name, ps.entry_point_priority, ps.case_priority, ps.path_variant,
           'CaseRequest', 'Surgery', cp.prob_case_to_surgery, 'schedule_surgery', false, 1
    FROM pathway_scopes ps
    JOIN case_request_progression cp ON ps.case_priority = cp.case_priority
    WHERE cp.prob_case_to_surgery > 0
      AND ps.path_variant IS DISTINCT FROM 'second_followup_after_case_request'

    UNION ALL
    SELECT ps.entry_point_name, ps.entry_point_priority, ps.case_priority, ps.path_variant,
           'CaseRequest', 'Follow-up Clinic Visit', cp.prob_case_to_followup, 'schedule_followup_clinic_visit', false, 1
    FROM pathway_scopes ps
    JOIN case_request_progression cp ON ps.case_priority = cp.case_priority
    WHERE cp.prob_case_to_followup > 0
      AND ps.path_variant IS DISTINCT FROM 'second_followup_after_case_request'

    UNION ALL
    SELECT ps.entry_point_name, ps.entry_point_priority, ps.case_priority, ps.path_variant,
           'Follow-up Clinic Visit', 'Surgery', cp.prob_followup_to_surgery, 'schedule_surgery', false, 1
    FROM pathway_scopes ps
    JOIN case_request_progression cp ON ps.case_priority = cp.case_priority
    WHERE cp.prob_case_to_followup > 0
      AND ps.path_variant IS DISTINCT FROM 'second_followup_after_case_request'

    UNION ALL
    -- Surgery tail + post-surgery repeats (standard paths)
    SELECT ps.entry_point_name, ps.entry_point_priority, ps.case_priority, ps.path_variant,
           st.current_state, st.next_state, st.probability, st.action_type, st.is_terminal_state, st.max_repeat_count
    FROM pathway_scopes ps
    CROSS JOIN (VALUES
        ('Surgery', 'Post-Surgery Clinic Visit', 1.00000, 'schedule_post_surgery_clinic_visit', false, 1),
        ('Post-Surgery Clinic Visit', 'Post-Surgery Clinic Visit', 0.30000, 'repeat_post_surgery_clinic_visit', false, 2),
        ('Post-Surgery Clinic Visit', 'Post-Surgery Clinic Visit', 0.05000, 'repeat_post_surgery_clinic_visit', false, 3)
    ) AS st(current_state, next_state, probability, action_type, is_terminal_state, max_repeat_count)
    WHERE ps.path_variant IS DISTINCT FROM 'second_followup_after_case_request'

    UNION ALL
    SELECT ps.entry_point_name, ps.entry_point_priority, ps.case_priority, ps.path_variant,
           st.current_state, st.next_state, st.probability, st.action_type, st.is_terminal_state, st.max_repeat_count
    FROM pathway_scopes ps
    CROSS JOIN (VALUES
        ('Surgery', 'Post-Surgery Clinic Visit', 1.00000, 'schedule_post_surgery_clinic_visit', false, 1),
        ('Post-Surgery Clinic Visit', 'Post-Surgery Clinic Visit', 0.30000, 'repeat_post_surgery_clinic_visit', false, 2),
        ('Post-Surgery Clinic Visit', 'Post-Surgery Clinic Visit', 0.05000, 'repeat_post_surgery_clinic_visit', false, 3)
    ) AS st(current_state, next_state, probability, action_type, is_terminal_state, max_repeat_count)
    WHERE ps.path_variant = 'second_followup_after_case_request'
),
transition_template AS (
    SELECT DISTINCT
        te.entry_point_name,
        te.entry_point_priority,
        te.case_priority,
        te.path_variant,
        te.current_state,
        te.next_state,
        te.probability,
        te.action_type,
        te.is_terminal_state,
        te.max_repeat_count
    FROM transition_edges te
    INNER JOIN pathway_scopes ps
        ON ps.entry_point_name = te.entry_point_name
       AND ps.entry_point_priority IS NOT DISTINCT FROM te.entry_point_priority
       AND ps.case_priority IS NOT DISTINCT FROM te.case_priority
       AND ps.path_variant IS NOT DISTINCT FROM te.path_variant
)
INSERT INTO "FactPathwayTransition" (
    pathway_transition_id,
    pathway_id,
    entry_point_name,
    entry_point_priority,
    case_priority,
    path_variant,
    current_state,
    next_state,
    probability,
    action_type,
    is_terminal_state,
    max_repeat_count
)
SELECT
    gen_random_uuid(),
    p.pathway_id,
    t.entry_point_name,
    t.entry_point_priority,
    t.case_priority,
    t.path_variant,
    t.current_state,
    t.next_state,
    LEAST(
        1.00000,
        GREATEST(
            0.00001,
            t.probability * CASE p.specialty
                WHEN 'Orthopedics' THEN 1.000
                WHEN 'Cardiology' THEN 0.995
                WHEN 'Oncology' THEN 1.005
                WHEN 'General Surgery' THEN 0.998
                ELSE 1.002
            END
        )
    ),
    t.action_type,
    t.is_terminal_state,
    t.max_repeat_count
FROM transition_template t
CROSS JOIN "DimPathway" p;

-- Hospital event-processing and scheduling simulation seed data
-- Run this after creating the tables in hospital_event_scheduling_demo.sql.
-- Inserts mock data. Ensures "BridgeEventLabel" exists (older demo DDL may omit it)
-- before TRUNCATE/INSERT; requires "FactSchedulingEvent" and "DimEventLabel" from demo.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT setseed(0.4242);

CREATE TABLE IF NOT EXISTS "BridgeEventLabel" (
    event_id uuid NOT NULL REFERENCES "FactSchedulingEvent" (event_id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES "DimEventLabel" (label_id),
    assigned_at timestamp NOT NULL DEFAULT now(),
    source text NOT NULL,
    PRIMARY KEY (event_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_bridge_event_label_label_id
    ON "BridgeEventLabel" (label_id);

TRUNCATE TABLE
    "BridgeEventLabel",
    "FactCalendarSlot",
    "FactCase",
    "FactHospitalEvent",
    "FactSchedulingEvent",
    "FactPathwayTransition",
    "FactEntryPointPathwayProbability",
    "FactSurgeryCapacity",
    "FactOutpatientCapacity",
    "DimSchedulingRule",
    "DimSurgeryDurationDistribution",
    "FactHistoricalEventDuration",
    "DimOutpatientDurationRule",
    "DimEventLabel",
    "DimEntryPoint",
    "DimPathway"
RESTART IDENTITY CASCADE;

INSERT INTO "DimPathway" (pathway_id, pathway_name, specialty, description)
VALUES
    (gen_random_uuid(), 'Orthopedics Fracture Clinic', 'Orthopedics', 'Assessment and follow-up pathway for orthopedic injuries and fracture clinic reviews.'),
    (gen_random_uuid(), 'Orthopedics Elective Joint Surgery', 'Orthopedics', 'Pre-operative readiness and booking pathway for elective orthopedic surgery.'),
    (gen_random_uuid(), 'Cardiology Diagnostic Follow-up', 'Cardiology', 'Follow-up pathway after ECG, echo, stress test, or ambulatory monitoring results.'),
    (gen_random_uuid(), 'Cardiology Procedure Review', 'Cardiology', 'Procedure booking pathway for cardiac device, catheterization, or interventional cardiology cases.'),
    (gen_random_uuid(), 'Oncology Treatment Planning', 'Oncology', 'Multidisciplinary oncology treatment planning, consult, and routine review.'),
    (gen_random_uuid(), 'Oncology Surgical Review', 'Oncology', 'Surgical oncology review and operating room booking pathway.'),
    (gen_random_uuid(), 'General Surgery Consult', 'General Surgery', 'Consult and diagnostic review pathway for general surgery referrals.'),
    (gen_random_uuid(), 'General Surgery Operative Pathway', 'General Surgery', 'Operative booking and pre-operative assessment pathway for general surgery.'),
    (gen_random_uuid(), 'Neurology Consult', 'Neurology', 'Neurology triage, consult, and follow-up pathway.'),
    (gen_random_uuid(), 'Neurology Surgical Review', 'Neurology', 'Neurosurgical review and procedure booking pathway.');

INSERT INTO "DimEntryPoint" (
    entry_point_id,
    entry_point_name,
    description
)
VALUES
    (gen_random_uuid(), 'Emerg_Admit', 'Emergency patient admitted before downstream surgical or clinical workflow.'),
    (gen_random_uuid(), 'Emerg_Sent_To_Or', 'Emergency patient directly transferred to operating room workflow.'),
    (gen_random_uuid(), 'Referral', 'Referral-originated scheduling workflow from external or internal provider.'),
    (gen_random_uuid(), 'New Clinic Visit', 'Clinic-driven new visit workflow from abnormal results, discharge follow-up, or scheduled intake.');

WITH links (entry_point_name, pathway_name, probability, condition_rule) AS (
    VALUES
        ('Emerg_Admit', 'Orthopedics Fracture Clinic', 0.28000, 'injury_type in (''fracture'', ''sprain'')'),
        ('Emerg_Admit', 'Cardiology Diagnostic Follow-up', 0.17000, 'presenting_complaint in (''chest pain'', ''palpitations'')'),
        ('Emerg_Admit', 'General Surgery Consult', 0.21000, 'acute_abdominal_pain = true'),
        ('Emerg_Admit', 'Neurology Consult', 0.19000, 'neurologic_symptoms = true'),
        ('Emerg_Sent_To_Or', 'General Surgery Operative Pathway', 0.15000, 'surgical_assessment_required = true'),
        ('Referral', 'Orthopedics Elective Joint Surgery', 0.17000, 'joint_replacement_candidate = true'),
        ('Referral', 'Cardiology Diagnostic Follow-up', 0.22000, 'cardiac_testing_requested = true'),
        ('Referral', 'Oncology Treatment Planning', 0.18000, 'suspected_cancer = true'),
        ('Referral', 'General Surgery Consult', 0.21000, 'general_surgery_referral = true'),
        ('Referral', 'Neurology Consult', 0.22000, 'neurology_referral = true'),
        ('Referral', 'Orthopedics Elective Joint Surgery', 0.23000, 'orthopedics_or_required = true'),
        ('Referral', 'Cardiology Procedure Review', 0.14000, 'cardiology_procedure_required = true'),
        ('Referral', 'Oncology Surgical Review', 0.21000, 'oncology_or_required = true'),
        ('Referral', 'General Surgery Operative Pathway', 0.28000, 'general_surgery_or_required = true'),
        ('Referral', 'Neurology Surgical Review', 0.14000, 'neurosurgery_or_required = true'),
        ('New Clinic Visit', 'Cardiology Diagnostic Follow-up', 0.24000, 'abnormal_ecg_or_echo = true'),
        ('New Clinic Visit', 'Oncology Treatment Planning', 0.28000, 'abnormal_pathology_or_tumor_marker = true'),
        ('New Clinic Visit', 'Oncology Surgical Review', 0.16000, 'resectable_tumor = true'),
        ('New Clinic Visit', 'General Surgery Consult', 0.16000, 'abnormal_abdominal_imaging = true'),
        ('New Clinic Visit', 'Neurology Consult', 0.16000, 'abnormal_neuroimaging = true'),
        ('New Clinic Visit', 'Orthopedics Fracture Clinic', 0.19000, 'post_discharge_orthopedics_followup = true'),
        ('New Clinic Visit', 'Cardiology Diagnostic Follow-up', 0.18000, 'post_discharge_cardiology_followup = true'),
        ('New Clinic Visit', 'Oncology Treatment Planning', 0.18000, 'post_discharge_oncology_followup = true'),
        ('New Clinic Visit', 'General Surgery Consult', 0.24000, 'post_discharge_surgical_followup = true'),
        ('New Clinic Visit', 'Neurology Consult', 0.21000, 'post_discharge_neurology_followup = true')
)
INSERT INTO "FactEntryPointPathwayProbability" (
    entry_point_pathway_id,
    entry_point_id,
    pathway_id,
    probability,
    condition_rule,
    effective_start_date,
    effective_end_date
)
SELECT
    gen_random_uuid(),
    ep.entry_point_id,
    p.pathway_id,
    links.probability,
    links.condition_rule,
    CURRENT_DATE - 365,
    NULL
FROM links
JOIN "DimEntryPoint" ep
    ON ep.entry_point_name = links.entry_point_name
JOIN "DimPathway" p
    ON p.pathway_name = links.pathway_name;

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

INSERT INTO "DimEventLabel" (label_id, label_type, label_name, description)
VALUES
    (gen_random_uuid(), 'priority', 'urgent', 'Priority indicates emergency or urgent handling.'),
    (gen_random_uuid(), 'timing', 'before_surgery', 'Event must occur before a scheduled surgical case.'),
    (gen_random_uuid(), 'dependency', 'after_lab_result', 'Event was created after a lab or diagnostic result.'),
    (gen_random_uuid(), 'specialty', 'oncology', 'Event is associated with oncology.'),
    (gen_random_uuid(), 'specialty', 'cardiology', 'Event is associated with cardiology.'),
    (gen_random_uuid(), 'category', 'surgery_related', 'Event is directly related to surgery or operating room booking.'),
    (gen_random_uuid(), 'workflow', 'routine_followup', 'Routine outpatient follow-up event.'),
    (gen_random_uuid(), 'workflow', 'diagnostic_followup', 'Diagnostic result or imaging review follow-up.'),
    (gen_random_uuid(), 'risk', 'long_wait', 'Event has waited more than 180 days.'),
    (gen_random_uuid(), 'priority', 'high_priority', 'Emergency 1A or Urgent 1B event.');

WITH event_types (event_type, base_duration_min) AS (
    VALUES
        ('New Clinic Visit', 30),
        ('Follow-up Clinic Visit', 15)
),
specialties (specialty) AS (
    VALUES
        ('Orthopedics'),
        ('Cardiology'),
        ('Oncology'),
        ('General Surgery'),
        ('Neurology')
),
priorities (priority, adjustment_min) AS (
    VALUES
        ('Emergency 1A', -5),
        ('Urgent 1B', 0),
        ('Urgent 1C', 5),
        ('Urgent 1D', 10),
        ('Urgent 1E', 12),
        ('Elective', 15)
)
INSERT INTO "DimOutpatientDurationRule" (
    duration_rule_id,
    event_type,
    specialty,
    priority,
    slot_duration_min,
    allowed_durations_min,
    default_duration_min
)
SELECT
    gen_random_uuid(),
    e.event_type,
    s.specialty,
    p.priority,
    CASE
        WHEN e.base_duration_min + p.adjustment_min <= 5 THEN 5
        WHEN e.base_duration_min + p.adjustment_min <= 10 THEN 10
        WHEN e.base_duration_min + p.adjustment_min <= 15 THEN 15
        WHEN e.base_duration_min + p.adjustment_min <= 20 THEN 20
        WHEN e.base_duration_min + p.adjustment_min <= 30 THEN 30
        ELSE 45
    END,
    '5,10,15,20,30,45',
    CASE
        WHEN e.base_duration_min + p.adjustment_min <= 5 THEN 5
        WHEN e.base_duration_min + p.adjustment_min <= 10 THEN 10
        WHEN e.base_duration_min + p.adjustment_min <= 15 THEN 15
        WHEN e.base_duration_min + p.adjustment_min <= 20 THEN 20
        WHEN e.base_duration_min + p.adjustment_min <= 30 THEN 30
        ELSE 45
    END
FROM event_types e
CROSS JOIN specialties s
CROSS JOIN priorities p;

WITH base_distributions (
    surgery_type,
    specialty,
    base_mean_duration_min,
    base_stddev_duration_min,
    base_min_duration_min,
    base_max_duration_min
) AS (
    VALUES
        ('Total Joint Replacement', 'Orthopedics', 130, 28, 75, 240),
        ('Arthroscopy', 'Orthopedics', 70, 18, 35, 140),
        ('Fracture Fixation', 'Orthopedics', 95, 25, 45, 200),
        ('Cardiac Device Implant', 'Cardiology', 85, 22, 45, 160),
        ('Cardiac Catheterization', 'Cardiology', 65, 18, 30, 130),
        ('Tumor Resection', 'Oncology', 165, 42, 80, 360),
        ('Port Placement', 'Oncology', 55, 15, 25, 110),
        ('Breast Oncology Surgery', 'Oncology', 115, 28, 60, 220),
        ('Cholecystectomy', 'General Surgery', 90, 22, 45, 180),
        ('Hernia Repair', 'General Surgery', 80, 18, 40, 160),
        ('Appendectomy', 'General Surgery', 75, 20, 35, 150),
        ('Spine Decompression', 'Neurology', 180, 45, 90, 390),
        ('Neurosurgical Biopsy', 'Neurology', 120, 34, 60, 260),
        ('Peripheral Nerve Release', 'Neurology', 70, 18, 35, 150)
),
priority_factors (priority, factor, sample_size) AS (
    VALUES
        ('Emergency 1A', 1.12, 78),
        ('Urgent 1B', 1.08, 146),
        ('Urgent 1C', 1.03, 225),
        ('Urgent 1D', 1.00, 265),
        ('Urgent 1E', 0.98, 200),
        ('Elective', 0.95, 340)
)
INSERT INTO "DimSurgeryDurationDistribution" (
    distribution_id,
    surgery_type,
    specialty,
    priority,
    distribution_type,
    mean_duration_min,
    stddev_duration_min,
    min_duration_min,
    max_duration_min,
    sample_size
)
SELECT
    gen_random_uuid(),
    b.surgery_type,
    b.specialty,
    p.priority,
    'truncated_normal',
    ROUND(b.base_mean_duration_min * p.factor)::integer,
    ROUND(b.base_stddev_duration_min * p.factor)::integer,
    b.base_min_duration_min,
    b.base_max_duration_min,
    p.sample_size + (abs(hashtextextended(concat(b.surgery_type, b.specialty, p.priority), 3)) % 75)
FROM base_distributions b
CROSS JOIN priority_factors p;

INSERT INTO "FactHistoricalEventDuration" (
    historical_duration_id,
    surgery_type,
    specialty,
    priority,
    actual_duration_min,
    event_date
)
SELECT
    gen_random_uuid(),
    d.surgery_type,
    d.specialty,
    d.priority,
    GREATEST(
        d.min_duration_min,
        LEAST(
            d.max_duration_min,
            ROUND(
                d.mean_duration_min
                + d.stddev_duration_min
                * (
                    (mod(abs(hashtextextended(gs.n::text, 1)), 20001)) / 10000.0
                    + (mod(abs(hashtextextended(gs.n::text, 2)), 20001)) / 10000.0
                    - 1
                )
            )::integer
        )
    ),
    CURRENT_DATE - (abs(hashtextextended(gs.n::text, 4)) % 365)
FROM generate_series(1, 2000) AS gs(n)
CROSS JOIN LATERAL (
    SELECT *
    FROM "DimSurgeryDurationDistribution" d
    ORDER BY hashtextextended(d.distribution_id::text || '|' || gs.n::text, 0)
    LIMIT 1
) d;

INSERT INTO "DimSchedulingRule" (
    rule_id,
    rule_name,
    label_condition,
    score_adjustment,
    rule_type,
    is_active
)
VALUES
    (gen_random_uuid(), 'Emergency Priority Lift', 'label_name = ''urgent'' and priority = ''Emergency 1A''', 500, 'priority_score', true),
    (gen_random_uuid(), 'High Priority Lift', 'label_name = ''high_priority''', 250, 'priority_score', true),
    (gen_random_uuid(), 'Long Wait Lift', 'label_name = ''long_wait''', 175, 'priority_score', true),
    (gen_random_uuid(), 'Before Surgery Dependency', 'label_name = ''before_surgery''', 125, 'dependency', true),
    (gen_random_uuid(), 'After Lab Result Dependency', 'label_name = ''after_lab_result''', 100, 'dependency', true),
    (gen_random_uuid(), 'Routine Follow-up Reduction', 'label_name = ''routine_followup''', -50, 'priority_score', true),
    (gen_random_uuid(), 'Oncology Clinical Lift', 'label_name = ''oncology''', 90, 'clinical_priority', true),
    (gen_random_uuid(), 'Cardiology Clinical Lift', 'label_name = ''cardiology''', 75, 'clinical_priority', true),
    (gen_random_uuid(), 'Surgery Related Lift', 'label_name = ''surgery_related''', 110, 'category_priority', true);

CREATE TEMP TABLE tmp_seed_cases ON COMMIT DROP AS
WITH gs AS (
    SELECT generate_series(1, 2000) AS n
),
b AS (
    SELECT
        gs.n AS case_n,
        gen_random_uuid() AS entity_id,
        gen_random_uuid() AS case_id,
        gen_random_uuid() AS event_id,
        CASE gs.n % 5
            WHEN 0 THEN 'Orthopedics'
            WHEN 1 THEN 'Cardiology'
            WHEN 2 THEN 'Oncology'
            WHEN 3 THEN 'General Surgery'
            ELSE 'Neurology'
        END AS specialty,
        CASE
            WHEN gs.n <= 100 THEN 'emergency'
            WHEN gs.n <= 500 THEN 'urgent'
            ELSE 'elective'
        END AS demo_bucket,
        CASE
            WHEN gs.n BETWEEN 101 AND 200 THEN 'Urgent 1B'
            WHEN gs.n BETWEEN 201 AND 300 THEN 'Urgent 1C'
            WHEN gs.n BETWEEN 301 AND 400 THEN 'Urgent 1D'
            WHEN gs.n BETWEEN 401 AND 500 THEN 'Urgent 1E'
            ELSE NULL
        END AS urgent_tier,
        CASE
            WHEN gs.n > 500 THEN
                CASE
                    WHEN gs.n - 501 < 225 THEN 'P1'
                    WHEN gs.n - 501 < 525 THEN 'P2'
                    WHEN gs.n - 501 < 1125 THEN 'P3'
                    ELSE 'P4'
                END
            ELSE NULL
        END AS referral_tier,
        abs(hashtextextended('s0' || gs.n::text, 0)) AS h0,
        abs(hashtextextended('s1' || gs.n::text, 1)) AS h1,
        abs(hashtextextended('s2' || gs.n::text, 2)) AS h2,
        abs(hashtextextended('s3' || gs.n::text, 3)) AS h3,
        abs(hashtextextended('s4' || gs.n::text, 4)) AS h4,
        abs(hashtextextended('s5' || gs.n::text, 5)) AS h5,
        (timestamp '2023-01-01 07:00:00' + (gs.n * interval '21 hours')) AS anchor_ts
    FROM gs
),
c0 AS (
    SELECT
        b.*,
        CASE b.specialty
            WHEN 'Orthopedics' THEN 'Orthopedics Elective Joint Surgery'
            WHEN 'Cardiology' THEN 'Cardiology Procedure Review'
            WHEN 'Oncology' THEN 'Oncology Surgical Review'
            WHEN 'General Surgery' THEN 'General Surgery Operative Pathway'
            ELSE 'Neurology Surgical Review'
        END AS pathway_name,
        CASE b.demo_bucket
            WHEN 'emergency' THEN 'Emergency 1A'
            WHEN 'urgent' THEN b.urgent_tier
            ELSE 'Elective'
        END AS priority,
        'Surgery'::text AS event_category,
        'Surgery'::text AS required_action,
        'Completed'::text AS status,
        GREATEST(
            10,
            LEAST(
                240,
                35 + ((b.h0 % 81) - 40) + CASE WHEN b.h2 % 25 = 0 THEN (b.h3 % 120) ELSE 0 END
            )
        )::integer AS surgery_duration_min,
        CASE
            WHEN b.demo_bucket = 'urgent' AND b.urgent_tier IN ('Urgent 1D', 'Urgent 1E') THEN
                CASE
                    WHEN b.h0 % 10 < 2 THEN 'sent_or'
                    WHEN b.h0 % 10 < 6 THEN 'admit_ed'
                    ELSE 'referral'
                END
            WHEN b.demo_bucket = 'urgent' THEN
                CASE WHEN b.h0 % 10 < 3 THEN 'sent_or' ELSE 'admit_ed' END
            ELSE 'elective'
        END AS entry_class
    FROM b
),
c AS (
    SELECT
        c0.*,
        CASE
            WHEN c0.demo_bucket = 'emergency' THEN
                CASE WHEN c0.h1 % 100 < 80 THEN 'Sent to OR' ELSE 'Admit' END
            WHEN c0.demo_bucket = 'urgent' AND c0.urgent_tier IN ('Urgent 1B', 'Urgent 1C') THEN
                CASE WHEN c0.h1 % 10 < 3 THEN 'Sent to OR' ELSE 'Admit' END
            WHEN c0.demo_bucket = 'urgent' AND c0.entry_class = 'sent_or' THEN 'Sent to OR'
            WHEN c0.demo_bucket = 'urgent' AND c0.entry_class = 'admit_ed' THEN 'Admit'
            ELSE 'Received'
        END AS entry_status,
        CASE c0.priority
            WHEN 'Emergency 1A' THEN '1A'
            WHEN 'Urgent 1B' THEN '1B'
            WHEN 'Urgent 1C' THEN '1C'
            WHEN 'Urgent 1D' THEN '1D'
            WHEN 'Urgent 1E' THEN '1E'
            ELSE 'Elective'
        END AS case_request_priority_detail,
        CASE
            WHEN c0.case_n % 100 < 70 THEN '1'
            WHEN c0.case_n % 100 < 90 THEN '2'
            WHEN c0.case_n % 100 < 98 THEN '3'
            ELSE '4'
        END AS surgery_priority,
        COALESCE(
            c0.referral_tier,
            CASE (c0.h1 % 4)
                WHEN 0 THEN 'P1'
                WHEN 1 THEN 'P2'
                WHEN 2 THEN 'P3'
                ELSE 'P4'
            END
        ) AS referral_priority
    FROM c0
),
d AS (
    SELECT
        c.*,
        CASE
            WHEN c.demo_bucket = 'emergency' THEN c.anchor_ts
            WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' THEN NULL::timestamp
            ELSE c.anchor_ts
        END AS t_entry_start,
        CASE
            WHEN c.demo_bucket = 'emergency' THEN c.anchor_ts + interval '45 minutes'
            WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' THEN NULL::timestamp
            ELSE c.anchor_ts + interval '45 minutes'
        END AS t_entry_end,
        CASE
            WHEN c.demo_bucket = 'urgent' AND c.entry_class IN ('admit_ed', 'sent_or') THEN c.anchor_ts + interval '45 minutes'
            ELSE NULL::timestamp
        END AS t_admit_start,
        CASE
            WHEN c.demo_bucket = 'urgent' AND c.entry_class IN ('admit_ed', 'sent_or') THEN c.anchor_ts + interval '75 minutes'
            ELSE NULL::timestamp
        END AS t_admit_end,
        CASE
            WHEN c.demo_bucket IN ('urgent', 'elective') AND c.entry_class IN ('referral', 'elective') THEN c.anchor_ts
            ELSE NULL::timestamp
        END AS t_ref_start,
        CASE
            WHEN c.demo_bucket IN ('urgent', 'elective') AND c.entry_class IN ('referral', 'elective') THEN c.anchor_ts + interval '30 minutes'
            ELSE NULL::timestamp
        END AS t_ref_end
    FROM c
),
e AS (
    SELECT
        d.*,
        CASE
            WHEN d.demo_bucket = 'urgent'
                AND d.urgent_tier IN ('Urgent 1D', 'Urgent 1E')
                AND d.entry_class IN ('sent_or', 'admit_ed')
                AND d.case_n % 20 = 0 THEN
                COALESCE(d.t_admit_end, d.t_entry_end, d.anchor_ts + interval '30 minutes')
                + make_interval(days => (1 + (d.h2 % 4)))
            ELSE NULL::timestamp
        END AS t_ncv_urgent_start,
        CASE
            WHEN d.demo_bucket = 'urgent'
                AND d.urgent_tier IN ('Urgent 1D', 'Urgent 1E')
                AND d.entry_class IN ('sent_or', 'admit_ed')
                AND d.case_n % 20 = 0 THEN
                COALESCE(d.t_admit_end, d.t_entry_end, d.anchor_ts + interval '30 minutes')
                + make_interval(days => (1 + (d.h2 % 4)))
                + interval '40 minutes'
            ELSE NULL::timestamp
        END AS t_ncv_urgent_end,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' THEN
                COALESCE(
                    CASE
                        WHEN d.h3 % 10 < 7 THEN d.t_ref_end + interval '5 days' + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    d.t_ref_end + interval '2 days' + interval '40 minutes'
                ) + interval '1 day'
            WHEN d.demo_bucket = 'emergency' THEN d.anchor_ts + make_interval(mins => (d.h1 % 301))
            WHEN d.demo_bucket = 'urgent' THEN
                COALESCE(d.t_admit_end, d.t_entry_end, d.anchor_ts + interval '30 minutes')
                + make_interval(days => (1 + (d.h2 % 7)))
            ELSE NULL::timestamp
        END AS t_case_req_start,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' THEN
                COALESCE(
                    CASE
                        WHEN d.h3 % 10 < 7 THEN d.t_ref_end + interval '5 days' + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    d.t_ref_end + interval '2 days' + interval '40 minutes'
                ) + interval '1 day' + interval '25 minutes'
            WHEN d.demo_bucket IN ('emergency', 'urgent') THEN
                CASE
                    WHEN d.demo_bucket = 'emergency' THEN d.anchor_ts + make_interval(mins => (d.h1 % 301))
                    ELSE
                        COALESCE(d.t_admit_end, d.t_entry_end, d.anchor_ts + interval '30 minutes')
                        + make_interval(days => (1 + (d.h2 % 7)))
                END + interval '25 minutes'
            ELSE NULL::timestamp
        END AS t_case_req_end,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' THEN d.t_ref_end + interval '2 days'
            ELSE NULL::timestamp
        END AS t_ncv_ref_start,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' THEN d.t_ref_end + interval '2 days' + interval '40 minutes'
            ELSE NULL::timestamp
        END AS t_ncv_ref_end,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' AND d.h3 % 10 < 7 THEN
                d.t_ref_end + interval '2 days' + interval '3 days'
            ELSE NULL::timestamp
        END AS t_fu_ref_start,
        CASE
            WHEN d.demo_bucket = 'urgent' AND d.entry_class = 'referral' AND d.h3 % 10 < 7 THEN
                d.t_ref_end + interval '2 days' + interval '3 days' + interval '30 minutes'
            ELSE NULL::timestamp
        END AS t_fu_ref_end,
        CASE
            WHEN d.demo_bucket = 'elective' THEN
                d.anchor_ts
                + make_interval(
                    days => CASE d.referral_tier
                        WHEN 'P1' THEN 5 + (d.h1 % 8)
                        WHEN 'P2' THEN 6 + (d.h1 % 9)
                        WHEN 'P3' THEN 21 + (d.h2 % 49)
                        ELSE 28 + (d.h2 % 56)
                    END
                )
            ELSE NULL::timestamp
        END AS t_ncv_elective_start,
        CASE
            WHEN d.demo_bucket = 'elective' THEN
                d.anchor_ts
                + make_interval(
                    days => CASE d.referral_tier
                        WHEN 'P1' THEN 5 + (d.h1 % 8)
                        WHEN 'P2' THEN 6 + (d.h1 % 9)
                        WHEN 'P3' THEN 21 + (d.h2 % 49)
                        ELSE 28 + (d.h2 % 56)
                    END
                )
                + interval '45 minutes'
            ELSE NULL::timestamp
        END AS t_ncv_elective_end,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 20 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (3 + (d.h3 % 10)))
            ELSE NULL::timestamp
        END AS t_fu1_start,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 20 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (3 + (d.h3 % 10)))
                + interval '30 minutes'
            ELSE NULL::timestamp
        END AS t_fu1_end,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 70 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (10 + (d.h4 % 14)))
            ELSE NULL::timestamp
        END AS t_fu2_start,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 70 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (10 + (d.h4 % 14)))
                + interval '30 minutes'
            ELSE NULL::timestamp
        END AS t_fu2_end,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 91 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (18 + (d.h5 % 10)))
            ELSE NULL::timestamp
        END AS t_fu3_start,
        CASE
            WHEN d.demo_bucket = 'elective' AND (d.case_n - 501) % 100 >= 91 THEN
                (
                    d.anchor_ts
                    + make_interval(
                        days => CASE d.referral_tier
                            WHEN 'P1' THEN 5 + (d.h1 % 8)
                            WHEN 'P2' THEN 6 + (d.h1 % 9)
                            WHEN 'P3' THEN 21 + (d.h2 % 49)
                            ELSE 28 + (d.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (18 + (d.h5 % 10)))
                + interval '30 minutes'
            ELSE NULL::timestamp
        END AS t_fu3_end
    FROM d
),
f AS (
    SELECT
        e.*,
        CASE
            WHEN e.demo_bucket = 'elective' THEN
                COALESCE(e.t_fu3_end, e.t_fu2_end, e.t_fu1_end, e.t_ncv_elective_end)
                + make_interval(days => (2 + (e.h2 % 4)))
            ELSE NULL::timestamp
        END AS t_elect_req_start,
        CASE
            WHEN e.demo_bucket = 'elective' THEN
                COALESCE(e.t_fu3_end, e.t_fu2_end, e.t_fu1_end, e.t_ncv_elective_end)
                + make_interval(days => (2 + (e.h2 % 4)))
                + interval '20 minutes'
            ELSE NULL::timestamp
        END AS t_elect_req_end,
        CASE
            WHEN e.demo_bucket = 'emergency' THEN
                (e.t_case_req_end)
                + make_interval(
                    mins => CASE
                        WHEN e.h2 % 100 < 92 THEN 5 + (e.h3 % 116)
                        ELSE 125 + (e.h3 % 36)
                    END
                )
            WHEN e.demo_bucket = 'urgent' THEN
                e.t_case_req_end
                + CASE e.urgent_tier
                    WHEN 'Urgent 1B' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(mins => 120 + (e.h3 % 361))
                            ELSE make_interval(mins => FLOOR(480 * 1.15)::integer + (e.h3 % 120))
                        END
                    WHEN 'Urgent 1C' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(mins => 480 + (e.h3 % 1681))
                            ELSE make_interval(mins => FLOOR(2880 * 1.20)::integer + (e.h3 % 240))
                        END
                    WHEN 'Urgent 1D' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(days => 2 + (e.h3 % 6))
                            ELSE make_interval(days => FLOOR(7 * 1.15)::integer + (e.h3 % 3))
                        END
                    ELSE
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(days => 3 + (e.h3 % 12))
                            ELSE make_interval(days => FLOOR(14 * 1.20)::integer + (e.h3 % 4))
                        END
                END
            ELSE
                -- Elective: wait = surgery.start - surgery_request.start (request = t_elect_req_*).
                -- 85%: 20–180 days, skewed (60% mass 50–110 d); 15%: 181–360 d; hard cap 360 d.
                e.t_elect_req_start
                + CASE
                    WHEN e.h4 % 100 < 85 THEN
                        make_interval(
                            days => LEAST(
                                180,
                                CASE
                                    WHEN e.h1 % 10 < 6 THEN 50 + (e.h3 % 61)
                                    ELSE 20 + LEAST(160, (e.h2 % 92) + (e.h5 % 69))
                                END
                            )::integer,
                            mins => (e.h5 % 90)
                        )
                    ELSE
                        make_interval(
                            days => LEAST(360, 181 + (e.h3 % 90) + (e.h4 % 90))::integer,
                            mins => (e.h5 % 90)
                        )
                END
        END AS t_surg_start,
        CASE
            WHEN e.demo_bucket = 'emergency' THEN
                (e.t_case_req_end)
                + make_interval(
                    mins => CASE
                        WHEN e.h2 % 100 < 92 THEN 5 + (e.h3 % 116)
                        ELSE 125 + (e.h3 % 36)
                    END
                )
                + make_interval(mins => e.surgery_duration_min)
            WHEN e.demo_bucket = 'urgent' THEN
                e.t_case_req_end
                + CASE e.urgent_tier
                    WHEN 'Urgent 1B' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(mins => 120 + (e.h3 % 361))
                            ELSE make_interval(mins => FLOOR(480 * 1.15)::integer + (e.h3 % 120))
                        END
                    WHEN 'Urgent 1C' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(mins => 480 + (e.h3 % 1681))
                            ELSE make_interval(mins => FLOOR(2880 * 1.20)::integer + (e.h3 % 240))
                        END
                    WHEN 'Urgent 1D' THEN
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(days => 2 + (e.h3 % 6))
                            ELSE make_interval(days => FLOOR(7 * 1.15)::integer + (e.h3 % 3))
                        END
                    ELSE
                        CASE
                            WHEN e.h4 % 100 < 85 THEN make_interval(days => 3 + (e.h3 % 12))
                            ELSE make_interval(days => FLOOR(14 * 1.20)::integer + (e.h3 % 4))
                        END
                END
                + make_interval(mins => e.surgery_duration_min)
            ELSE
                e.t_elect_req_start
                + CASE
                    WHEN e.h4 % 100 < 85 THEN
                        make_interval(
                            days => LEAST(
                                180,
                                CASE
                                    WHEN e.h1 % 10 < 6 THEN 50 + (e.h3 % 61)
                                    ELSE 20 + LEAST(160, (e.h2 % 92) + (e.h5 % 69))
                                END
                            )::integer,
                            mins => (e.h5 % 90)
                        )
                    ELSE
                        make_interval(
                            days => LEAST(360, 181 + (e.h3 % 90) + (e.h4 % 90))::integer,
                            mins => (e.h5 % 90)
                        )
                END + make_interval(mins => e.surgery_duration_min)
        END AS t_surg_end,
        CASE
            WHEN e.case_n % 100 < 70 THEN 1
            WHEN e.case_n % 100 < 90 THEN 2
            WHEN e.case_n % 100 < 98 THEN 3
            ELSE 4
        END::integer AS post_op_count
    FROM e
),
fin AS (
    SELECT
        f.case_n,
        f.entity_id,
        f.case_id,
        f.event_id,
        f.specialty,
        f.demo_bucket,
        f.urgent_tier,
        f.referral_tier,
        f.pathway_name,
        f.priority,
        f.event_category,
        f.required_action,
        f.status,
        f.surgery_duration_min,
        f.surgery_duration_min AS estimated_duration_min,
        f.entry_class,
        f.entry_status,
        f.anchor_ts,
        f.t_entry_start,
        f.t_entry_end,
        f.t_admit_start,
        f.t_admit_end,
        f.t_ref_start,
        f.t_ref_end,
        f.t_ncv_urgent_start,
        f.t_ncv_urgent_end,
        f.t_case_req_start,
        f.t_case_req_end,
        f.t_ncv_ref_start,
        f.t_ncv_ref_end,
        f.t_fu_ref_start,
        f.t_fu_ref_end,
        f.t_ncv_elective_start,
        f.t_ncv_elective_end,
        f.t_fu1_start,
        f.t_fu1_end,
        f.t_fu2_start,
        f.t_fu2_end,
        f.t_fu3_start,
        f.t_fu3_end,
        f.t_elect_req_start,
        f.t_elect_req_end,
        f.t_surg_start,
        f.t_surg_end,
        f.post_op_count,
        CASE
            WHEN f.demo_bucket = 'emergency' THEN f.anchor_ts
            WHEN f.demo_bucket = 'urgent' AND f.entry_class = 'referral' THEN f.t_ref_start
            WHEN f.demo_bucket = 'urgent' THEN f.t_entry_start
            ELSE f.t_ref_start
        END AS created_at,
        CASE
            WHEN f.demo_bucket = 'elective' THEN f.t_elect_req_end + interval '186 days'
            ELSE f.t_surg_start
        END AS ready_at,
        NULL::jsonb AS hosp_events
    FROM f
)
SELECT * FROM fin;

UPDATE tmp_seed_cases t SET
    hosp_events = CASE
        WHEN t.demo_bucket = 'emergency' THEN jsonb_strip_nulls(jsonb_build_array(
            jsonb_build_object(
                'event_type', CASE WHEN t.entry_status = 'Sent to OR' THEN 'Emerg_Sent_To_Or' ELSE 'Emerg_Admit' END,
                'start', t.t_entry_start,
                'status', t.entry_status,
                'table_source', 'emergency_triage'
            ),
            jsonb_build_object(
                'event_type', 'CaseRequest',
                'start', t.t_case_req_start,
                'priority', t.case_request_priority_detail,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            jsonb_build_object(
                'event_type', 'Surgery',
                'start', t.t_surg_start,
                'end', t.t_surg_end,
                'priority', t.surgery_priority,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            CASE WHEN t.post_op_count >= 1 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '7 days',
                'end', t.t_surg_end + interval '7 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 2 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '14 days',
                'end', t.t_surg_end + interval '14 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 3 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '30 days',
                'end', t.t_surg_end + interval '30 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 4 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '90 days',
                'end', t.t_surg_end + interval '90 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END
        ))
        WHEN t.demo_bucket = 'urgent' AND t.entry_class = 'referral' THEN jsonb_strip_nulls(jsonb_build_array(
            jsonb_build_object(
                'event_type', 'Referral',
                'start', t.t_ref_start,
                'priority', t.referral_priority,
                'status', 'Received',
                'table_source', 'source_referral'
            ),
            jsonb_build_object(
                'event_type', 'New Clinic Visit',
                'start', t.t_ncv_ref_start,
                'end', t.t_ncv_ref_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ),
            CASE WHEN t.t_fu_ref_start IS NOT NULL THEN jsonb_build_object(
                'event_type', 'Follow-up Clinic Visit',
                'start', t.t_fu_ref_start,
                'end', t.t_fu_ref_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            jsonb_build_object(
                'event_type', 'CaseRequest',
                'start', t.t_case_req_start,
                'priority', t.case_request_priority_detail,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            jsonb_build_object(
                'event_type', 'Surgery',
                'start', t.t_surg_start,
                'end', t.t_surg_end,
                'priority', t.surgery_priority,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            CASE WHEN t.post_op_count >= 1 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '7 days',
                'end', t.t_surg_end + interval '7 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 2 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '14 days',
                'end', t.t_surg_end + interval '14 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 3 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '30 days',
                'end', t.t_surg_end + interval '30 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 4 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '90 days',
                'end', t.t_surg_end + interval '90 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END
        ))
        WHEN t.demo_bucket = 'urgent' THEN jsonb_strip_nulls(jsonb_build_array(
            jsonb_build_object(
                'event_type', CASE WHEN t.entry_status = 'Sent to OR' THEN 'Emerg_Sent_To_Or' ELSE 'Emerg_Admit' END,
                'start', CASE
                    WHEN t.entry_status = 'Sent to OR' THEN t.t_entry_start
                    ELSE COALESCE(t.t_admit_start, t.t_entry_start)
                END,
                'status', t.entry_status,
                'table_source', 'emergency_triage'
            ),
            CASE WHEN t.t_ncv_urgent_start IS NOT NULL THEN jsonb_build_object(
                'event_type', 'New Clinic Visit',
                'start', t.t_ncv_urgent_start,
                'end', t.t_ncv_urgent_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            jsonb_build_object(
                'event_type', 'CaseRequest',
                'start', t.t_case_req_start,
                'priority', t.case_request_priority_detail,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            jsonb_build_object(
                'event_type', 'Surgery',
                'start', t.t_surg_start,
                'end', t.t_surg_end,
                'priority', t.surgery_priority,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            CASE WHEN t.post_op_count >= 1 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '7 days',
                'end', t.t_surg_end + interval '7 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 2 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '14 days',
                'end', t.t_surg_end + interval '14 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 3 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '30 days',
                'end', t.t_surg_end + interval '30 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 4 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '90 days',
                'end', t.t_surg_end + interval '90 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END
        ))
        ELSE jsonb_strip_nulls(jsonb_build_array(
            jsonb_build_object(
                'event_type', 'Referral',
                'start', t.t_ref_start,
                'priority', t.referral_priority,
                'status', 'Received',
                'table_source', 'source_referral'
            ),
            jsonb_build_object(
                'event_type', 'New Clinic Visit',
                'start', t.t_ncv_elective_start,
                'end', t.t_ncv_elective_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ),
            CASE WHEN t.t_fu1_start IS NOT NULL THEN jsonb_build_object(
                'event_type', 'Follow-up Clinic Visit',
                'start', t.t_fu1_start,
                'end', t.t_fu1_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.t_fu2_start IS NOT NULL THEN jsonb_build_object(
                'event_type', 'Follow-up Clinic Visit',
                'start', t.t_fu2_start,
                'end', t.t_fu2_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.t_fu3_start IS NOT NULL THEN jsonb_build_object(
                'event_type', 'Follow-up Clinic Visit',
                'start', t.t_fu3_start,
                'end', t.t_fu3_end,
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            jsonb_build_object(
                'event_type', 'CaseRequest',
                'start', t.t_elect_req_start,
                'priority', t.case_request_priority_detail,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            jsonb_build_object(
                'event_type', 'Surgery',
                'start', t.t_surg_start,
                'end', t.t_surg_end,
                'priority', t.surgery_priority,
                'status', 'Completed',
                'table_source', 'or_booking'
            ),
            CASE WHEN t.post_op_count >= 1 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '7 days',
                'end', t.t_surg_end + interval '7 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 2 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '14 days',
                'end', t.t_surg_end + interval '14 days' + interval '20 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 3 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '30 days',
                'end', t.t_surg_end + interval '30 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END,
            CASE WHEN t.post_op_count >= 4 THEN jsonb_build_object(
                'event_type', 'Post-Surgery Clinic Visit',
                'start', t.t_surg_end + interval '90 days',
                'end', t.t_surg_end + interval '90 days' + interval '25 minutes',
                'status', 'Completed',
                'table_source', 'encounter_history'
            ) END
        ))
    END;

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
SELECT
    c.event_id,
    c.entity_id,
    c.case_id,
    p.pathway_id,
    c.required_action,
    c.event_category,
    c.specialty,
    c.priority,
    c.estimated_duration_min,
    c.created_at,
    c.ready_at,
    c.status
FROM tmp_seed_cases c
JOIN "DimPathway" p
    ON p.pathway_name = c.pathway_name;

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
SELECT
    gen_random_uuid(),
    c.entity_id,
    c.case_id,
    (ev.elem->>'start')::timestamp,
    NULLIF(ev.elem->>'end', '')::timestamp,
    ev.elem->>'table_source',
    c.specialty,
    CASE c.specialty
        WHEN 'Orthopedics' THEN 'Fracture and Joint Clinic'
        WHEN 'Cardiology' THEN 'Cardiac Diagnostics'
        WHEN 'Oncology' THEN 'Cancer Centre'
        WHEN 'General Surgery' THEN 'Surgical Assessment Unit'
        ELSE 'Neurosciences Clinic'
    END,
    ev.elem->>'event_type',
    NULLIF(ev.elem->>'priority', ''),
    ev.elem->>'status',
    'SRC-' || LPAD(c.case_n::text, 6, '0') || '-' || ev.ord::text,
    'CASE-' || c.case_id::text,
    'ORD-' || LPAD(c.case_n::text, 6, '0') || '-' || LPAD(ev.ord::text, 3, '0')
FROM tmp_seed_cases c
CROSS JOIN LATERAL (
    SELECT t.elem, t.ord
    FROM jsonb_array_elements(c.hosp_events) WITH ORDINALITY AS t(elem, ord)
    WHERE jsonb_typeof(t.elem) = 'object'
) AS ev;

INSERT INTO "FactCase" (
    case_id,
    pathway_id,
    priority_general,
    priority_detail,
    created_at
)
SELECT
    c.case_id,
    p.pathway_id,
    CASE
        WHEN c.case_request_priority_detail = '1A' THEN 'Emergency'
        WHEN c.case_request_priority_detail IN ('1B', '1C', '1D', '1E') THEN 'Urgent'
        ELSE 'Elective'
    END,
    c.case_request_priority_detail,
    c.created_at
FROM tmp_seed_cases c
JOIN "DimPathway" p
    ON p.pathway_name = c.pathway_name;

WITH label_assignments AS (
    SELECT event_id, 'urgent' AS label_name, created_at AS assigned_at, 'priority_rule' AS source
    FROM "FactSchedulingEvent"
    WHERE priority IN ('Emergency 1A', 'Urgent 1B', 'Urgent 1C', 'Urgent 1D', 'Urgent 1E')

    UNION ALL
    SELECT event_id, 'high_priority', created_at, 'priority_rule'
    FROM "FactSchedulingEvent"
    WHERE priority IN ('Emergency 1A', 'Urgent 1B')

    UNION ALL
    SELECT event_id, 'before_surgery', ready_at, 'pathway_dependency'
    FROM "FactSchedulingEvent"
    WHERE required_action = 'CaseRequest'

    UNION ALL
    SELECT event_id, 'after_lab_result', ready_at, 'diagnostic_trigger'
    FROM "FactSchedulingEvent"
    WHERE required_action = 'New Clinic Visit'
      AND (specialty = 'Oncology' AND (abs(hashtextextended(event_id::text, 7)) % 1000) < 350)

    UNION ALL
    SELECT event_id, 'oncology', created_at, 'specialty_rule'
    FROM "FactSchedulingEvent"
    WHERE specialty = 'Oncology'

    UNION ALL
    SELECT event_id, 'cardiology', created_at, 'specialty_rule'
    FROM "FactSchedulingEvent"
    WHERE specialty = 'Cardiology'

    UNION ALL
    SELECT event_id, 'surgery_related', created_at, 'category_rule'
    FROM "FactSchedulingEvent"
    WHERE event_category = 'Surgery'

    UNION ALL
    SELECT event_id, 'routine_followup', created_at, 'workflow_rule'
    FROM "FactSchedulingEvent"
    WHERE event_category = 'Outpatient' AND priority = 'Elective'

    UNION ALL
    SELECT event_id, 'diagnostic_followup', created_at, 'workflow_rule'
    FROM "FactSchedulingEvent"
    WHERE required_action = 'New Clinic Visit'
      AND specialty IN ('Cardiology', 'Oncology')

    UNION ALL
    SELECT event_id, 'long_wait', ready_at, 'wait_time_rule'
    FROM "FactSchedulingEvent"
    WHERE status IN ('Queued', 'Ready', 'Scheduled')
      AND ready_at::date <= CURRENT_DATE - 180
),
deduped AS (
    SELECT DISTINCT ON (la.event_id, la.label_name)
        la.event_id,
        la.label_name,
        COALESCE(la.assigned_at, now()::timestamp) AS assigned_at,
        la.source
    FROM label_assignments la
    ORDER BY la.event_id, la.label_name, la.assigned_at
)
INSERT INTO "BridgeEventLabel" (event_id, label_id, assigned_at, source)
SELECT
    d.event_id,
    l.label_id,
    d.assigned_at,
    d.source
FROM deduped d
JOIN "DimEventLabel" l
    ON l.label_name = d.label_name
ON CONFLICT (event_id, label_id) DO NOTHING;

WITH specialties (specialty, code, default_slot_min) AS (
    VALUES
        ('Orthopedics', 'ORTH', 20),
        ('Cardiology', 'CARD', 20),
        ('Oncology', 'ONCO', 30),
        ('General Surgery', 'GSUR', 30),
        ('Neurology', 'NEUR', 30)
),
providers AS (
    SELECT
        s.specialty,
        s.code,
        s.default_slot_min,
        provider_numbers.provider_number
    FROM specialties s
    CROSS JOIN generate_series(1, 3) AS provider_numbers(provider_number)
),
dates AS (
    SELECT CURRENT_DATE + day_offsets.offset_day AS capacity_date
    FROM generate_series(0, 29) AS day_offsets(offset_day)
)
INSERT INTO "FactOutpatientCapacity" (
    capacity_id,
    specialty,
    provider_id,
    location_id,
    capacity_date,
    start_time,
    end_time,
    slot_length_min,
    max_slots
)
SELECT
    gen_random_uuid(),
    p.specialty,
    'PROV-' || p.code || '-' || LPAD(p.provider_number::text, 2, '0'),
    'LOC-' || p.code || '-' || CASE WHEN p.provider_number = 3 THEN 'B' ELSE 'A' END,
    d.capacity_date,
    TIME '08:00',
    TIME '16:00',
    p.default_slot_min,
    CASE
        WHEN EXTRACT(ISODOW FROM d.capacity_date) IN (6, 7) THEN FLOOR(240 / p.default_slot_min)::integer
        ELSE FLOOR(480 / p.default_slot_min)::integer
    END
FROM providers p
CROSS JOIN dates d;

WITH rooms (operating_room_id, surgical_specialty) AS (
    VALUES
        ('OR-01', 'Orthopedics'),
        ('OR-02', 'Cardiology'),
        ('OR-03', 'Oncology'),
        ('OR-04', 'General Surgery'),
        ('OR-05', 'Neurology'),
        ('OR-06', 'General Surgery')
),
dates AS (
    SELECT CURRENT_DATE + day_offsets.offset_day AS capacity_date
    FROM generate_series(0, 29) AS day_offsets(offset_day)
)
INSERT INTO "FactSurgeryCapacity" (
    capacity_id,
    operating_room_id,
    surgical_specialty,
    capacity_date,
    start_time,
    end_time,
    available_minutes,
    reserved_minutes
)
SELECT
    gen_random_uuid(),
    r.operating_room_id,
    r.surgical_specialty,
    d.capacity_date,
    TIME '07:30',
    TIME '15:30',
    CASE WHEN EXTRACT(ISODOW FROM d.capacity_date) IN (6, 7) THEN 240 ELSE 480 END,
    FLOOR(
        (CASE WHEN EXTRACT(ISODOW FROM d.capacity_date) IN (6, 7) THEN 240 ELSE 480 END)
        * (0.100 + (mod(abs(hashtextextended(r.operating_room_id || d.capacity_date::text, 17)), 1001)) / 5000.0)
    )::integer
FROM rooms r
CROSS JOIN dates d;

WITH slot_candidates AS (
    SELECT
        e.*,
        ROW_NUMBER() OVER (ORDER BY e.created_at, e.event_id) AS slot_n
    FROM "FactSchedulingEvent" e
    WHERE e.status IN ('Scheduled', 'Completed')
       OR (e.status = 'Ready' AND (abs(hashtextextended(e.event_id::text, 9)) % 1000) < 180)
),
slot_start AS (
    SELECT
        sc.*,
        CASE
            WHEN sc.status = 'Completed' THEN
                CURRENT_DATE::timestamp
                - make_interval(days => (abs(hashtextextended(sc.event_id::text, 11)) % 7))
                + make_interval(hours => 8 + (abs(hashtextextended(sc.event_id::text, 12)) % 8), mins => (abs(hashtextextended(sc.event_id::text, 13)) % 4) * 15)
            ELSE
                CURRENT_DATE::timestamp
                + make_interval(days => (abs(hashtextextended(sc.event_id::text, 14)) % 30))
                + make_interval(hours => 8 + (abs(hashtextextended(sc.event_id::text, 15)) % 8), mins => (abs(hashtextextended(sc.event_id::text, 16)) % 4) * 15)
        END AS scheduled_start
    FROM slot_candidates sc
),
score_base AS (
    SELECT
        ss.*,
        CASE ss.priority
            WHEN 'Emergency 1A' THEN 1000
            WHEN 'Urgent 1B' THEN 800
            WHEN 'Urgent 1C' THEN 650
            WHEN 'Urgent 1D' THEN 500
            WHEN 'Urgent 1E' THEN 420
            ELSE 300
        END
        + CASE WHEN ss.event_category = 'Surgery' THEN 100 ELSE 0 END
        + LEAST(300, GREATEST(0, CURRENT_DATE - ss.ready_at::date)) AS priority_score
    FROM slot_start ss
)
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
SELECT
    gen_random_uuid(),
    sb.event_id,
    sb.case_id,
    sb.event_category,
    CASE
        WHEN sb.event_category = 'Outpatient' THEN
            CASE sb.specialty
                WHEN 'Orthopedics' THEN 'PROV-ORTH-' || LPAD(((sb.slot_n % 3) + 1)::text, 2, '0')
                WHEN 'Cardiology' THEN 'PROV-CARD-' || LPAD(((sb.slot_n % 3) + 1)::text, 2, '0')
                WHEN 'Oncology' THEN 'PROV-ONCO-' || LPAD(((sb.slot_n % 3) + 1)::text, 2, '0')
                WHEN 'General Surgery' THEN 'PROV-GSUR-' || LPAD(((sb.slot_n % 3) + 1)::text, 2, '0')
                ELSE 'PROV-NEUR-' || LPAD(((sb.slot_n % 3) + 1)::text, 2, '0')
            END
        ELSE
            CASE sb.specialty
                WHEN 'Orthopedics' THEN 'OR-01'
                WHEN 'Cardiology' THEN 'OR-02'
                WHEN 'Oncology' THEN 'OR-03'
                WHEN 'General Surgery' THEN CASE WHEN sb.slot_n % 2 = 0 THEN 'OR-04' ELSE 'OR-06' END
                ELSE 'OR-05'
            END
    END AS resource_id,
    sb.scheduled_start,
    sb.scheduled_start + make_interval(mins => sb.estimated_duration_min),
    sb.estimated_duration_min,
    sb.priority_score,
    CASE
        WHEN sb.status = 'Completed' THEN 'Completed'
        WHEN sb.status = 'Scheduled' THEN 'Booked'
        ELSE 'Held'
    END
FROM score_base sb;

SELECT 'FactSchedulingEvent count' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactSchedulingEvent";

SELECT 'Distinct scheduling case_ids' AS check_name, COUNT(DISTINCT case_id)::bigint AS check_value
FROM "FactSchedulingEvent";

SELECT 'Calendar slots created' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactCalendarSlot";

-- Validation: standardized hospital event model
SELECT 'FactCase count' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactCase";

SELECT 'FactCase matches distinct cases' AS check_name,
       CASE
           WHEN COUNT(*) = (SELECT COUNT(DISTINCT case_id) FROM "FactHospitalEvent") THEN 1
           ELSE 0
       END::bigint AS check_value
FROM "FactCase";

SELECT 'FactHospitalEvent count by event_type' AS check_name, COUNT(*)::bigint AS check_value, event_type AS detail
FROM "FactHospitalEvent"
GROUP BY event_type
ORDER BY event_type;

SELECT 'Referral priority distribution' AS check_name, COUNT(*)::bigint AS check_value, priority AS detail
FROM "FactHospitalEvent"
WHERE event_type = 'Referral'
GROUP BY priority
ORDER BY priority;

SELECT 'CaseRequest priority distribution' AS check_name, COUNT(*)::bigint AS check_value, priority AS detail
FROM "FactHospitalEvent"
WHERE event_type = 'CaseRequest'
GROUP BY priority
ORDER BY priority;

SELECT 'Surgery priority distribution' AS check_name, COUNT(*)::bigint AS check_value, priority AS detail
FROM "FactHospitalEvent"
WHERE event_type = 'Surgery'
GROUP BY priority
ORDER BY priority;

SELECT 'Clinic visits with non-null priority (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type IN ('New Clinic Visit', 'Follow-up Clinic Visit', 'Post-Surgery Clinic Visit')
  AND priority IS NOT NULL;

SELECT 'Point/order events with non-null end_datetime (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type IN ('Referral', 'Emerg_Sent_To_Or', 'Emerg_Admit', 'CaseRequest')
  AND end_datetime IS NOT NULL;

SELECT 'Duration events with null end_datetime (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type IN (
    'New Clinic Visit',
    'Follow-up Clinic Visit',
    'Surgery',
    'Post-Surgery Clinic Visit'
)
AND end_datetime IS NULL;

SELECT 'Emerg events with non-null priority (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type IN ('Emerg_Sent_To_Or', 'Emerg_Admit')
  AND priority IS NOT NULL;

-- Validation: case mix and priority distribution
SELECT 'Total distinct cases (hospital events)' AS check_name, COUNT(DISTINCT case_id)::bigint AS check_value
FROM "FactHospitalEvent";

SELECT 'Emergency cases (scheduling)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactSchedulingEvent"
WHERE priority = 'Emergency 1A';

SELECT 'Urgent cases (scheduling)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactSchedulingEvent"
WHERE priority IN ('Urgent 1B', 'Urgent 1C', 'Urgent 1D', 'Urgent 1E');

SELECT 'Elective cases (scheduling)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactSchedulingEvent"
WHERE priority = 'Elective';

SELECT 'Priority distribution' AS check_name, COUNT(*)::bigint AS check_value, priority AS detail
FROM "FactSchedulingEvent"
GROUP BY priority
ORDER BY priority;

WITH per_case AS (
    SELECT
        fc.case_id,
        fc.priority_general,
        fc.priority_detail,
        MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) AS req_start,
        MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) AS surg_start
    FROM "FactCase" fc
    JOIN "FactHospitalEvent" h ON h.case_id = fc.case_id
    GROUP BY fc.case_id, fc.priority_general, fc.priority_detail
),
lagged AS (
    SELECT
        case_id,
        priority_general,
        priority_detail,
        surg_start - req_start AS lag,
        CASE
            WHEN priority_detail = '1A' AND surg_start - req_start <= interval '2 hours' THEN true
            WHEN priority_detail = '1B' AND surg_start - req_start <= interval '8 hours' THEN true
            WHEN priority_detail = '1C' AND surg_start - req_start <= interval '48 hours' THEN true
            WHEN priority_detail = '1D' AND surg_start - req_start <= interval '7 days' THEN true
            WHEN priority_detail = '1E' AND surg_start - req_start <= interval '14 days' THEN true
            WHEN priority_detail = 'Elective' AND surg_start - req_start <= interval '180 days' THEN true
            ELSE false
        END AS within_target
    FROM per_case
    WHERE req_start IS NOT NULL AND surg_start IS NOT NULL
),
by_cat AS (
    SELECT
        priority_general AS category,
        COUNT(*)::bigint AS cases_n,
        SUM(CASE WHEN within_target THEN 1 ELSE 0 END)::bigint AS within_n
    FROM lagged
    GROUP BY 1
)
SELECT
    'Surgery within target % by category' AS check_name,
    ROUND(100.0 * within_n / NULLIF(cases_n, 0), 2) AS check_value,
    category || ' (' || within_n || '/' || cases_n || ')' AS detail
FROM by_cat
ORDER BY category;

SELECT 'New Clinic Visit events' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type = 'New Clinic Visit';

SELECT 'Follow-up Clinic Visit events' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type = 'Follow-up Clinic Visit';

SELECT 'Post-Surgery Clinic Visit events' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactHospitalEvent"
WHERE event_type = 'Post-Surgery Clinic Visit';

WITH sample_cases AS (
    SELECT case_id
    FROM "FactHospitalEvent"
    GROUP BY case_id
    ORDER BY MIN(start_datetime)
    LIMIT 5
)
SELECT
    'Sample timeline row' AS check_name,
    NULL::bigint AS check_value,
    h.case_id::text || ' | ' || to_char(h.start_datetime, 'YYYY-MM-DD HH24:MI') || ' | '
    || h.event_type || ' | ' || COALESCE(h.priority, '') AS detail
FROM "FactHospitalEvent" h
JOIN sample_cases s ON s.case_id = h.case_id
ORDER BY h.start_datetime, h.order_key;

-- Elective surgical wait validation (request start → surgery start only)
SELECT 'Elective distinct case count (scheduling)' AS check_name, COUNT(DISTINCT case_id)::bigint AS check_value
FROM "FactSchedulingEvent"
WHERE priority = 'Elective';

WITH elective_wait AS (
    SELECT
        se.case_id,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 86400.0 AS wait_days
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Elective'
    GROUP BY se.case_id
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT 'Elective median wait days (req→surgery)' AS check_name,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wait_days)::numeric, 2) AS check_value
FROM elective_wait;

WITH elective_wait AS (
    SELECT
        se.case_id,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 86400.0 AS wait_days
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Elective'
    GROUP BY se.case_id
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT 'Elective average wait days (req→surgery)' AS check_name,
       ROUND(AVG(wait_days)::numeric, 2) AS check_value
FROM elective_wait;

WITH elective_wait AS (
    SELECT
        se.case_id,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 86400.0 AS wait_days
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Elective'
    GROUP BY se.case_id
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT 'Elective pct within 180 days' AS check_name,
       ROUND((100.0 * SUM(CASE WHEN wait_days <= 180 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::numeric, 2) AS check_value
FROM elective_wait;

WITH elective_wait AS (
    SELECT
        se.case_id,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 86400.0 AS wait_days
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Elective'
    GROUP BY se.case_id
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT 'Elective pct over 180 days' AS check_name,
       ROUND((100.0 * SUM(CASE WHEN wait_days > 180 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::numeric, 2) AS check_value
FROM elective_wait;

WITH elective_wait AS (
    SELECT
        se.case_id,
        EXTRACT(
            EPOCH FROM (
                MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END)
                - MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END)
            )
        ) / 86400.0 AS wait_days
    FROM "FactSchedulingEvent" se
    JOIN "FactHospitalEvent" h ON h.case_id = se.case_id
    WHERE se.priority = 'Elective'
    GROUP BY se.case_id
    HAVING MIN(CASE WHEN h.event_type = 'CaseRequest' THEN h.start_datetime END) IS NOT NULL
       AND MIN(CASE WHEN h.event_type = 'Surgery' THEN h.start_datetime END) IS NOT NULL
)
SELECT 'Elective max wait days (req→surgery)' AS check_name,
       ROUND(MAX(wait_days)::numeric, 2) AS check_value
FROM elective_wait;

-- Pathway transition model validation
SELECT 'Pathway transition distinct states' AS check_name, NULL::bigint AS check_value,
       string_agg(DISTINCT state_name, ', ' ORDER BY state_name) AS detail
FROM (
    SELECT current_state AS state_name FROM "FactPathwayTransition"
    UNION
    SELECT next_state FROM "FactPathwayTransition"
) states;

SELECT 'Legacy abstract pathway states remaining (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactPathwayTransition"
WHERE current_state IN (
        'intake', 'triage', 'ready_for_outpatient', 'follow_up_needed',
        'ready_for_surgery', 'deferred', 'scheduled_surgery',
        'closed_no_booking', 'closed_after_visit', 'closed_after_surgery'
    )
   OR next_state IN (
        'intake', 'triage', 'ready_for_outpatient', 'follow_up_needed',
        'ready_for_surgery', 'deferred', 'scheduled_surgery',
        'closed_no_booking', 'closed_after_visit', 'closed_after_surgery'
    );

SELECT 'Entry point to entry point transitions (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactPathwayTransition"
WHERE current_state IN ('Referral', 'Emerg_Sent_To_Or', 'Emerg_Admit')
  AND next_state IN ('Referral', 'Emerg_Sent_To_Or', 'Emerg_Admit');

SELECT 'Pathway transition count by entry_point_name' AS check_name, COUNT(*)::bigint AS check_value,
       COALESCE(entry_point_name, '(null)') AS detail
FROM "FactPathwayTransition"
GROUP BY entry_point_name
ORDER BY entry_point_name;

SELECT 'Pathway transition count by case_priority' AS check_name, COUNT(*)::bigint AS check_value,
       COALESCE(case_priority, '(null)') AS detail
FROM "FactPathwayTransition"
GROUP BY case_priority
ORDER BY case_priority;

SELECT 'Pathway transition count by path_variant' AS check_name, COUNT(*)::bigint AS check_value,
       COALESCE(path_variant, '(null)') AS detail
FROM "FactPathwayTransition"
GROUP BY path_variant
ORDER BY path_variant;

-- Canonical required_action validation
SELECT 'Distinct FactSchedulingEvent.required_action' AS check_name,
       NULL::bigint AS check_value,
       string_agg(required_action, ', ' ORDER BY required_action) AS detail
FROM (
    SELECT DISTINCT required_action
    FROM "FactSchedulingEvent"
) actions;

SELECT 'Legacy required_action values remaining (expect 0)' AS check_name, COUNT(*)::bigint AS check_value
FROM "FactSchedulingEvent"
WHERE required_action NOT IN (
    'New Clinic Visit',
    'Follow-up Clinic Visit',
    'CaseRequest',
    'Surgery'
);

-- Forecast validation (requires sql/hospital_forecast_views.sql applied after demo schema)
SELECT 'Entry point arrival rate rows (4w)' AS check_name, COUNT(*)::bigint AS check_value
FROM vw_entry_point_arrival_rate_4w;

SELECT 'One-step downstream forecast rows' AS check_name, COUNT(*)::bigint AS check_value
FROM vw_expected_downstream_events_next_week;

SELECT 'Multi-step pathway forecast rows' AS check_name, COUNT(*)::bigint AS check_value
FROM vw_forecast_pathway_events_next_week;

SELECT 'Next-week CaseRequest demand (all specialties)' AS check_name,
       COALESCE(SUM(total_estimated_events), 0)::bigint AS check_value
FROM vw_next_week_event_demand_summary
WHERE next_state = 'CaseRequest';

SELECT entry_point_event_type,
       specialty,
       priority,
       total_arrivals_4w,
       estimated_next_week_arrivals
FROM vw_entry_point_arrival_rate_4w
ORDER BY estimated_next_week_arrivals DESC
LIMIT 10;

SELECT next_state,
       specialty,
       case_priority,
       total_estimated_events,
       total_service_minutes
FROM vw_next_week_event_demand_summary
ORDER BY total_estimated_events DESC
LIMIT 15;

COMMIT;

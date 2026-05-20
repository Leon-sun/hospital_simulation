-- Hospital event-processing and scheduling simulation demo
-- PostgreSQL/Supabase compatible seed script.
-- This design is event-centric: entity_id and case_id live directly on event facts.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT setseed(0.4242);

DROP TABLE IF EXISTS "BridgeEventLabel" CASCADE;
DROP TABLE IF EXISTS "FactCalendarSlot" CASCADE;
DROP TABLE IF EXISTS "FactSurgeryCapacity" CASCADE;
DROP TABLE IF EXISTS "FactOutpatientCapacity" CASCADE;
DROP TABLE IF EXISTS "DimSchedulingRule" CASCADE;
DROP TABLE IF EXISTS "DimSurgeryDurationDistribution" CASCADE;
DROP TABLE IF EXISTS "FactHistoricalEventDuration" CASCADE;
DROP TABLE IF EXISTS "DimOutpatientDurationRule" CASCADE;
DROP TABLE IF EXISTS "DimEventLabel" CASCADE;
DROP TABLE IF EXISTS "FactSchedulingEvent" CASCADE;
DROP TABLE IF EXISTS "FactPathwayTransition" CASCADE;
DROP TABLE IF EXISTS "FactEntryPointPathwayProbability" CASCADE;
DROP TABLE IF EXISTS "DimEntryPoint" CASCADE;
DROP TABLE IF EXISTS "DimPathway" CASCADE;
DROP TABLE IF EXISTS "FactCase" CASCADE;
DROP TABLE IF EXISTS "FactHospitalEvent" CASCADE;

CREATE TABLE "FactHospitalEvent" (
    hospital_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL,
    case_id uuid NOT NULL,
    start_datetime timestamp NOT NULL,
    end_datetime timestamp,
    table_source text NOT NULL,
    specialty text NOT NULL,
    department_name text,
    event_type text NOT NULL,
    priority text,
    status text NOT NULL,
    source_encounter_key text,
    linked_encounter_key text,
    order_key text,
    CONSTRAINT chk_hospital_event_datetime
        CHECK (end_datetime IS NULL OR end_datetime >= start_datetime),
    CONSTRAINT chk_hospital_event_type
        CHECK (
            event_type IN (
                'Referral',
                'Emerg_Sent_To_Or',
                'Emerg_Admit',
                'New Clinic Visit',
                'Follow-up Clinic Visit',
                'CaseRequest',
                'Surgery',
                'Post-Surgery Clinic Visit'
            )
        )
);

CREATE TABLE "FactCase" (
    case_id uuid PRIMARY KEY,
    pathway_id uuid NOT NULL REFERENCES "DimPathway" (pathway_id),
    priority_general text NOT NULL,
    priority_detail text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_fact_case_priority_general
        CHECK (priority_general IN ('Emergency', 'Urgent', 'Elective')),
    CONSTRAINT chk_fact_case_priority_detail
        CHECK (priority_detail IN ('1A', '1B', '1C', '1D', '1E', 'Elective'))
);

CREATE TABLE "DimPathway" (
    pathway_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pathway_name text NOT NULL UNIQUE,
    specialty text NOT NULL,
    description text
);

CREATE TABLE "DimEntryPoint" (
    entry_point_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_point_name text NOT NULL UNIQUE,
    description text
);

CREATE TABLE "FactEntryPointPathwayProbability" (
    entry_point_pathway_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_point_id uuid NOT NULL REFERENCES "DimEntryPoint" (entry_point_id),
    pathway_id uuid NOT NULL REFERENCES "DimPathway" (pathway_id),
    probability numeric(6,5) NOT NULL,
    condition_rule text,
    effective_start_date date NOT NULL,
    effective_end_date date,
    CONSTRAINT chk_entry_pathway_probability
        CHECK (probability >= 0 AND probability <= 1),
    CONSTRAINT chk_entry_pathway_effective_dates
        CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
    CONSTRAINT uq_entry_pathway_effective
        UNIQUE (entry_point_id, pathway_id, effective_start_date)
);

CREATE TABLE "FactPathwayTransition" (
    pathway_transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pathway_id uuid NOT NULL REFERENCES "DimPathway" (pathway_id),
    entry_point_name text,
    entry_point_priority text,
    case_priority text,
    path_variant text,
    current_state text NOT NULL,
    next_state text NOT NULL,
    probability numeric(6,5) NOT NULL,
    action_type text NOT NULL,
    is_terminal_state boolean NOT NULL DEFAULT false,
    max_repeat_count integer NOT NULL DEFAULT 1,
    CONSTRAINT chk_pathway_transition_probability
        CHECK (probability >= 0 AND probability <= 1),
    CONSTRAINT chk_pathway_transition_repeat_count
        CHECK (max_repeat_count >= 0),
    CONSTRAINT chk_pathway_transition_event_state
        CHECK (
            current_state IN (
                'Referral',
                'Emerg_Sent_To_Or',
                'Emerg_Admit',
                'New Clinic Visit',
                'Follow-up Clinic Visit',
                'CaseRequest',
                'Surgery',
                'Post-Surgery Clinic Visit'
            )
            AND next_state IN (
                'Referral',
                'Emerg_Sent_To_Or',
                'Emerg_Admit',
                'New Clinic Visit',
                'Follow-up Clinic Visit',
                'CaseRequest',
                'Surgery',
                'Post-Surgery Clinic Visit'
            )
        ),
    CONSTRAINT chk_pathway_transition_no_entry_to_entry
        CHECK (
            NOT (
                current_state IN ('Referral', 'Emerg_Sent_To_Or', 'Emerg_Admit')
                AND next_state IN ('Referral', 'Emerg_Sent_To_Or', 'Emerg_Admit')
            )
        )
);

CREATE TABLE "FactSchedulingEvent" (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL,
    case_id uuid NOT NULL,
    pathway_id uuid NOT NULL REFERENCES "DimPathway" (pathway_id),
    required_action text NOT NULL,
    event_category text NOT NULL,
    specialty text NOT NULL,
    priority text NOT NULL,
    estimated_duration_min integer NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    ready_at timestamp,
    status text NOT NULL,
    CONSTRAINT chk_scheduling_event_category
        CHECK (event_category IN ('Outpatient', 'Surgery')),
    CONSTRAINT chk_scheduling_event_duration
        CHECK (estimated_duration_min > 0),
    CONSTRAINT chk_scheduling_event_ready_at
        CHECK (ready_at IS NULL OR ready_at >= created_at),
    CONSTRAINT chk_scheduling_event_status
        CHECK (status IN ('Queued', 'Ready', 'Scheduled', 'Completed', 'Cancelled')),
    CONSTRAINT chk_scheduling_required_action
        CHECK (
            required_action IN (
                'New Clinic Visit',
                'Follow-up Clinic Visit',
                'CaseRequest',
                'Surgery'
            )
        )
);

CREATE TABLE "DimEventLabel" (
    label_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label_type text NOT NULL,
    label_name text NOT NULL UNIQUE,
    description text
);

CREATE TABLE "BridgeEventLabel" (
    event_id uuid NOT NULL REFERENCES "FactSchedulingEvent" (event_id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES "DimEventLabel" (label_id),
    assigned_at timestamp NOT NULL DEFAULT now(),
    source text NOT NULL,
    PRIMARY KEY (event_id, label_id)
);

CREATE TABLE "DimOutpatientDurationRule" (
    duration_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    specialty text NOT NULL,
    priority text NOT NULL,
    slot_duration_min integer NOT NULL,
    allowed_durations_min text NOT NULL,
    default_duration_min integer NOT NULL,
    CONSTRAINT chk_outpatient_duration_rule_slot
        CHECK (slot_duration_min > 0),
    CONSTRAINT chk_outpatient_duration_rule_default
        CHECK (default_duration_min > 0)
);

CREATE TABLE "FactHistoricalEventDuration" (
    historical_duration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_type text NOT NULL,
    specialty text NOT NULL,
    priority text NOT NULL,
    actual_duration_min integer NOT NULL,
    event_date date NOT NULL,
    CONSTRAINT chk_historical_event_duration_actual
        CHECK (actual_duration_min > 0)
);

CREATE TABLE "DimSurgeryDurationDistribution" (
    distribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_type text NOT NULL,
    specialty text NOT NULL,
    priority text NOT NULL,
    distribution_type text NOT NULL,
    mean_duration_min integer NOT NULL,
    stddev_duration_min integer NOT NULL,
    min_duration_min integer NOT NULL,
    max_duration_min integer NOT NULL,
    sample_size integer NOT NULL,
    CONSTRAINT chk_surgery_duration_distribution_stats
        CHECK (
            mean_duration_min > 0
            AND stddev_duration_min >= 0
            AND min_duration_min > 0
            AND max_duration_min >= min_duration_min
            AND sample_size >= 0
        )
);

CREATE TABLE "DimSchedulingRule" (
    rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name text NOT NULL UNIQUE,
    label_condition text NOT NULL,
    score_adjustment integer NOT NULL,
    rule_type text NOT NULL,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE "FactOutpatientCapacity" (
    capacity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    specialty text NOT NULL,
    provider_id text NOT NULL,
    location_id text NOT NULL,
    capacity_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    slot_length_min integer NOT NULL,
    max_slots integer NOT NULL,
    CONSTRAINT chk_outpatient_capacity_time
        CHECK (end_time > start_time),
    CONSTRAINT chk_outpatient_capacity_slot_length
        CHECK (slot_length_min > 0),
    CONSTRAINT chk_outpatient_capacity_max_slots
        CHECK (max_slots >= 0)
);

CREATE TABLE "FactSurgeryCapacity" (
    capacity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_room_id text NOT NULL,
    surgical_specialty text NOT NULL,
    capacity_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    available_minutes integer NOT NULL,
    reserved_minutes integer NOT NULL,
    CONSTRAINT chk_surgery_capacity_time
        CHECK (end_time > start_time),
    CONSTRAINT chk_surgery_capacity_minutes
        CHECK (available_minutes >= 0 AND reserved_minutes >= 0 AND reserved_minutes <= available_minutes)
);

CREATE TABLE "FactCalendarSlot" (
    slot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES "FactSchedulingEvent" (event_id),
    case_id uuid NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    scheduled_start timestamp NOT NULL,
    scheduled_end timestamp NOT NULL,
    duration_min integer NOT NULL,
    priority_score integer NOT NULL,
    slot_status text NOT NULL,
    CONSTRAINT chk_calendar_slot_resource_type
        CHECK (resource_type IN ('Outpatient', 'Surgery')),
    CONSTRAINT chk_calendar_slot_duration
        CHECK (duration_min > 0),
    CONSTRAINT chk_calendar_slot_datetime
        CHECK (scheduled_end > scheduled_start),
    CONSTRAINT chk_calendar_slot_status
        CHECK (slot_status IN ('Booked', 'Completed', 'Cancelled', 'Held'))
);

CREATE INDEX idx_fact_case_pathway_id
    ON "FactCase" (pathway_id);
CREATE INDEX idx_fact_case_priority_general
    ON "FactCase" (priority_general);

CREATE INDEX idx_fact_hospital_event_case_id
    ON "FactHospitalEvent" (case_id);
CREATE INDEX idx_fact_hospital_event_event_type
    ON "FactHospitalEvent" (event_type);
CREATE INDEX idx_fact_hospital_event_specialty
    ON "FactHospitalEvent" (specialty);
CREATE INDEX idx_fact_hospital_event_priority
    ON "FactHospitalEvent" (priority);
CREATE INDEX idx_fact_hospital_event_status
    ON "FactHospitalEvent" (status);
CREATE INDEX idx_fact_hospital_event_start_datetime
    ON "FactHospitalEvent" (start_datetime);

CREATE INDEX idx_fact_entry_point_pathway_entry_point
    ON "FactEntryPointPathwayProbability" (entry_point_id);
CREATE INDEX idx_fact_entry_point_pathway_pathway
    ON "FactEntryPointPathwayProbability" (pathway_id);

CREATE INDEX idx_fact_pathway_transition_pathway_state
    ON "FactPathwayTransition" (pathway_id, current_state);
CREATE INDEX idx_fact_pathway_transition_scope
    ON "FactPathwayTransition" (entry_point_name, entry_point_priority, case_priority, path_variant);

CREATE INDEX idx_fact_scheduling_event_event_category
    ON "FactSchedulingEvent" (event_category);
CREATE INDEX idx_fact_scheduling_event_specialty
    ON "FactSchedulingEvent" (specialty);
CREATE INDEX idx_fact_scheduling_event_priority
    ON "FactSchedulingEvent" (priority);
CREATE INDEX idx_fact_scheduling_event_status
    ON "FactSchedulingEvent" (status);
CREATE INDEX idx_fact_scheduling_event_case_id
    ON "FactSchedulingEvent" (case_id);
CREATE INDEX idx_fact_scheduling_event_created_at
    ON "FactSchedulingEvent" (created_at);
CREATE INDEX idx_fact_scheduling_event_ready_at
    ON "FactSchedulingEvent" (ready_at);

CREATE INDEX idx_bridge_event_label_label_id
    ON "BridgeEventLabel" (label_id);

CREATE INDEX idx_fact_historical_event_duration_specialty_priority
    ON "FactHistoricalEventDuration" (specialty, priority);
CREATE INDEX idx_fact_historical_event_duration_event_date
    ON "FactHistoricalEventDuration" (event_date);

CREATE INDEX idx_fact_outpatient_capacity_date_specialty
    ON "FactOutpatientCapacity" (capacity_date, specialty);
CREATE INDEX idx_fact_surgery_capacity_date_specialty
    ON "FactSurgeryCapacity" (capacity_date, surgical_specialty);

CREATE INDEX idx_fact_calendar_slot_event_id
    ON "FactCalendarSlot" (event_id);
CREATE INDEX idx_fact_calendar_slot_case_id
    ON "FactCalendarSlot" (case_id);
CREATE INDEX idx_fact_calendar_slot_resource_type
    ON "FactCalendarSlot" (resource_type);
CREATE INDEX idx_fact_calendar_slot_scheduled_start
    ON "FactCalendarSlot" (scheduled_start);
CREATE INDEX idx_fact_calendar_slot_slot_status
    ON "FactCalendarSlot" (slot_status);

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
    CURRENT_DATE - INTERVAL '1 year',
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
    p.sample_size + FLOOR(random() * 75)::integer
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
                * ((random() + random() + random() + random() + random() + random()) - 3)
            )::integer
        )
    ),
    CURRENT_DATE - FLOOR(random() * 365)::integer
FROM generate_series(1, 1500) AS gs(n)
CROSS JOIN LATERAL (
    SELECT *
    FROM "DimSurgeryDurationDistribution" d
    ORDER BY random() + gs.n * 0
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

CREATE TEMP TABLE tmp_demo_cases ON COMMIT DROP AS
WITH random_inputs AS (
    SELECT
        gs.case_n AS case_n,
        gen_random_uuid() AS entity_id,
        gen_random_uuid() AS case_id,
        gen_random_uuid() AS event_id,
        random() AS specialty_random,
        random() AS priority_random,
        random() AS category_random,
        random() AS status_random,
        random() AS age_random,
        random() AS ready_delay_random,
        random() AS created_hour_random,
        random() AS created_minute_random,
        random() AS action_random
    FROM generate_series(1, 1000) AS gs(case_n)
),
classified AS (
    SELECT
        r.*,
        CASE
            WHEN specialty_random < 0.220 THEN 'Orthopedics'
            WHEN specialty_random < 0.400 THEN 'Cardiology'
            WHEN specialty_random < 0.610 THEN 'Oncology'
            WHEN specialty_random < 0.820 THEN 'General Surgery'
            ELSE 'Neurology'
        END AS specialty,
        CASE
            WHEN priority_random < 0.080 THEN 'Emergency 1A'
            WHEN priority_random < 0.220 THEN 'Urgent 1B'
            WHEN priority_random < 0.440 THEN 'Urgent 1C'
            WHEN priority_random < 0.680 THEN 'Urgent 1D'
            ELSE 'Elective'
        END AS priority,
        CASE
            WHEN case_n <= 100 THEN FLOOR(age_random * 7)::integer
            WHEN case_n BETWEEN 101 AND 170 THEN 14 + FLOOR(age_random * 105)::integer
            ELSE 7 + FLOOR(age_random * 293)::integer
        END AS age_days
    FROM random_inputs r
),
with_category AS (
    SELECT
        c.*,
        CASE
            WHEN category_random < CASE
                WHEN priority = 'Emergency 1A' THEN 0.520
                WHEN priority = 'Urgent 1B' THEN 0.420
                WHEN priority = 'Urgent 1C' THEN 0.340
                WHEN priority = 'Urgent 1D' THEN 0.290
                ELSE 0.220
            END THEN 'Surgery'
            ELSE 'Outpatient'
        END AS event_category
    FROM classified c
),
with_status AS (
    SELECT
        c.*,
        CASE
            WHEN case_n <= 100 THEN
                CASE WHEN status_random < 0.550 THEN 'Queued' ELSE 'Ready' END
            WHEN case_n BETWEEN 101 AND 170 THEN 'Completed'
            WHEN status_random < 0.120 THEN 'Completed'
            WHEN status_random < 0.360 THEN 'Scheduled'
            WHEN status_random < 0.660 THEN 'Ready'
            WHEN status_random < 0.930 THEN 'Queued'
            ELSE 'Cancelled'
        END AS status
    FROM with_category c
),
with_timestamps AS (
    SELECT
        s.*,
        (
            CURRENT_DATE::timestamp
            - make_interval(days => age_days)
            + make_interval(
                hours => FLOOR(created_hour_random * 24)::integer,
                mins => FLOOR(created_minute_random * 60)::integer
            )
        ) AS created_at,
        FLOOR(
            LEAST(
                21,
                GREATEST(0, age_days - CASE WHEN status IN ('Completed', 'Scheduled') THEN 2 ELSE 0 END),
                ready_delay_random * 21
            )
        )::integer AS ready_delay_days
    FROM with_status s
),
finalized AS (
    SELECT
        t.*,
        created_at + make_interval(days => ready_delay_days) AS ready_at,
        CASE
            WHEN specialty = 'Orthopedics' AND event_category = 'Surgery' THEN 'Orthopedics Elective Joint Surgery'
            WHEN specialty = 'Orthopedics' THEN 'Orthopedics Fracture Clinic'
            WHEN specialty = 'Cardiology' AND event_category = 'Surgery' THEN 'Cardiology Procedure Review'
            WHEN specialty = 'Cardiology' THEN 'Cardiology Diagnostic Follow-up'
            WHEN specialty = 'Oncology' AND event_category = 'Surgery' THEN 'Oncology Surgical Review'
            WHEN specialty = 'Oncology' THEN 'Oncology Treatment Planning'
            WHEN specialty = 'General Surgery' AND event_category = 'Surgery' THEN 'General Surgery Operative Pathway'
            WHEN specialty = 'General Surgery' THEN 'General Surgery Consult'
            WHEN specialty = 'Neurology' AND event_category = 'Surgery' THEN 'Neurology Surgical Review'
            ELSE 'Neurology Consult'
        END AS pathway_name,
        CASE
            WHEN event_category = 'Surgery' AND action_random < 0.650 THEN 'Surgery'
            WHEN event_category = 'Surgery' THEN 'CaseRequest'
            WHEN action_random < 0.780 THEN 'Follow-up Clinic Visit'
            ELSE 'New Clinic Visit'
        END AS required_action
    FROM with_timestamps t
)
SELECT
    f.case_n,
    f.entity_id,
    f.case_id,
    f.event_id,
    f.specialty,
    f.priority,
    f.event_category,
    f.status,
    f.created_at,
    f.ready_at,
    f.pathway_name,
    f.required_action,
    CASE
        WHEN f.event_category = 'Outpatient' THEN
            CASE
                WHEN f.required_action = 'Follow-up Clinic Visit' THEN 15
                WHEN f.priority = 'Emergency 1A' THEN 15
                WHEN f.priority = 'Urgent 1B' THEN 20
                WHEN f.priority IN ('Urgent 1C', 'Urgent 1D') THEN 30
                ELSE 30
            END
        ELSE
            CASE f.specialty
                WHEN 'Orthopedics' THEN 105
                WHEN 'Cardiology' THEN 80
                WHEN 'Oncology' THEN 150
                WHEN 'General Surgery' THEN 95
                ELSE 165
            END
            + CASE f.priority
                WHEN 'Emergency 1A' THEN 25
                WHEN 'Urgent 1B' THEN 15
                WHEN 'Urgent 1C' THEN 5
                WHEN 'Urgent 1D' THEN 0
                ELSE -10
            END
    END AS estimated_duration_min
FROM finalized f;

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
FROM tmp_demo_cases c
JOIN "DimPathway" p
    ON p.pathway_name = c.pathway_name;

WITH historical AS (
    SELECT
        c.*,
        h.event_seq,
        c.created_at
            - make_interval(days => (h.event_seq * (1 + FLOOR(random() * 21)::integer)))
            - make_interval(hours => FLOOR(random() * 10)::integer) AS start_datetime,
        20 + FLOOR(random() * 180)::integer AS duration_min
    FROM tmp_demo_cases c
    CROSS JOIN LATERAL generate_series(1, 1 + FLOOR(random() * 3 + c.case_n * 0)::integer) AS h(event_seq)
)
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
    h.entity_id,
    h.case_id,
    h.start_datetime,
    CASE
        WHEN h.event_seq = 1
            OR (h.event_seq = 2 AND h.event_category = 'Surgery') THEN NULL
        ELSE h.start_datetime + make_interval(mins => h.duration_min)
    END,
    CASE
        WHEN h.event_seq = 1 THEN 'source_referral'
        WHEN h.event_seq = 2 THEN 'diagnostic_orders'
        ELSE 'encounter_history'
    END,
    h.specialty,
    CASE h.specialty
        WHEN 'Orthopedics' THEN 'Fracture and Joint Clinic'
        WHEN 'Cardiology' THEN 'Cardiac Diagnostics'
        WHEN 'Oncology' THEN 'Cancer Centre'
        WHEN 'General Surgery' THEN 'Surgical Assessment Unit'
        ELSE 'Neurosciences Clinic'
    END,
    CASE
        WHEN h.event_seq = 1 THEN 'Referral'
        WHEN h.event_seq = 2 AND h.event_category = 'Surgery' THEN 'CaseRequest'
        WHEN h.event_seq = 2 THEN 'New Clinic Visit'
        ELSE 'Follow-up Clinic Visit'
    END,
    CASE
        WHEN h.event_seq = 1 THEN
            CASE (h.case_n % 4)
                WHEN 0 THEN 'P1'
                WHEN 1 THEN 'P2'
                WHEN 2 THEN 'P3'
                ELSE 'P4'
            END
        WHEN h.event_seq = 2 AND h.event_category = 'Surgery' THEN
            CASE
                WHEN h.priority = 'Emergency 1A' THEN '1A'
                WHEN h.priority = 'Urgent 1B' THEN '1B'
                WHEN h.priority = 'Urgent 1C' THEN '1C'
                WHEN h.priority = 'Urgent 1D' THEN '1D'
                WHEN h.priority = 'Urgent 1E' THEN '1E'
                ELSE 'Elective'
            END
        WHEN h.event_seq >= 3 AND h.event_category = 'Surgery' THEN
            CASE (h.case_n % 4)
                WHEN 0 THEN '1'
                WHEN 1 THEN '2'
                WHEN 2 THEN '3'
                ELSE '4'
            END
        ELSE NULL
    END,
    CASE
        WHEN h.status = 'Cancelled' THEN 'Cancelled'
        WHEN h.event_seq = 1 THEN 'Received'
        ELSE 'Completed'
    END,
    'SRC-' || LPAD(h.case_n::text, 6, '0') || '-' || h.event_seq::text,
    'CASE-' || h.case_id::text,
    'ORD-' || LPAD(h.case_n::text, 6, '0') || '-' || h.event_seq::text
FROM historical h;

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
        WHEN c.priority = 'Emergency 1A' THEN 'Emergency'
        WHEN c.priority IN ('Urgent 1B', 'Urgent 1C', 'Urgent 1D', 'Urgent 1E') THEN 'Urgent'
        ELSE 'Elective'
    END,
    CASE
        WHEN c.priority = 'Emergency 1A' THEN '1A'
        WHEN c.priority = 'Urgent 1B' THEN '1B'
        WHEN c.priority = 'Urgent 1C' THEN '1C'
        WHEN c.priority = 'Urgent 1D' THEN '1D'
        WHEN c.priority = 'Urgent 1E' THEN '1E'
        ELSE 'Elective'
    END,
    c.created_at
FROM tmp_demo_cases c
JOIN "DimPathway" p
    ON p.pathway_name = c.pathway_name;

WITH label_assignments AS (
    SELECT event_id, 'urgent' AS label_name, created_at AS assigned_at, 'priority_rule' AS source
    FROM "FactSchedulingEvent"
    WHERE priority IN ('Emergency 1A', 'Urgent 1B', 'Urgent 1C', 'Urgent 1D')

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
      AND (specialty = 'Oncology' AND random() < 0.350)

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
        * (0.100 + random() * 0.200)
    )::integer
FROM rooms r
CROSS JOIN dates d;

WITH slot_candidates AS (
    SELECT
        e.*,
        ROW_NUMBER() OVER (ORDER BY e.created_at, e.event_id) AS slot_n
    FROM "FactSchedulingEvent" e
    WHERE e.status IN ('Scheduled', 'Completed')
       OR (e.status = 'Ready' AND random() < 0.180)
),
slot_start AS (
    SELECT
        sc.*,
        CASE
            WHEN sc.status = 'Completed' THEN
                CURRENT_DATE::timestamp
                - make_interval(days => FLOOR(random() * 7)::integer)
                + make_interval(hours => 8 + FLOOR(random() * 8)::integer, mins => FLOOR(random() * 4)::integer * 15)
            ELSE
                CURRENT_DATE::timestamp
                + make_interval(days => FLOOR(random() * 30)::integer)
                + make_interval(hours => 8 + FLOOR(random() * 8)::integer, mins => FLOOR(random() * 4)::integer * 15)
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

-- Quick sanity checks. Each SELECT should return one row.
SELECT 'FactSchedulingEvent count' AS check_name, COUNT(*) AS check_value
FROM "FactSchedulingEvent";

SELECT 'Distinct scheduling case_ids' AS check_name, COUNT(DISTINCT case_id) AS check_value
FROM "FactSchedulingEvent";

SELECT 'FactCalendarSlot count' AS check_name, COUNT(*) AS check_value
FROM "FactCalendarSlot";

-- Example dashboard metric queries:
-- Backlog count:
-- SELECT COUNT(*) FROM "FactSchedulingEvent" WHERE status IN ('Queued', 'Ready', 'Scheduled');
--
-- Average surgical wait time in days:
-- SELECT AVG(scheduled_start::date - ready_at::date)
-- FROM "FactSchedulingEvent" e
-- JOIN "FactCalendarSlot" s ON s.event_id = e.event_id
-- WHERE e.event_category = 'Surgery';
--
-- Percent over 6 months:
-- SELECT 100.0 * COUNT(*) FILTER (WHERE ready_at::date <= CURRENT_DATE - 180) / NULLIF(COUNT(*), 0)
-- FROM "FactSchedulingEvent"
-- WHERE status IN ('Queued', 'Ready', 'Scheduled');

-- Pathway forecast views (source of truth: sql/hospital_forecast_views.sql)
\ir sql/hospital_forecast_views.sql

COMMIT;

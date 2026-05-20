#!/usr/bin/env python3
"""Build middle section for hospital_event_scheduling_seed.sql (stdout)."""

print(
    r"""
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
)
SELECT
    c.case_n,
    c.entity_id,
    c.case_id,
    c.event_id,
    c.specialty,
    c.demo_bucket,
    c.urgent_tier,
    c.referral_tier,
    c.pathway_name,
    c.priority,
    c.event_category,
    c.required_action,
    c.status,
    c.surgery_duration_min,
    c.surgery_duration_min AS estimated_duration_min,
    c.entry_class,
    c.entry_status,
    c.anchor_ts,
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
    END AS t_ref_end,
    CASE
        WHEN c.demo_bucket = 'urgent'
            AND c.urgent_tier IN ('Urgent 1D', 'Urgent 1E')
            AND c.entry_class IN ('sent_or', 'admit_ed')
            AND c.case_n % 20 = 0 THEN
            COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
            + make_interval(days => (1 + (c.h2 % 4)))
        ELSE NULL::timestamp
    END AS t_ncv_urgent_start,
    CASE
        WHEN c.demo_bucket = 'urgent'
            AND c.urgent_tier IN ('Urgent 1D', 'Urgent 1E')
            AND c.entry_class IN ('sent_or', 'admit_ed')
            AND c.case_n % 20 = 0 THEN
            COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
            + make_interval(days => (1 + (c.h2 % 4)))
            + interval '40 minutes'
        ELSE NULL::timestamp
    END AS t_ncv_urgent_end,
    CASE
        WHEN c.demo_bucket = 'emergency' THEN c.anchor_ts + make_interval(mins => (c.h1 % 301))
        WHEN c.demo_bucket = 'urgent' THEN
            COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
            + make_interval(days => (1 + (c.h2 % 7)))
        ELSE NULL::timestamp
    END AS t_case_req_start,
    CASE
        WHEN c.demo_bucket IN ('emergency', 'urgent') THEN
            CASE
                WHEN c.demo_bucket = 'emergency' THEN c.anchor_ts + make_interval(mins => (c.h1 % 301))
                ELSE
                    COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
                    + make_interval(days => (1 + (c.h2 % 7)))
            END + interval '25 minutes'
        ELSE NULL::timestamp
    END AS t_case_req_end,
    CASE
        WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' THEN c.t_ref_end + interval '2 days'
        ELSE NULL::timestamp
    END AS t_ncv_ref_start,
    CASE
        WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' THEN c.t_ref_end + interval '2 days' + interval '40 minutes'
        ELSE NULL::timestamp
    END AS t_ncv_ref_end,
    CASE
        WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' AND c.h3 % 10 < 7 THEN
            c.t_ref_end + interval '2 days' + interval '3 days'
        ELSE NULL::timestamp
    END AS t_fu_ref_start,
    CASE
        WHEN c.demo_bucket = 'urgent' AND c.entry_class = 'referral' AND c.h3 % 10 < 7 THEN
            c.t_ref_end + interval '2 days' + interval '3 days' + interval '30 minutes'
        ELSE NULL::timestamp
    END AS t_fu_ref_end,
    CASE
        WHEN c.demo_bucket = 'elective' THEN
            c.anchor_ts
            + make_interval(
                days => CASE c.referral_tier
                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                    ELSE 28 + (c.h2 % 56)
                END
            )
        ELSE NULL::timestamp
    END AS t_ncv_elective_start,
    CASE
        WHEN c.demo_bucket = 'elective' THEN
            c.anchor_ts
            + make_interval(
                days => CASE c.referral_tier
                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                    ELSE 28 + (c.h2 % 56)
                END
            )
            + interval '45 minutes'
        ELSE NULL::timestamp
    END AS t_ncv_elective_end,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (3 + (c.h3 % 10)))
        ELSE NULL::timestamp
    END AS t_fu1_start,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (3 + (c.h3 % 10)))
            + interval '30 minutes'
        ELSE NULL::timestamp
    END AS t_fu1_end,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (10 + (c.h4 % 14)))
        ELSE NULL::timestamp
    END AS t_fu2_start,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (10 + (c.h4 % 14)))
            + interval '30 minutes'
        ELSE NULL::timestamp
    END AS t_fu2_end,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (18 + (c.h5 % 10)))
        ELSE NULL::timestamp
    END AS t_fu3_start,
    CASE
        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
            (
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (18 + (c.h5 % 10)))
            + interval '30 minutes'
        ELSE NULL::timestamp
    END AS t_fu3_end,
    CASE
        WHEN c.demo_bucket = 'elective' THEN
            COALESCE(
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (18 + (c.h5 % 10)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (10 + (c.h4 % 14)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (3 + (c.h3 % 10)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (2 + (c.h2 % 4)))
        ELSE NULL::timestamp
    END AS t_elect_req_start,
    CASE
        WHEN c.demo_bucket = 'elective' THEN
            COALESCE(
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (18 + (c.h5 % 10)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (10 + (c.h4 % 14)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                CASE
                    WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
                        (
                            c.anchor_ts
                            + make_interval(
                                days => CASE c.referral_tier
                                    WHEN 'P1' THEN 5 + (c.h1 % 8)
                                    WHEN 'P2' THEN 6 + (c.h1 % 9)
                                    WHEN 'P3' THEN 21 + (c.h2 % 49)
                                    ELSE 28 + (c.h2 % 56)
                                END
                            )
                            + interval '45 minutes'
                        )
                        + make_interval(days => (3 + (c.h3 % 10)))
                        + interval '30 minutes'
                    ELSE NULL::timestamp
                END,
                c.anchor_ts
                + make_interval(
                    days => CASE c.referral_tier
                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                        ELSE 28 + (c.h2 % 56)
                    END
                )
                + interval '45 minutes'
            )
            + make_interval(days => (2 + (c.h2 % 4)))
            + interval '20 minutes'
        ELSE NULL::timestamp
    END AS t_elect_req_end,
    CASE
        WHEN c.demo_bucket = 'emergency' THEN
            (
                (c.anchor_ts + make_interval(mins => (c.h1 % 301))) + interval '25 minutes'
            )
            + make_interval(
                mins => CASE
                    WHEN c.h2 % 100 < 92 THEN 5 + (c.h3 % 116)
                    ELSE 125 + (c.h3 % 36)
                END
            )
        WHEN c.demo_bucket = 'urgent' THEN
            (
                COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
                + make_interval(days => (1 + (c.h2 % 7)))
                + interval '25 minutes'
            )
            + CASE c.urgent_tier
                WHEN 'Urgent 1B' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(mins => 120 + (c.h3 % 361))
                        ELSE make_interval(mins => FLOOR(480 * 1.15)::integer + (c.h3 % 120))
                    END
                WHEN 'Urgent 1C' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(mins => 480 + (c.h3 % 1681))
                        ELSE make_interval(mins => FLOOR(2880 * 1.20)::integer + (c.h3 % 240))
                    END
                WHEN 'Urgent 1D' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(days => 2 + (c.h3 % 6))
                        ELSE make_interval(days => FLOOR(7 * 1.15)::integer + (c.h3 % 3))
                    END
                ELSE
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(days => 3 + (c.h3 % 12))
                        ELSE make_interval(days => FLOOR(14 * 1.20)::integer + (c.h3 % 4))
                    END
            END
        ELSE
            (
                COALESCE(
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (18 + (c.h5 % 10)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (10 + (c.h4 % 14)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (3 + (c.h3 % 10)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    c.anchor_ts
                    + make_interval(
                        days => CASE c.referral_tier
                            WHEN 'P1' THEN 5 + (c.h1 % 8)
                            WHEN 'P2' THEN 6 + (c.h1 % 9)
                            WHEN 'P3' THEN 21 + (c.h2 % 49)
                            ELSE 28 + (c.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (2 + (c.h2 % 4)))
                + interval '20 minutes'
            )
            + CASE
                WHEN c.h4 % 100 < 85 THEN make_interval(days => 150 + (c.h3 % 37))
                ELSE make_interval(days => 187 + (c.h3 % 54))
            END
    END AS t_surg_start,
    CASE
        WHEN c.demo_bucket = 'emergency' THEN
            (
                (c.anchor_ts + make_interval(mins => (c.h1 % 301))) + interval '25 minutes'
            )
            + make_interval(
                mins => CASE
                    WHEN c.h2 % 100 < 92 THEN 5 + (c.h3 % 116)
                    ELSE 125 + (c.h3 % 36)
                END
            )
            + make_interval(mins => c.surgery_duration_min)
        WHEN c.demo_bucket = 'urgent' THEN
            (
                COALESCE(c.t_admit_end, c.t_entry_end, c.anchor_ts + interval '30 minutes')
                + make_interval(days => (1 + (c.h2 % 7)))
                + interval '25 minutes'
            )
            + CASE c.urgent_tier
                WHEN 'Urgent 1B' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(mins => 120 + (c.h3 % 361))
                        ELSE make_interval(mins => FLOOR(480 * 1.15)::integer + (c.h3 % 120))
                    END
                WHEN 'Urgent 1C' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(mins => 480 + (c.h3 % 1681))
                        ELSE make_interval(mins => FLOOR(2880 * 1.20)::integer + (c.h3 % 240))
                    END
                WHEN 'Urgent 1D' THEN
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(days => 2 + (c.h3 % 6))
                        ELSE make_interval(days => FLOOR(7 * 1.15)::integer + (c.h3 % 3))
                    END
                ELSE
                    CASE
                        WHEN c.h4 % 100 < 85 THEN make_interval(days => 3 + (c.h3 % 12))
                        ELSE make_interval(days => FLOOR(14 * 1.20)::integer + (c.h3 % 4))
                    END
            END
            + make_interval(mins => c.surgery_duration_min)
        ELSE
            (
                COALESCE(
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 91 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (18 + (c.h5 % 10)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 70 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (10 + (c.h4 % 14)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    CASE
                        WHEN c.demo_bucket = 'elective' AND (c.case_n - 501) % 100 >= 20 THEN
                            (
                                c.anchor_ts
                                + make_interval(
                                    days => CASE c.referral_tier
                                        WHEN 'P1' THEN 5 + (c.h1 % 8)
                                        WHEN 'P2' THEN 6 + (c.h1 % 9)
                                        WHEN 'P3' THEN 21 + (c.h2 % 49)
                                        ELSE 28 + (c.h2 % 56)
                                    END
                                )
                                + interval '45 minutes'
                            )
                            + make_interval(days => (3 + (c.h3 % 10)))
                            + interval '30 minutes'
                        ELSE NULL::timestamp
                    END,
                    c.anchor_ts
                    + make_interval(
                        days => CASE c.referral_tier
                            WHEN 'P1' THEN 5 + (c.h1 % 8)
                            WHEN 'P2' THEN 6 + (c.h1 % 9)
                            WHEN 'P3' THEN 21 + (c.h2 % 49)
                            ELSE 28 + (c.h2 % 56)
                        END
                    )
                    + interval '45 minutes'
                )
                + make_interval(days => (2 + (c.h2 % 4)))
                + interval '20 minutes'
            )
            + CASE
                WHEN c.h4 % 100 < 85 THEN make_interval(days => 150 + (c.h3 % 37))
                ELSE make_interval(days => 187 + (c.h3 % 54))
            END
            + make_interval(mins => c.surgery_duration_min)
    END AS t_surg_end,
    CASE
        WHEN c.case_n % 100 < 70 THEN 1
        WHEN c.case_n % 100 < 90 THEN 2
        WHEN c.case_n % 100 < 98 THEN 3
        ELSE 4
    END::integer AS post_op_count,
    NULL::jsonb AS hosp_events
FROM c
);

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

UPDATE tmp_seed_cases t SET
    created_at = CASE
        WHEN t.demo_bucket = 'emergency' THEN t.anchor_ts
        WHEN t.demo_bucket = 'urgent' AND t.entry_class = 'referral' THEN t.t_ref_start
        WHEN t.demo_bucket = 'urgent' THEN t.t_entry_start
        ELSE t.t_ref_start
    END,
    ready_at = CASE
        WHEN t.demo_bucket = 'elective' THEN t.t_elect_req_end + interval '186 days'
        ELSE t.t_surg_start
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
"""
)

import type { Priority, Specialty } from "@/lib/dashboard-types";

export type DashboardCaseRecord = {
  caseId: string;
  specialty: Exclude<Specialty, "All specialties">;
  schedulingPriority: Exclude<Priority, "All priorities">;
  /** surgery.start_datetime - surgery_request.start_datetime (hours) */
  waitHours: number;
  queueStatus: "Ready" | "Scheduled" | "Completed";
};

const SPECIALTIES: DashboardCaseRecord["specialty"][] = [
  "Orthopedics",
  "Cardiology",
  "Oncology",
  "General Surgery",
  "Neurology",
];

/** Deterministic [0, 1) */
function u(n: number, lane: number): number {
  const x = Math.sin(n * 12.9898 + lane * 78.233 + 31.4159) * 43758.5453;
  return x - Math.floor(x);
}

function pickStatus(n: number): DashboardCaseRecord["queueStatus"] {
  const r = u(n, 99);
  if (r < 0.68) return "Completed";
  if (r < 0.9) return "Scheduled";
  return "Ready";
}

function drawWaitHours(
  n: number,
  schedulingPriority: DashboardCaseRecord["schedulingPriority"],
): number {
  const r85 = u(n, 1);
  const spread = u(n, 2);
  const lateSpread = u(n, 3);

  switch (schedulingPriority) {
    case "Emergency 1A": {
      if (r85 < 0.92) return 0.25 + spread * (2 - 0.25); // ~0.25–2 h
      return 2 + lateSpread * (3 - 2); // ~2–3 h (late branch)
    }
    case "Urgent 1B": {
      if (r85 < 0.85) return 2 + spread * (8 - 2); // 2–8 h
      return 8 * 1.1 + lateSpread * (8 * 1.3 - 8 * 1.1); // 1.1–1.3 × max
    }
    case "Urgent 1C": {
      if (r85 < 0.85) return 8 + spread * (48 - 8);
      return 48 * 1.1 + lateSpread * (48 * 1.3 - 48 * 1.1);
    }
    case "Urgent 1D": {
      const minH = 2 * 24;
      const maxH = 7 * 24;
      if (r85 < 0.85) return minH + spread * (maxH - minH);
      return maxH * 1.1 + lateSpread * (maxH * 1.3 - maxH * 1.1);
    }
    case "Urgent 1E": {
      const minH = 3 * 24;
      const maxH = 14 * 24;
      if (r85 < 0.85) return minH + spread * (maxH - minH);
      return maxH * 1.1 + lateSpread * (maxH * 1.3 - maxH * 1.1);
    }
    case "Elective": {
      // Mirror seed: 85% in 20–180 d (skew 50–110), 15% in 181–360 d; cap 360 d.
      const h1 = Math.floor(u(n, 11) * 10);
      const h2 = Math.floor(u(n, 12) * 1000);
      const h3 = Math.floor(u(n, 13) * 1000);
      const h4 = Math.floor(u(n, 14) * 100);
      const h5 = Math.floor(u(n, 15) * 1000);
      let waitDays: number;
      if (h4 < 85) {
        const chunk = h1 < 6 ? 50 + (h3 % 61) : 20 + Math.min(160, (h2 % 92) + (h5 % 69));
        waitDays = Math.min(180, chunk);
      } else {
        waitDays = Math.min(360, 181 + (h3 % 90) + (h2 % 90));
      }
      return waitDays * 24 + (h5 % 90) / 60; // sub-day jitter in hours
    }
    default:
      return 24;
  }
}

/**
 * Synthetic cohort matching demo scale (100 / 400 / 1500) with surgical waits
 * defined as request→surgery lag only (see metric engine).
 */
export function buildDashboardCaseRecords(): DashboardCaseRecord[] {
  const out: DashboardCaseRecord[] = [];
  for (let n = 1; n <= 2000; n += 1) {
    const specialty = SPECIALTIES[(n - 1) % SPECIALTIES.length];
    let schedulingPriority: DashboardCaseRecord["schedulingPriority"];
    if (n <= 100) schedulingPriority = "Emergency 1A";
    else if (n <= 200) schedulingPriority = "Urgent 1B";
    else if (n <= 300) schedulingPriority = "Urgent 1C";
    else if (n <= 400) schedulingPriority = "Urgent 1D";
    else if (n <= 500) schedulingPriority = "Urgent 1E";
    else schedulingPriority = "Elective";

    const waitHours = drawWaitHours(n, schedulingPriority);
    out.push({
      caseId: `case-${n}`,
      specialty,
      schedulingPriority,
      waitHours,
      queueStatus: pickStatus(n),
    });
  }
  return out;
}

import type {
  OutpatientTemplateSlot,
  TemplateComparisonRow,
  TemplateImpact,
  TemplateOptimizationResponse,
  TemplateSpecialty,
} from "@/types/template-optimization";
import { templateSpecialties } from "@/types/template-optimization";

const currentTemplate: OutpatientTemplateSlot[] = [
  {
    id: "new-5",
    visitType: "New Clinic Visit",
    durationMin: 5,
    slotsPerWeek: 2,
    totalMinutesPerWeek: 10,
  },
  {
    id: "new-15",
    visitType: "New Clinic Visit",
    durationMin: 15,
    slotsPerWeek: 4,
    totalMinutesPerWeek: 60,
  },
  {
    id: "new-30",
    visitType: "New Clinic Visit",
    durationMin: 30,
    slotsPerWeek: 2,
    totalMinutesPerWeek: 60,
  },
  {
    id: "follow-up-5",
    visitType: "Follow-up Clinic Visit",
    durationMin: 5,
    slotsPerWeek: 4,
    totalMinutesPerWeek: 20,
  },
  {
    id: "follow-up-15",
    visitType: "Follow-up Clinic Visit",
    durationMin: 15,
    slotsPerWeek: 6,
    totalMinutesPerWeek: 90,
  },
  {
    id: "follow-up-30",
    visitType: "Follow-up Clinic Visit",
    durationMin: 30,
    slotsPerWeek: 2,
    totalMinutesPerWeek: 60,
  },
  {
    id: "post-surgery-15",
    visitType: "Post-surgery Follow-up Clinic Visit",
    durationMin: 15,
    slotsPerWeek: 2,
    totalMinutesPerWeek: 30,
  },
  {
    id: "post-surgery-30",
    visitType: "Post-surgery Follow-up Clinic Visit",
    durationMin: 30,
    slotsPerWeek: 1,
    totalMinutesPerWeek: 30,
  },
];

const suggestedSlots: Array<Pick<OutpatientTemplateSlot, "id" | "slotsPerWeek">> = [
  { id: "new-5", slotsPerWeek: 3 },
  { id: "new-15", slotsPerWeek: 6 },
  { id: "new-30", slotsPerWeek: 3 },
  { id: "follow-up-5", slotsPerWeek: 3 },
  { id: "follow-up-15", slotsPerWeek: 4 },
  { id: "follow-up-30", slotsPerWeek: 2 },
  { id: "post-surgery-15", slotsPerWeek: 2 },
  { id: "post-surgery-30", slotsPerWeek: 1 },
];

function normalizeSpecialty(specialty?: string | null): TemplateSpecialty {
  return templateSpecialties.includes(specialty as TemplateSpecialty)
    ? (specialty as TemplateSpecialty)
    : "All Specialties";
}

function buildSuggestedTemplate() {
  return currentTemplate.map((slot) => {
    const suggested = suggestedSlots.find((item) => item.id === slot.id);
    const slotsPerWeek = suggested?.slotsPerWeek ?? slot.slotsPerWeek;
    return {
      ...slot,
      slotsPerWeek,
      totalMinutesPerWeek: slotsPerWeek * slot.durationMin,
      slotChange: slotsPerWeek - slot.slotsPerWeek,
    };
  });
}

function buildComparison(
  currentRows: OutpatientTemplateSlot[],
  suggestedRows: OutpatientTemplateSlot[],
): TemplateComparisonRow[] {
  return currentRows.map((current) => {
    const suggested = suggestedRows.find((row) => row.id === current.id) ?? current;
    return {
      id: current.id,
      visitType: current.visitType,
      durationMin: current.durationMin,
      currentSlots: current.slotsPerWeek,
      suggestedSlots: suggested.slotsPerWeek,
      slotChange: suggested.slotsPerWeek - current.slotsPerWeek,
      currentMinutes: current.totalMinutesPerWeek,
      suggestedMinutes: suggested.totalMinutesPerWeek,
      minuteChange: suggested.totalMinutesPerWeek - current.totalMinutesPerWeek,
    };
  });
}

function specialtyImpact(specialty: TemplateSpecialty): TemplateImpact {
  if (specialty === "Oncology") {
    return {
      percentOverStandard: { current: 27, suggested: 17 },
      averageWaitMonths: { current: 4.1, suggested: 3.2 },
      newClinicVisitAccess: "Improved",
      followUpClinicWaitTime: "Slight increase",
      capacityUtilization: { current: 84, suggested: 89 },
    };
  }

  if (specialty === "Orthopedics") {
    return {
      percentOverStandard: { current: 29, suggested: 18 },
      averageWaitMonths: { current: 4.4, suggested: 3.4 },
      newClinicVisitAccess: "Improved",
      followUpClinicWaitTime: "Slight increase",
      capacityUtilization: { current: 83, suggested: 90 },
    };
  }

  return {
    percentOverStandard: { current: 24, suggested: 15 },
    averageWaitMonths: { current: 3.9, suggested: 3.1 },
    newClinicVisitAccess: "Improved",
    followUpClinicWaitTime: "Slight increase",
    capacityUtilization: { current: 82, suggested: 88 },
  };
}

export function getOutpatientTemplateOptimization(
  specialty?: string | null,
): TemplateOptimizationResponse {
  const selectedSpecialty = normalizeSpecialty(specialty);
  const suggestedTemplate = buildSuggestedTemplate();
  const comparison = buildComparison(currentTemplate, suggestedTemplate);
  const currentMinutesPerWeek = currentTemplate.reduce(
    (sum, slot) => sum + slot.totalMinutesPerWeek,
    0,
  );
  const suggestedMinutesPerWeek = suggestedTemplate.reduce(
    (sum, slot) => sum + slot.totalMinutesPerWeek,
    0,
  );
  const differenceMinutesPerWeek = suggestedMinutesPerWeek - currentMinutesPerWeek;

  return {
    filters: {
      viewBy: "Specialty",
      specialty: selectedSpecialty,
    },
    currentTemplate,
    suggestedTemplate,
    comparison,
    impact: specialtyImpact(selectedSpecialty),
    capacityBalance: {
      currentMinutesPerWeek,
      suggestedMinutesPerWeek,
      differenceMinutesPerWeek,
      explanation:
        "Suggested mix is a reallocation of clinic template time with one 30-minute weekly buffer converted from unused admin/session overrun time.",
    },
    whyThisWorks: [
      "Main bottleneck is referral to new clinic visit.",
      "Current template allocates too much capacity to follow-up visits.",
      "Increasing new clinic visit slots reduces backlog accumulation.",
      "Reducing follow-up clinic slots has limited downstream impact.",
      "Post-surgery follow-up capacity remains protected.",
    ],
    recommendedActions: [
      "Rebalance outpatient clinic template to prioritize new clinic visits.",
      "Increase new clinic visit slots by reallocating follow-up visit capacity.",
      "Keep post-surgery follow-up slots unchanged.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

export type TemplateSpecialty =
  | "All Specialties"
  | "Orthopedics"
  | "Cardiology"
  | "Oncology"
  | "General Surgery"
  | "Neurology";

export type OutpatientVisitType =
  | "New Clinic Visit"
  | "Follow-up Clinic Visit"
  | "Post-surgery Follow-up Clinic Visit";

export type OutpatientTemplateSlot = {
  id: string;
  visitType: OutpatientVisitType;
  durationMin: 5 | 15 | 30;
  slotsPerWeek: number;
  totalMinutesPerWeek: number;
  slotChange?: number;
};

export type TemplateComparisonRow = {
  id: string;
  visitType: OutpatientVisitType;
  durationMin: 5 | 15 | 30;
  currentSlots: number;
  suggestedSlots: number;
  slotChange: number;
  currentMinutes: number;
  suggestedMinutes: number;
  minuteChange: number;
};

export type TemplateImpact = {
  percentOverStandard: {
    current: number;
    suggested: number;
  };
  averageWaitMonths: {
    current: number;
    suggested: number;
  };
  newClinicVisitAccess: string;
  followUpClinicWaitTime: string;
  capacityUtilization: {
    current: number;
    suggested: number;
  };
};

export type TemplateCapacityBalance = {
  currentMinutesPerWeek: number;
  suggestedMinutesPerWeek: number;
  differenceMinutesPerWeek: number;
  explanation: string;
};

export type TemplateOptimizationResponse = {
  filters: {
    viewBy: "Specialty";
    specialty: TemplateSpecialty;
  };
  currentTemplate: OutpatientTemplateSlot[];
  suggestedTemplate: OutpatientTemplateSlot[];
  comparison: TemplateComparisonRow[];
  impact: TemplateImpact;
  capacityBalance: TemplateCapacityBalance;
  whyThisWorks: string[];
  recommendedActions: string[];
  generatedAt: string;
};

export const templateSpecialties: TemplateSpecialty[] = [
  "All Specialties",
  "Orthopedics",
  "Cardiology",
  "Oncology",
  "General Surgery",
  "Neurology",
];

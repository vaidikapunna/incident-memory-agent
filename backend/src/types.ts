export interface IncidentInput {
  incidentId: string;
  symptoms: string;
  recentChange: string;
  additionalContext?: string;
}

export interface IncidentAnalysis {
  summary: string;
  likelyCauses: string[];
  investigationSteps: string[];
  recommendedAction: string;
  reasoning: string;
  confidence: number;
  historicalResolutionMatch: string;
}

export interface IncidentMemory {
  content: string;
  when: string | null;
  type: string;
}

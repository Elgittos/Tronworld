export type MotivationPressureName =
  | 'viability'
  | 'agency'
  | 'competence'
  | 'curiosity'
  | 'familiarity'
  | 'social'
  | 'construction'
  | 'continuity';

export type MotivationPressures = Record<MotivationPressureName, number>;

export type MotivationSecondaryNeedName = 'focus' | 'connection' | 'curiosity' | 'purpose';

export type MotivationNeedSignal = {
  satisfaction: number;
  pressure: number;
  confidence: number;
  evidence: string[];
};

export type MotivationNeedState = Record<MotivationSecondaryNeedName, MotivationNeedSignal> & {
  energy: MotivationNeedSignal & {
    runway: number;
    reserve: number;
    estimatedReturnCost: number;
  };
};

export type MotivationLatentState = {
  energyRunway: number;
  focus: number;
  connection: number;
  curiosity: number;
  purpose: number;
  commitment: number;
  frustration: number;
  safetyMargin: number;
  trust: number;
};

export type MotivationScoreParts = {
  needUtility: number;
  energyTerm: number;
  feasibility: number;
  safety: number;
  memory: number;
  commitment: number;
  novelty: number;
  trust: number;
  repeatPenalty: number;
  proximityPenalty: number;
  riskPenalty: number;
  vetoPenalty: number;
};

export type MotivationVeto = {
  id: string;
  severity: 'hard' | 'soft';
  reason: string;
};

export type MotivationAppraisal = {
  candidateId: string;
  total: number;
  pressures: MotivationPressures;
  scoreParts: MotivationScoreParts;
  risks: string[];
  reasons: string[];
  tensions: string[];
  vetoes: MotivationVeto[];
};

export type MotivationSnapshot = {
  avatarId?: string;
  tick?: number;
  summary: string;
  latent: MotivationLatentState;
  needs: MotivationNeedState;
  globalPressures: MotivationPressures;
  appraisals: MotivationAppraisal[];
  constraints: string[];
  assumptions: string[];
  budget: {
    inputCandidates: number;
    appraisedCandidates: number;
    maxAppraisals: number;
  };
};

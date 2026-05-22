import { AgentAction } from '../../actions/AgentActions';
import { AffordanceCandidate, AffordanceSource, AffordanceTargetKind } from '../affordances/types';
import { MotivationAppraisal, MotivationPressureName, MotivationPressures } from '../motivation/types';

export type PlanningMode = 'recover' | 'stabilize' | 'explore' | 'connect' | 'build' | 'continue' | 'observe';
export type PlanningHorizon = 'now' | 'soon' | 'extended';
export type PlanningPriority = 'critical' | 'high' | 'normal' | 'background';
export type PlanningSignalSource = AffordanceSource | 'motivation' | 'planner';
export type MemoryRole = 'none' | 'supporting' | 'remembered_target' | 'continuity_prior';

export type PlanningScoreParts = {
  pressureFit: number;
  motivation: number;
  confidence: number;
  continuity: number;
  grounding: number;
  urgency: number;
  riskPenalty: number;
};

export type PlanningInterrupt = {
  id: string;
  source: PlanningSignalSource;
  priority: PlanningPriority;
  pressure: MotivationPressureName;
  label: string;
  reason: string;
};

export type PlanningConstraint = {
  source: PlanningSignalSource;
  label: string;
  detail: string;
};

export type PlanCandidate = {
  id: string;
  affordanceId: string;
  action: AgentAction;
  label: string;
  objective: string;
  mode: PlanningMode;
  horizon: PlanningHorizon;
  score: number;
  scoreParts: PlanningScoreParts;
  pressures: MotivationPressures;
  confidence: number;
  risk: number;
  urgency: number;
  continuity: number;
  memoryRole: MemoryRole;
  target?: {
    kind: AffordanceTargetKind;
    id?: string;
    label: string;
  };
  validation: AffordanceCandidate['validation'];
  evidence: string[];
  risks: string[];
  blockers: string[];
  selectionReason: string;
  motivation?: MotivationAppraisal;
};

export type PlanningSnapshot = {
  avatarId?: string;
  tick?: number;
  mode: PlanningMode;
  summary: string;
  activeIntention: {
    currentGoal?: string;
    intendedNextStep?: string;
    recentDecision?: string;
  };
  pressureWeights: MotivationPressures;
  interruptions: PlanningInterrupt[];
  constraints: PlanningConstraint[];
  assumptions: string[];
  chosen?: PlanCandidate;
  alternatives: PlanCandidate[];
  candidates: PlanCandidate[];
  budget: {
    candidateCount: number;
    maxCandidates: number;
    maxAlternatives: number;
  };
};

export type PlanningOptions = {
  maxCandidates: number;
  maxAlternatives: number;
};

export const DEFAULT_PLANNING_OPTIONS: PlanningOptions = {
  maxCandidates: 6,
  maxAlternatives: 2,
};

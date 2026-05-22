import { AgentAction } from '../../actions/AgentActions';
import { Vec3 } from '../../world/types';

export type AffordanceSource =
  | 'awareness'
  | 'vision'
  | 'space'
  | 'energy'
  | 'social'
  | 'touch'
  | 'action_feedback'
  | 'attention'
  | 'system'
  | 'memory';

export type AffordanceTargetKind =
  | 'self'
  | 'position'
  | 'open_space'
  | 'tesla_node'
  | 'avatar'
  | 'block'
  | 'structure'
  | 'area';

export type AffordanceTarget = {
  kind: AffordanceTargetKind;
  id?: string;
  label: string;
  position?: Vec3;
};

export type AffordancePredictedEffects = {
  viability: number;
  agency: number;
  competence: number;
  curiosity: number;
  familiarity: number;
  social: number;
  construction: number;
  continuity: number;
  risk: number;
  energyDelta?: number;
  distanceToEnergy?: 'closer' | 'farther' | 'same' | 'unknown';
};

export type AffordanceCandidate = {
  id: string;
  action: AgentAction;
  label: string;
  description: string;
  sources: AffordanceSource[];
  target?: AffordanceTarget;
  preconditions: string[];
  evidence: string[];
  predictedEffects: AffordancePredictedEffects;
  confidence: number;
  grounding: 'sensed' | 'remembered' | 'sensed_and_remembered';
  validation: 'needs_engine_validation' | 'locally_grounded';
};

export type AffordanceOptions = {
  maxCandidates: number;
};

export const DEFAULT_AFFORDANCE_OPTIONS: AffordanceOptions = {
  maxCandidates: 24,
};

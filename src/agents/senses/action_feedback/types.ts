import { ActionRequest, ActionResult } from '../../../actions/actions';
import { WorldEvent } from '../../../world/WorldEvents';

export type ActionFeedbackOutcome = 'none' | 'accepted' | 'rejected' | 'failed' | 'unknown';

export type ActionFeedbackInput = {
  attemptedAction?: ActionRequest['type'] | string;
  result?: ActionResult;
  recentEvents?: WorldEvent[];
};

export type ActionFeedbackSnapshot = {
  avatarId: string;
  outcome: ActionFeedbackOutcome;
  attemptedAction?: string;
  resultMessage?: string;
  recentFailure?: string;
  recentDecision: string;
  intendedNextStep: string;
  recentWorldEvents: Array<{
    id: string;
    tick: number;
    message: string;
  }>;
  summary: string;
};

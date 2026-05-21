import { WorldState } from '../../../world/worldState';
import { ActionFeedbackInput, ActionFeedbackOutcome, ActionFeedbackSnapshot } from './types';

export function buildActionFeedbackSnapshot(
  world: WorldState,
  avatarId: string,
  input: ActionFeedbackInput = {},
): ActionFeedbackSnapshot | undefined {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return undefined;
  }

  const outcome = determineOutcome(input.result, avatar.recentFailure);
  const recentWorldEvents = (input.recentEvents ?? [])
    .slice(-5)
    .map((event) => ({
      id: event.id,
      tick: event.tick,
      message: event.message,
    }));

  return {
    avatarId: avatar.id,
    outcome,
    attemptedAction: input.attemptedAction,
    resultMessage: input.result?.message,
    recentFailure: avatar.recentFailure,
    recentDecision: avatar.recentDecision,
    intendedNextStep: avatar.intendedNextStep,
    recentWorldEvents,
    summary: summarizeActionFeedback(outcome, input.attemptedAction, input.result?.message, avatar.recentFailure, avatar.recentDecision),
  };
}

function determineOutcome(result: ActionFeedbackInput['result'], recentFailure?: string): ActionFeedbackOutcome {
  if (result) {
    return result.ok ? 'accepted' : 'rejected';
  }

  if (recentFailure) {
    return 'failed';
  }

  return 'none';
}

function summarizeActionFeedback(
  outcome: ActionFeedbackOutcome,
  attemptedAction: string | undefined,
  resultMessage: string | undefined,
  recentFailure: string | undefined,
  recentDecision: string,
): string {
  if (outcome === 'none') {
    return `No new action feedback. Recent state: ${recentDecision}`;
  }

  const action = attemptedAction ? `${attemptedAction}: ` : '';
  const message = resultMessage ?? recentFailure ?? recentDecision;
  return `Action feedback: ${action}${outcome}; ${message}`;
}

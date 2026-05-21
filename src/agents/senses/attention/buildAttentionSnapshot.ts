import { AttentionInput, AttentionItem, AttentionPriority, AttentionSnapshot } from './types';

export function buildAttentionSnapshot(avatarId: string, input: AttentionInput): AttentionSnapshot {
  const items = [
    ...energyItems(input),
    ...actionItems(input),
    ...socialItems(input),
    ...spaceItems(input),
    ...touchItems(input),
    ...visionItems(input),
    ...systemItems(input),
  ].sort(compareAttention);

  return {
    avatarId,
    items,
    primaryFocus: items[0],
    summary: summarizeAttention(items),
  };
}

function energyItems(input: AttentionInput): AttentionItem[] {
  const energy = input.energy;
  if (!energy) {
    return [];
  }

  if (energy.safetyState === 'shutdown' || energy.safetyState === 'urgent_recharge' || energy.safetyState === 'interference_danger') {
    return [{
      source: 'energy',
      priority: 'critical',
      label: 'Energy danger',
      reason: energy.safetyDescription,
    }];
  }

  if (energy.safetyState === 'needs_recharge') {
    return [{
      source: 'energy',
      priority: 'high',
      label: 'Energy low',
      reason: energy.safetyDescription,
    }];
  }

  if (energy.insideRechargeField) {
    return [{
      source: 'energy',
      priority: 'normal',
      label: 'Recharging',
      reason: energy.drain.description,
    }];
  }

  return [];
}

function actionItems(input: AttentionInput): AttentionItem[] {
  const feedback = input.actionFeedback;
  if (!feedback || feedback.outcome === 'none') {
    return [];
  }

  return [{
    source: 'action_feedback',
    priority: feedback.outcome === 'accepted' ? 'normal' : 'high',
    label: feedback.outcome === 'accepted' ? 'Action accepted' : 'Action problem',
    reason: feedback.resultMessage ?? feedback.recentFailure ?? feedback.recentDecision,
  }];
}

function socialItems(input: AttentionInput): AttentionItem[] {
  const social = input.social;
  if (!social) {
    return [];
  }

  if (social.avatarsNeedingEnergy.length > 0) {
    return [{
      source: 'social',
      priority: 'high',
      label: 'Avatar needs Energy',
      reason: `${social.avatarsNeedingEnergy[0].name} needs Energy.`,
    }];
  }

  if (social.reachableAvatars.length > 0) {
    return [{
      source: 'social',
      priority: 'normal',
      label: 'Avatar nearby',
      reason: `${social.reachableAvatars[0].name} is reachable.`,
    }];
  }

  return [];
}

function spaceItems(input: AttentionInput): AttentionItem[] {
  const space = input.space;
  if (!space) {
    return [];
  }

  if (space.localAreaType === 'blocked_pocket') {
    return [{
      source: 'space',
      priority: 'high',
      label: 'Movement blocked',
      reason: space.summary,
    }];
  }

  if (space.nearbyObstacles.length > 0) {
    return [{
      source: 'space',
      priority: 'normal',
      label: 'Nearby obstacle',
      reason: `Nearest obstacle is ${space.nearbyObstacles[0].label}.`,
    }];
  }

  return [];
}

function touchItems(input: AttentionInput): AttentionItem[] {
  const touch = input.touch;
  if (!touch) {
    return [];
  }

  if (touch.bodyContactState === 'airborne') {
    return [{
      source: 'touch',
      priority: 'normal',
      label: 'Airborne',
      reason: touch.summary,
    }];
  }

  if (touch.blockedContacts.length > 0) {
    return [{
      source: 'touch',
      priority: 'normal',
      label: 'Body contact',
      reason: touch.summary,
    }];
  }

  return [];
}

function visionItems(input: AttentionInput): AttentionItem[] {
  const vision = input.vision;
  if (!vision) {
    return [];
  }

  if (vision.teslaNodes.length > 0) {
    return [{
      source: 'vision',
      priority: 'normal',
      label: 'Tesla Node visible',
      reason: `${vision.teslaNodes[0].label} ${vision.teslaNodes[0].direction}.`,
    }];
  }

  if (vision.attentionCandidates.length > 0) {
    return [{
      source: 'vision',
      priority: 'background',
      label: 'Visible object',
      reason: `${vision.attentionCandidates[0].label} is noticeable.`,
    }];
  }

  return [];
}

function systemItems(input: AttentionInput): AttentionItem[] {
  const system = input.system;
  if (!system || system.simulationControlActive) {
    return [];
  }

  return [{
    source: 'system',
    priority: 'background',
    label: 'Chat limitation',
    reason: 'Chat cannot directly control the simulation.',
  }];
}

function compareAttention(a: AttentionItem, b: AttentionItem): number {
  return priorityRank(a.priority) - priorityRank(b.priority);
}

function priorityRank(priority: AttentionPriority): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'normal':
      return 2;
    case 'background':
      return 3;
  }
}

function summarizeAttention(items: AttentionItem[]): string {
  if (items.length === 0) {
    return 'No urgent attention target.';
  }

  const primary = items[0];
  return `Primary attention: ${primary.label}. ${primary.reason}`;
}

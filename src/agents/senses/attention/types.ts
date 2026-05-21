import { ActionFeedbackSnapshot } from '../action_feedback/types';
import { EnergySnapshot } from '../energy/types';
import { SocialSnapshot } from '../social/types';
import { SpatialAwarenessSnapshot } from '../space/types';
import { SystemSnapshot } from '../system/types';
import { TouchSnapshot } from '../touch/types';
import { VisionSnapshot } from '../vision/types';

export type AttentionPriority = 'critical' | 'high' | 'normal' | 'background';
export type AttentionSource = 'energy' | 'vision' | 'space' | 'social' | 'touch' | 'action_feedback' | 'system';

export type AttentionItem = {
  source: AttentionSource;
  priority: AttentionPriority;
  label: string;
  reason: string;
};

export type AttentionInput = {
  energy?: EnergySnapshot;
  vision?: VisionSnapshot;
  space?: SpatialAwarenessSnapshot;
  social?: SocialSnapshot;
  touch?: TouchSnapshot;
  actionFeedback?: ActionFeedbackSnapshot;
  system?: SystemSnapshot;
};

export type AttentionSnapshot = {
  avatarId: string;
  items: AttentionItem[];
  primaryFocus?: AttentionItem;
  summary: string;
};

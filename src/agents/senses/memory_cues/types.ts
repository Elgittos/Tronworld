import { ActionFeedbackSnapshot } from '../action_feedback/types';
import { AttentionSnapshot } from '../attention/types';
import { AwarenessSnapshot } from '../awareness/types';
import { EnergySnapshot } from '../energy/types';
import { SocialSnapshot } from '../social/types';
import { SpatialAwarenessSnapshot } from '../space/types';
import { SystemSnapshot } from '../system/types';
import { TouchSnapshot } from '../touch/types';
import { VisionSnapshot } from '../vision/types';

export type MemoryCuePriority = 'critical' | 'high' | 'normal' | 'background';

export type MemoryCue = {
  targetMemoryFiles: string[];
  reason: string;
  maxEntries: number;
  priority: MemoryCuePriority;
  source: string;
  tags: string[];
};

export type MemoryCueInput = {
  awareness?: AwarenessSnapshot;
  vision?: VisionSnapshot;
  space?: SpatialAwarenessSnapshot;
  energy?: EnergySnapshot;
  social?: SocialSnapshot;
  touch?: TouchSnapshot;
  actionFeedback?: ActionFeedbackSnapshot;
  attention?: AttentionSnapshot;
  system?: SystemSnapshot;
  userMessage?: string;
};

import { BlockRotation, Vec3 } from '../world/types';

export const AGENT_ACTION_TYPES = [
  'move_forward',
  'move_backward',
  'move_left',
  'move_right',
  'jump',
  'move_toward',
  'place_block',
  'remove_block',
  'scan',
  'handshake',
  'recalibrate',
  'recharge',
  'transfer_energy',
  'build_tesla_node',
  'wait',
] as const;

export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];
export type AgentBuildShape = 'cube' | 'half_cube' | 'ramp' | 'tile' | 'pillar';

export type AgentAction =
  | { action: 'move_forward' | 'move_backward' | 'move_left' | 'move_right' | 'jump' | 'wait' }
  | { action: 'move_toward'; target: Vec3 }
  | { action: 'place_block'; shape: AgentBuildShape; position: Vec3; rotation: BlockRotation; color?: string }
  | { action: 'remove_block'; targetBlockId?: string; position?: Vec3 }
  | { action: 'scan'; focus?: 'area' | 'structure' | 'agent' | 'tesla_node'; targetId?: string }
  | { action: 'handshake'; targetAgentId: string }
  | { action: 'recalibrate' }
  | { action: 'recharge' }
  | { action: 'transfer_energy'; targetAgentId: string; amount: number }
  | { action: 'build_tesla_node'; position: Vec3; contribution: number };

export type ActionSchema = {
  action: AgentActionType;
  description: string;
  parameters?: Record<string, string>;
};

export const AGENT_ACTION_SCHEMAS: ActionSchema[] = [
  { action: 'move_forward', description: 'Move forward using the current facing direction.' },
  { action: 'move_backward', description: 'Move backward from the current facing direction.' },
  { action: 'move_left', description: 'Move left relative to the current facing direction.' },
  { action: 'move_right', description: 'Move right relative to the current facing direction.' },
  { action: 'jump', description: 'Jump once if grounded.' },
  { action: 'move_toward', description: 'Move toward a visible or remembered position.', parameters: { target: '{x,y,z}' } },
  {
    action: 'place_block',
    description: 'Place a normal snapped block.',
    parameters: { shape: 'cube | half_cube | ramp | tile | pillar', position: '{x,y,z}', rotation: '0 | 90 | 180 | 270', color: 'optional hex color' },
  },
  { action: 'remove_block', description: 'Remove a nearby block or removable Tesla Node.', parameters: { targetBlockId: 'optional id', position: 'optional {x,y,z}' } },
  { action: 'scan', description: 'Spend Energy to inspect the local area more deeply.', parameters: { focus: 'area | structure | agent | tesla_node', targetId: 'optional id' } },
  { action: 'handshake', description: 'Handshake with a nearby active avatar.', parameters: { targetAgentId: 'avatar id' } },
  { action: 'recalibrate', description: 'Restore Focus by reviewing goal, recent decision, target, and next step.' },
  { action: 'recharge', description: 'Wait in an active Tesla field. Recharge is automatic when in range.' },
  { action: 'transfer_energy', description: 'Transfer Energy to a nearby avatar.', parameters: { targetAgentId: 'avatar id', amount: 'number' } },
  { action: 'build_tesla_node', description: 'Start a Tesla Node foundation on a valid floor position.', parameters: { position: '{x,y,z}', contribution: 'number' } },
  { action: 'wait', description: 'Do nothing for this decision tick.' },
];

export function isAgentActionType(value: string): value is AgentActionType {
  return (AGENT_ACTION_TYPES as readonly string[]).includes(value);
}

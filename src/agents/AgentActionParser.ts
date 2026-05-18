import { AgentAction, isAgentActionType } from '../actions/AgentActions';
import { AttentionTarget } from './AgentTypes';

export type ParsedAgentAction = {
  action: AgentAction;
  shortReason?: string;
  attentionTarget?: AttentionTarget;
  rawObject?: unknown;
  parseError?: string;
};

export class AgentActionParser {
  parse(input: string | AgentAction | unknown): ParsedAgentAction {
    if (typeof input !== 'string') {
      return this.normalizeObject(input);
    }

    const jsonText = this.extractJsonObject(input);
    if (!jsonText) {
      return this.wait(`No JSON object found in model output.`);
    }

    try {
      return this.normalizeObject(JSON.parse(jsonText));
    } catch (error) {
      return this.wait(`Invalid JSON: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  private normalizeObject(value: unknown): ParsedAgentAction {
    const record = value as Record<string, unknown> | undefined;
    if (!record || typeof record !== 'object') {
      return this.wait('Model output was not an object.');
    }

    const actionName = record.action;
    if (typeof actionName !== 'string' || !isAgentActionType(actionName)) {
      return this.wait('Unknown or missing action.');
    }

    const parameters = typeof record.parameters === 'object' && record.parameters ? (record.parameters as Record<string, unknown>) : {};
    const merged = { ...parameters, ...record, action: actionName } as Record<string, unknown>;
    const action = this.toAction(merged);

    return {
      action,
      shortReason: typeof record.shortReason === 'string' ? record.shortReason.slice(0, 180) : undefined,
      attentionTarget: this.toAttentionTarget(record.attentionTarget),
      rawObject: value,
      parseError: action.action === 'wait' && actionName !== 'wait' ? `Invalid parameters for ${actionName}.` : undefined,
    };
  }

  private toAction(record: Record<string, unknown>): AgentAction {
    switch (record.action) {
      case 'move_forward':
      case 'move_backward':
      case 'move_left':
      case 'move_right':
      case 'jump':
      case 'scan':
      case 'recalibrate':
      case 'recharge':
      case 'wait':
        return { action: record.action };
      case 'move_toward': {
        const target = this.toVec3(record.target);
        return target ? { action: 'move_toward', target } : { action: 'wait' };
      }
      case 'place_block': {
        const position = this.toVec3(record.position);
        const shape = record.shape;
        const rotation = record.rotation;
        if (!position || !this.isBuildShape(shape) || !this.isRotation(rotation)) {
          return { action: 'wait' };
        }
        return {
          action: 'place_block',
          shape,
          position,
          rotation,
          color: typeof record.color === 'string' ? record.color : undefined,
        };
      }
      case 'remove_block':
        return {
          action: 'remove_block',
          targetBlockId: typeof record.targetBlockId === 'string' ? record.targetBlockId : undefined,
          position: this.toVec3(record.position),
        };
      case 'handshake':
        return typeof record.targetAgentId === 'string'
          ? { action: 'handshake', targetAgentId: record.targetAgentId }
          : { action: 'wait' };
      case 'transfer_energy':
        return typeof record.targetAgentId === 'string' && Number.isFinite(record.amount)
          ? { action: 'transfer_energy', targetAgentId: record.targetAgentId, amount: Number(record.amount) }
          : { action: 'wait' };
      case 'build_tesla_node': {
        const position = this.toVec3(record.position);
        return position && Number.isFinite(record.contribution)
          ? { action: 'build_tesla_node', position, contribution: Number(record.contribution) }
          : { action: 'wait' };
      }
      default:
        return { action: 'wait' };
    }
  }

  private extractJsonObject(text: string): string | undefined {
    const cleaned = text.replace(/```(?:json)?/gi, '```').replace(/```/g, '');
    const start = cleaned.indexOf('{');
    if (start < 0) {
      return undefined;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i += 1) {
      const char = cleaned[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return cleaned.slice(start, i + 1);
        }
      }
    }

    return undefined;
  }

  private toVec3(value: unknown): { x: number; y: number; z: number } | undefined {
    const vec = value as { x?: unknown; y?: unknown; z?: unknown } | undefined;
    if (!vec || !Number.isFinite(vec.x) || !Number.isFinite(vec.y) || !Number.isFinite(vec.z)) {
      return undefined;
    }
    return { x: Number(vec.x), y: Number(vec.y), z: Number(vec.z) };
  }

  private toAttentionTarget(value: unknown): AttentionTarget | undefined {
    const target = value as Record<string, unknown> | undefined;
    if (!target || typeof target.type !== 'string') {
      return undefined;
    }
    return {
      type: target.type as AttentionTarget['type'],
      id: typeof target.id === 'string' ? target.id : undefined,
      position: this.toVec3(target.position),
    };
  }

  private isBuildShape(value: unknown): value is 'cube' | 'half_cube' | 'ramp' | 'tile' | 'pillar' {
    return value === 'cube' || value === 'half_cube' || value === 'ramp' || value === 'tile' || value === 'pillar';
  }

  private isRotation(value: unknown): value is 0 | 90 | 180 | 270 {
    return value === 0 || value === 90 || value === 180 || value === 270;
  }

  private wait(parseError: string): ParsedAgentAction {
    return {
      action: { action: 'wait' },
      parseError,
    };
  }
}

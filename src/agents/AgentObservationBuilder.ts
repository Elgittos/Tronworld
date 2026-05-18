import { WorldEventLog } from '../world/WorldEvents';
import { distance2D, Vec3, WORLD_RULES } from '../world/types';
import { WorldState } from '../world/worldState';
import { AgentObservation } from './AgentTypes';

const VISION_RADIUS = 12;
const MAX_BLOCKS = 14;

function energyState(energy: number, shutdown: boolean): AgentObservation['energyState'] {
  if (shutdown) {
    return 'shutdown';
  }
  if (energy <= 25) {
    return 'critical';
  }
  if (energy <= 65) {
    return 'medium';
  }
  return 'full';
}

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

export class AgentObservationBuilder {
  constructor(private readonly eventLog: WorldEventLog) {}

  build(agentId: string, world: WorldState): AgentObservation | undefined {
    const agent = world.avatars.get(agentId);
    if (!agent) {
      return undefined;
    }

    const nearbyAgents = [...world.avatars.values()]
      .filter((avatar) => avatar.id !== agent.id)
      .map((avatar) => ({
        id: avatar.id,
        name: avatar.name,
        distance: distance2D(agent.position, avatar.position),
        energyState: energyState(avatar.energy, avatar.shutdown),
        shutdown: avatar.shutdown,
      }))
      .filter((avatar) => avatar.distance <= VISION_RADIUS)
      .sort((a, b) => a.distance - b.distance);

    const nearbyTeslaNodes = [...world.teslaNodes.values()]
      .map((node) => ({
        id: node.id,
        distance: distance2D(agent.position, node.position),
        active: node.active,
        starting: node.starting,
        interference: node.interference,
        contribution: node.contribution,
        targetEnergy: node.targetEnergy,
        position: cloneVec3(node.position),
      }))
      .filter((node) => node.distance <= VISION_RADIUS + WORLD_RULES.teslaRadius)
      .sort((a, b) => a.distance - b.distance);

    const visibleBlocks = [...world.blocks.values()]
      .map((block) => ({
        id: block.id,
        shape: block.shape,
        distance: distance2D(agent.position, block.position),
        position: cloneVec3(block.position),
        rotation: block.rotation,
      }))
      .filter((block) => block.distance <= VISION_RADIUS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_BLOCKS);

    return {
      position: cloneVec3(agent.position),
      energy: agent.energy,
      energyState: energyState(agent.energy, agent.shutdown),
      motivators: { ...agent.motivators },
      nearbyAgents,
      nearbyTeslaNodes,
      visibleBlocks,
      visibleStructures: this.describeStructures(nearbyTeslaNodes.length, visibleBlocks.length),
      openDirections: this.openDirections(agent.position, world),
      currentGoal: agent.currentGoal,
      recentEvents: this.eventLog.recent(5, agent.id).map((event) => event.message),
    };
  }

  private describeStructures(teslaCount: number, blockCount: number): string[] {
    const structures: string[] = [];
    if (teslaCount > 0) {
      structures.push(`${teslaCount} Tesla Node field(s) visible`);
    }
    if (blockCount > 0) {
      structures.push(`${blockCount} placed block(s) visible`);
    }
    return structures.length > 0 ? structures : ['Open grid space'];
  }

  private openDirections(position: Vec3, world: WorldState): string[] {
    const checks = [
      { name: 'north', point: { x: position.x, y: 0, z: position.z - 2 } },
      { name: 'south', point: { x: position.x, y: 0, z: position.z + 2 } },
      { name: 'east', point: { x: position.x + 2, y: 0, z: position.z } },
      { name: 'west', point: { x: position.x - 2, y: 0, z: position.z } },
    ];

    return checks
      .filter((check) => ![...world.blocks.values()].some((block) => distance2D(check.point, block.position) < 1.1))
      .map((check) => check.name);
  }
}

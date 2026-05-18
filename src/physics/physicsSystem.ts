import RAPIER from '@dimforge/rapier3d-compat';
import { BlockInstance, BLOCK_DEFINITIONS, Vec3, WORLD_RULES } from '../world/types';

type RapierWorld = InstanceType<typeof RAPIER.World>;
type RapierRigidBody = InstanceType<typeof RAPIER.RigidBody>;
type RapierCollider = InstanceType<typeof RAPIER.Collider>;
type RapierCharacterController = InstanceType<typeof RAPIER.KinematicCharacterController>;

export type PhysicsAvatar = {
  id: string;
  body: RapierRigidBody;
  collider: RapierCollider;
  verticalVelocity: number;
  grounded: boolean;
};

export type PhysicsMoveResult = {
  position: Vec3;
  grounded: boolean;
};

export class PhysicsSystem {
  private readonly world: RapierWorld;
  private readonly controller: RapierCharacterController;
  private readonly avatars = new Map<string, PhysicsAvatar>();
  private readonly blockColliders = new Map<string, RapierCollider>();
  private readonly teslaColliders = new Map<string, RapierCollider>();

  private constructor(world: RapierWorld, controller: RapierCharacterController) {
    this.world = world;
    this.controller = controller;
    this.controller.enableAutostep(0.45, 0.25, true);
    this.controller.enableSnapToGround(0.35);
  }

  static async create(): Promise<PhysicsSystem> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    const ground = RAPIER.ColliderDesc.cuboid(5000, 0.05, 5000).setTranslation(0, -0.05, 0);
    world.createCollider(ground);

    return new PhysicsSystem(world, world.createCharacterController(0.02));
  }

  createAvatar(id: string, position: Vec3): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.55, 0.28).setTranslation(0, 0.85, 0),
      body,
    );

    this.avatars.set(id, {
      id,
      body,
      collider,
      verticalVelocity: 0,
      grounded: true,
    });
  }

  removeAvatar(id: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) {
      return;
    }

    this.world.removeRigidBody(avatar.body);
    this.avatars.delete(id);
  }

  createBlockCollider(block: BlockInstance): void {
    this.removeBlockCollider(block.id);

    const definition = BLOCK_DEFINITIONS[block.shape];
    let colliderDesc: InstanceType<typeof RAPIER.ColliderDesc>;

    if (block.shape === 'pillar') {
      colliderDesc = RAPIER.ColliderDesc.cylinder(definition.size.y / 2, 0.35);
    } else {
      colliderDesc = RAPIER.ColliderDesc.cuboid(definition.size.x / 2, definition.size.y / 2, definition.size.z / 2);
    }

    colliderDesc.setTranslation(block.position.x, block.position.y, block.position.z);
    this.blockColliders.set(block.id, this.world.createCollider(colliderDesc));
  }

  removeBlockCollider(blockId: string): void {
    const collider = this.blockColliders.get(blockId);
    if (!collider) {
      return;
    }

    this.world.removeCollider(collider, true);
    this.blockColliders.delete(blockId);
  }

  createTeslaCollider(nodeId: string, position: Vec3, height: number): void {
    this.removeTeslaCollider(nodeId);
    const collider = RAPIER.ColliderDesc.cylinder(height / 2, 0.55).setTranslation(position.x, height / 2, position.z);
    this.teslaColliders.set(nodeId, this.world.createCollider(collider));
  }

  removeTeslaCollider(nodeId: string): void {
    const collider = this.teslaColliders.get(nodeId);
    if (!collider) {
      return;
    }

    this.world.removeCollider(collider, true);
    this.teslaColliders.delete(nodeId);
  }

  moveAvatar(id: string, horizontalVelocity: Vec3, jump: boolean, dt: number): PhysicsMoveResult | undefined {
    const avatar = this.avatars.get(id);
    if (!avatar) {
      return undefined;
    }

    if (jump && avatar.grounded) {
      avatar.verticalVelocity = WORLD_RULES.avatarJumpVelocity;
      avatar.grounded = false;
    }

    avatar.verticalVelocity -= 18 * dt;
    avatar.verticalVelocity = Math.max(avatar.verticalVelocity, -16);

    const desired = {
      x: horizontalVelocity.x * dt,
      y: avatar.verticalVelocity * dt,
      z: horizontalVelocity.z * dt,
    };

    this.controller.computeColliderMovement(avatar.collider, desired);
    const movement = this.controller.computedMovement();
    const current = avatar.body.translation();
    avatar.body.setNextKinematicTranslation({
      x: current.x + movement.x,
      y: Math.max(0, current.y + movement.y),
      z: current.z + movement.z,
    });

    this.world.step();
    const next = avatar.body.translation();
    const grounded = next.y <= 0.001 || movement.y > desired.y + 0.001;

    if (grounded) {
      avatar.verticalVelocity = 0;
      avatar.grounded = true;
      if (next.y < 0.001) {
        avatar.body.setNextKinematicTranslation({ x: next.x, y: 0, z: next.z });
        this.world.step();
      }
    } else {
      avatar.grounded = false;
    }

    const after = avatar.body.translation();
    return {
      position: { x: after.x, y: Math.max(0, after.y), z: after.z },
      grounded: avatar.grounded,
    };
  }

  step(): void {
    this.world.step();
  }
}

import * as THREE from 'three';
import './style.css';
import { ActionResult, ActionSystem } from './actions/actions';
import { InputController } from './controls/inputController';
import { PhysicsSystem } from './physics/physicsSystem';
import { UIController } from './ui/uiController';
import { CameraMode, distance2D, WORLD_RULES } from './world/types';
import { WorldState } from './world/worldState';
import { WorldRenderer } from './render/worldRenderer';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

const world = new WorldState();
const actionSystem = new ActionSystem(world);
const renderer = new WorldRenderer(app);
const physics = await PhysicsSystem.create();
let cameraMode: CameraMode = 'third_person';
let lastActionResult: ActionResult | undefined;
let contextText = '';
let handshakeCooldown = 0;

const knownPhysicsBlocks = new Set<string>();
const knownPhysicsTeslaNodes = new Set<string>();

let ui!: UIController;
let controls!: InputController;
ui = new UIController({
  onCreateAvatar: (options) => {
    const avatar = world.createManualAvatar(options);
    physics.createAvatar(avatar.id, avatar.position);
    controls.freeCamera.position.copy(new THREE.Vector3(avatar.position.x + 5, 4.5, avatar.position.z + 7));
    world.lastMessage = `${avatar.name} is online near the starting Tesla Node.`;
  },
  onCameraModeChange: (mode) => {
    cameraMode = mode;
  },
});

controls = new InputController(renderer.renderer.domElement, {
  getMode: () => cameraMode,
  getAvatar: () => world.getSelectedAvatar(),
  getFreeSpeed: () => ui.freeCameraSpeed,
  onToggleBuild: () => ui.toggleBuildPanel(),
  onPrimary: () => handlePrimaryAction(),
  onSecondary: () => handleSecondaryAction(),
});

syncPhysicsObjects();

let previousTime = performance.now();
requestAnimationFrame(tick);

function tick(now: number): void {
  const dt = Math.min(0.05, (now - previousTime) / 1000);
  previousTime = now;
  handshakeCooldown = Math.max(0, handshakeCooldown - dt);
  contextText = '';

  const avatar = world.getSelectedAvatar();

  controls.updateHeldCamera(dt);
  controls.updateFreeCamera(dt);

  if (avatar && cameraMode !== 'free_camera') {
    const move = controls.getAvatarMove(avatar, dt);
    const physicsResult = physics.moveAvatar(avatar.id, move.velocity, move.jump, dt);

    if (physicsResult) {
      world.updateAvatarPose(avatar.id, physicsResult.position, avatar.yaw, avatar.pitch, physicsResult.grounded);
    }

    if (move.moving) {
      world.markAvatarMoved(avatar.id);
    }
  }

  handleHeldInteraction(dt);

  const placementResult = updateBuildingPreview();
  if (placementResult) {
    lastActionResult = placementResult;
  }

  world.update(dt);
  syncPhysicsObjects();
  renderer.setGlowLevel(ui.glowLevel);
  renderer.update(world, cameraMode, controls.freeCamera, controls.thirdPersonCamera, now / 1000);
  ui.update(world, placementResult ?? lastActionResult, contextText);

  requestAnimationFrame(tick);
}

function handlePrimaryAction(): void {
  const avatar = world.getSelectedAvatar();

  if (!avatar || !ui.buildOpen) {
    return;
  }

  const candidate = renderer.getPlacementCandidate(world, {
    shape: ui.selectedShape,
    color: ui.selectedColor,
    rotation: ui.rotation,
  }, avatar.id, controls.pointerNdc);

  if (!candidate) {
    lastActionResult = { ok: false, message: 'No build surface targeted.' };
    ui.setStatus(lastActionResult.message);
    return;
  }

  if (ui.selectedShape === 'tesla_node') {
    lastActionResult = actionSystem.apply({
      type: 'build_tesla_node',
      avatarId: avatar.id,
      position: candidate.position,
      rotation: candidate.rotation,
      color: candidate.color,
      surfaceNormal: candidate.surfaceNormal,
      targetKind: candidate.targetKind,
      targetId: candidate.targetId,
      contribution: ui.teslaContribution,
    });
  } else {
    lastActionResult = actionSystem.apply({
      type: 'place_block',
      avatarId: avatar.id,
      shape: ui.selectedShape,
      position: candidate.position,
      rotation: candidate.rotation,
      color: candidate.color,
      surfaceNormal: candidate.surfaceNormal,
      targetKind: candidate.targetKind,
      targetId: candidate.targetId,
    });
  }

  ui.setStatus(lastActionResult.message);
  syncPhysicsObjects();
}

function handleSecondaryAction(): void {
  const avatar = world.getSelectedAvatar();

  if (!avatar || !ui.buildOpen) {
    return;
  }

  const target = renderer.getLookTarget(world, avatar.id);

  if (!target || (target.kind !== 'block' && target.kind !== 'tesla_node') || !target.id) {
    lastActionResult = { ok: false, message: 'No removable target.' };
    ui.setStatus(lastActionResult.message);
    return;
  }

  lastActionResult = actionSystem.apply({
    type: 'remove_block',
    avatarId: avatar.id,
    targetId: target.id,
    targetKind: target.kind,
  });
  ui.setStatus(lastActionResult.message);
  syncPhysicsObjects();
}

function updateBuildingPreview(): ActionResult | undefined {
  const avatar = world.getSelectedAvatar();

  if (!avatar || !ui.buildOpen) {
    renderer.updateGhost(undefined, false);
    return undefined;
  }

  const candidate = renderer.getPlacementCandidate(world, {
    shape: ui.selectedShape,
    color: ui.selectedColor,
    rotation: ui.rotation,
  }, avatar.id, controls.pointerNdc);

  if (!candidate) {
    renderer.updateGhost(undefined, false);
    return { ok: false, message: 'No build surface targeted.' };
  }

  const result = actionSystem.validatePlacement(candidate, avatar.id);
  const enoughEnergy =
    ui.selectedShape === 'tesla_node'
      ? ui.teslaContribution > 0 && ui.teslaContribution <= avatar.energy
      : avatar.energy >= WORLD_RULES.normalBlockCost;
  const valid = result.ok && enoughEnergy;
  renderer.updateGhost(candidate, valid);

  if (!enoughEnergy) {
    return { ok: false, message: ui.selectedShape === 'tesla_node' ? 'Choose an affordable Tesla contribution.' : 'Not enough Energy.' };
  }

  return result;
}

function handleHeldInteraction(dt: number): void {
  const avatar = world.getSelectedAvatar();

  if (!avatar || cameraMode === 'free_camera') {
    return;
  }

  const target = renderer.getLookTarget(world, avatar.id);
  if (!target || !target.id) {
    return;
  }

  if (target.kind === 'tesla_node') {
    const node = world.teslaNodes.get(target.id);
    if (!node) {
      return;
    }

    if (!node.active) {
      const remaining = node.targetEnergy - node.contribution;
      contextText = `Tesla Node ${Math.floor(node.contribution)} / ${node.targetEnergy}, needs ${Math.ceil(remaining)} Energy.`;

      if (controls.getInteractHeld()) {
        const rate = WORLD_RULES.rechargePerSecond * dt;
        lastActionResult = actionSystem.apply({
          type: 'build_tesla_node',
          avatarId: avatar.id,
          nodeId: node.id,
          contribution: Math.min(rate, remaining, avatar.energy),
        });
      }
      return;
    }

    contextText = node.interference ? 'Tesla field interference detected.' : 'Active Tesla Node field.';
    return;
  }

  if (target.kind === 'avatar') {
    const other = world.avatars.get(target.id);
    if (!other || distance2D(avatar.position, other.position) > WORLD_RULES.interactReach) {
      return;
    }

    if (other.shutdown) {
      contextText = `${other.name} is shutdown. Energy transfer required.`;

      if (controls.getInteractHeld() && ui.transferCap > 0) {
        const transfer = Math.min(ui.transferCap, WORLD_RULES.rechargePerSecond * dt, avatar.energy - WORLD_RULES.donorReserveEnergy);
        if (transfer > 0) {
          lastActionResult = actionSystem.apply({
            type: 'transfer_energy',
            avatarId: avatar.id,
            targetAvatarId: other.id,
            amount: transfer,
          });
        }
      }
      return;
    }

    contextText = `${other.name} online.`;
    if (controls.getInteractHeld() && handshakeCooldown <= 0) {
      handshakeCooldown = 1.2;
      lastActionResult = actionSystem.apply({
        type: 'handshake',
        avatarId: avatar.id,
        targetAvatarId: other.id,
      });
    }
  }
}

function syncPhysicsObjects(): void {
  for (const block of world.blocks.values()) {
    if (!knownPhysicsBlocks.has(block.id)) {
      physics.createBlockCollider(block);
      knownPhysicsBlocks.add(block.id);
    }
  }

  for (const blockId of [...knownPhysicsBlocks]) {
    if (!world.blocks.has(blockId)) {
      physics.removeBlockCollider(blockId);
      knownPhysicsBlocks.delete(blockId);
    }
  }

  for (const node of world.teslaNodes.values()) {
    if (!knownPhysicsTeslaNodes.has(node.id)) {
      physics.createTeslaCollider(node.id, node.position, node.height);
      knownPhysicsTeslaNodes.add(node.id);
    }
  }

  for (const nodeId of [...knownPhysicsTeslaNodes]) {
    if (!world.teslaNodes.has(nodeId)) {
      physics.removeTeslaCollider(nodeId);
      knownPhysicsTeslaNodes.delete(nodeId);
    }
  }
}

import * as THREE from 'three';
import './style.css';
import { ActionResult, ActionSystem } from './actions/actions';
import { AgentBrainGateway } from './agents/AgentBrainGateway';
import { buildAvatarChatPrompt, formatVisionDebugForChat } from './agents/chat/buildAvatarChatPrompt';
import { buildAwarenessSnapshot } from './agents/senses/awareness/buildAwarenessSnapshot';
import { buildVisionSnapshot } from './agents/senses/vision/buildVisionSnapshot';
import { InputController } from './controls/inputController';
import { LMStudioRestClient } from './llm/LMStudioRestClient';
import { DEFAULT_LM_STUDIO_CONFIG, isLlmProvider, LLMProviderConfig, normalizeLlmBaseUrl, shouldPreferLmStudioRest } from './llm/LLMProviderConfig';
import { OpenAICompatibleClient } from './llm/OpenAICompatibleClient';
import { PhysicsSystem } from './physics/physicsSystem';
import { SoundEffects } from './ui/soundEffects';
import { UIController } from './ui/uiController';
import { AvatarState, CameraMode, distance2D, WORLD_RULES } from './world/types';
import { WorldEventLog } from './world/WorldEvents';
import { WorldState } from './world/worldState';
import { RaycastTarget, WorldRenderer } from './render/worldRenderer';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root.');
}

const world = new WorldState();
const soundEffects = new SoundEffects();
const actionSystem = new ActionSystem(world, {
  onBuildPlaced: (event) => {
    const listener = world.getSelectedAvatar();
    const builder = world.avatars.get(event.avatarId);
    soundEffects.playBuild(listener?.position, builder?.position ?? event.position);
  },
});
const eventLog = new WorldEventLog();
let currentLlmConfig = loadLlmConfig();
const agentGateway = new AgentBrainGateway(world, actionSystem, eventLog, currentLlmConfig);
const renderer = new WorldRenderer(app);
const physics = await PhysicsSystem.create();
let cameraMode: CameraMode = 'third_person';
let lastActionResult: ActionResult | undefined;
let contextText = '';
let handshakeCooldown = 0;

const knownPhysicsBlocks = new Set<string>();
const knownPhysicsTeslaNodes = new Set<string>();
const stepPhases = new Map<string, number>();

let ui!: UIController;
let controls!: InputController;
ui = new UIController({
  onCreateAvatar: (options) => {
    const avatar =
      options.creationType === 'ai'
        ? world.createAiAvatar({
            name: options.name,
            color: options.color,
            eyeStyle: options.eyeStyle,
            provider: options.provider,
            model: options.model,
          })
        : world.createManualAvatar(options);
    physics.createAvatar(avatar.id, avatar.position);
    if (options.creationType === 'manual') {
      ensureAiAgent();
    }
    ui.startAmbientAudio();
    controls.freeCamera.position.copy(new THREE.Vector3(avatar.position.x + 5, 4.5, avatar.position.z + 7));
    world.lastMessage = `${avatar.name} is online near the starting Tesla Node.`;
    logSystem(`Avatar created: ${avatar.name}`);
  },
  onCameraModeChange: (mode) => {
    cameraMode = mode;
  },
  onSpawnAiAvatar: () => {
    const agent = spawnAiAgent();
    world.lastMessage = `${agent.name} spawned from the menu.`;
    logSystem(`Avatar created: ${agent.name}`);
  },
  onLlmConfigChange: (config) => {
    currentLlmConfig = config;
    agentGateway.setConfig(config);
    world.lastMessage = `AI connection set to ${config.provider}.`;
  },
  onMenuClick: () => soundEffects.playMenuClick(),
  onSelectAvatar: (avatarId, intent) => {
    const avatar = world.selectAvatar(avatarId);
    if (!avatar) {
      return;
    }

    if (intent === 'control' && !world.isAvatarControllable(avatar.id)) {
      ui.setStatus('AI-occupied avatar cannot be directly controlled.');
      logSystem(`Viewing AI-occupied avatar: ${avatar.name}`);
      return;
    }

    controls.thirdPersonCamera.orbitYawOffset = 0;
    controls.thirdPersonCamera.orbitPitchOffset = 0;
    world.lastMessage = intent === 'control' ? `Controlling ${avatar.name}.` : `Viewing ${avatar.name}.`;
    logSystem(`${intent === 'control' ? 'Control switched to' : 'Viewing'}: ${avatar.name}`);
  },
  onAssignAi: (avatarId) => {
    const brain = world.assignAiBrain(avatarId, {
      provider: ui.llmProvider,
      model: ui.llmModel,
    });
    const avatar = world.avatars.get(avatarId);
    if (brain && avatar) {
      logSystem(`AI assigned to: ${avatar.name}`);
    }
  },
  onDisconnectAi: (avatarId) => {
    const avatar = world.disconnectAiBrain(avatarId);
    if (avatar) {
      logSystem(`AI disconnected from: ${avatar.name}`);
    }
  },
  onDeleteAvatar: (avatarId) => {
    const avatar = world.deleteAvatar(avatarId);
    if (avatar) {
      physics.removeAvatar(avatar.id);
      logSystem(`Avatar deleted: ${avatar.name}`);
    }
  },
  onAvatarChat: (avatarId, message) => chatWithAvatarModel(avatarId, message),
});

controls = new InputController(renderer.renderer.domElement, {
  getMode: () => cameraMode,
  getAvatar: () => world.getSelectedAvatar(),
  getFreeSpeed: () => ui.freeCameraSpeed,
  getAvatarSpeed: () => ui.avatarWalkSpeed,
  getOrbitHorizontalInverted: () => ui.orbitHorizontalInverted,
  getOrbitVerticalInverted: () => ui.orbitVerticalInverted,
  getBuildOpen: () => ui.buildOpen,
  getAvatarControllable: () => world.isAvatarControllable(world.selectedAvatarId),
  onToggleBuild: () => {
    const avatar = world.getSelectedAvatar();
    if (!avatar || world.isAvatarControllable(avatar.id)) {
      ui.toggleBuildPanel();
      return;
    }

    ui.setStatus('AI-occupied avatar cannot be directly controlled.');
  },
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
  let avatarMoving = false;

  controls.updateFreeCamera(dt);
  agentGateway.update(now);

  if (avatar && cameraMode !== 'free_camera' && world.isAvatarControllable(avatar.id)) {
    const move = controls.getAvatarMove(avatar, dt);
    avatarMoving = move.moving;
    const physicsResult = physics.moveAvatar(avatar.id, move.velocity, move.jump, dt);

    if (physicsResult) {
      world.updateAvatarPose(avatar.id, physicsResult.position, avatar.yaw, avatar.pitch, physicsResult.grounded);
    }

    if (move.moving) {
      world.markAvatarMoved(avatar.id);
    }
  }

  updateAiAgents(dt, now);
  updateAvatarStepSounds(now);

  controls.updateHeldCamera(dt, cameraMode === 'third_person' && avatarMoving);

  handleHeldInteraction(dt);

  const placementResult = updateBuildingPreview();
  if (placementResult) {
    lastActionResult = placementResult;
  }

  world.update(dt);
  syncPhysicsObjects();
  const glowSettings = ui.getGlowSettings(world);
  renderer.setGlowLevel(glowSettings);
  renderer.update(world, cameraMode, controls.freeCamera, controls.thirdPersonCamera, glowSettings, now / 1000);
  ui.update(world, placementResult ?? lastActionResult, contextText, eventLog.recent(80));

  requestAnimationFrame(tick);
}

function ensureAiAgent(): void {
  if ([...world.avatars.values()].some((avatar) => avatar.control === 'ai')) {
    return;
  }

  spawnAiAgent('Grid Witness');
}

function spawnAiAgent(name?: string) {
  const aiCount = [...world.avatars.values()].filter((avatar) => avatar.control === 'ai').length;
  const agent = world.createAiAvatar({
    name: name ?? `Grid Witness ${aiCount + 1}`,
    color: '#44f2ff',
    provider: ui?.llmProvider ?? DEFAULT_LM_STUDIO_CONFIG.provider,
    model: ui?.llmModel ?? DEFAULT_LM_STUDIO_CONFIG.model,
    position: { x: -2.5 - aiCount * 2.4, y: 0, z: 3.5 + aiCount * 1.4 },
  });
  physics.createAvatar(agent.id, agent.position);
  return agent;
}

function updateAiAgents(dt: number, now: number): void {
  for (const agent of world.avatars.values()) {
    if (agent.control !== 'ai') {
      continue;
    }

    const move = agentGateway.getMoveFrame(agent.id, now, ui.avatarWalkSpeed);
    const physicsResult = physics.moveAvatar(agent.id, move.velocity, move.jump, dt);

    if (physicsResult) {
      world.updateAvatarPose(agent.id, physicsResult.position, agent.yaw, agent.pitch, physicsResult.grounded);
    }

    if (move.moving) {
      world.markAvatarMoved(agent.id);
    }
  }
}

function updateAvatarStepSounds(now: number): void {
  const time = now / 1000;
  const listener = world.getSelectedAvatar()?.position;

  for (const avatar of world.avatars.values()) {
    const moving = avatar.isMoving && avatar.grounded && !avatar.shutdown;

    if (!moving) {
      stepPhases.delete(avatar.id);
      continue;
    }

    const phase = Math.floor((time * 7 - Math.PI / 2) / Math.PI);
    const previousPhase = stepPhases.get(avatar.id);
    stepPhases.set(avatar.id, phase);

    if (previousPhase === undefined || previousPhase === phase) {
      continue;
    }

    const strength = avatar.control === 'ai' ? 0.82 : 1;
    soundEffects.playStep(listener, avatar.position, strength);
  }
}

function loadLlmConfig(): LLMProviderConfig {
  const storage = typeof window === 'undefined' ? undefined : window.localStorage;
  const storedProviderValue = storage?.getItem('tron-world:llm-provider');
  const storedProvider = isLlmProvider(storedProviderValue) ? storedProviderValue : DEFAULT_LM_STUDIO_CONFIG.provider;
  const storedBaseUrl = storage?.getItem('tron-world:llm-base-url') ?? DEFAULT_LM_STUDIO_CONFIG.baseUrl;
  const provider = shouldPreferLmStudioRest(storedProvider, storedBaseUrl) ? 'lmstudio-rest' : storedProvider;

  return {
    ...DEFAULT_LM_STUDIO_CONFIG,
    provider,
    baseUrl: normalizeLlmBaseUrl(storedBaseUrl, provider),
    model: storage?.getItem('tron-world:llm-model') ?? DEFAULT_LM_STUDIO_CONFIG.model,
    apiKey: storage?.getItem('tron-world:llm-api-key') ?? DEFAULT_LM_STUDIO_CONFIG.apiKey,
  };
}

function logSystem(message: string): void {
  eventLog.record({
    tick: world.tick,
    type: 'world',
    message,
  });
}

function handlePrimaryAction(): void {
  const avatar = world.getSelectedAvatar();

  if (!avatar || !ui.buildOpen) {
    return;
  }

  if (!world.isAvatarControllable(avatar.id)) {
    lastActionResult = { ok: false, message: 'AI-occupied avatar cannot be directly controlled.' };
    ui.setStatus(lastActionResult.message);
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

  if (!ui.buildOpen) {
    const target = renderer.getLookTarget(world, avatar?.id, controls.pointerNdc);
    if (target?.kind === 'avatar' && target.id) {
      const targetAvatar = world.avatars.get(target.id);
      const screenPoint = targetAvatar
        ? renderer.worldToScreen({
            x: targetAvatar.position.x,
            y: targetAvatar.position.y + 1.55,
            z: targetAvatar.position.z,
          })
        : renderer.worldToScreen(target.point);
      ui.openAvatarPanel(world, target.id, screenPoint.visible ? screenPoint : undefined);
    }
    return;
  }

  if (!avatar) {
    return;
  }

  if (!world.isAvatarControllable(avatar.id)) {
    lastActionResult = { ok: false, message: 'AI-occupied avatar cannot be directly controlled.' };
    ui.setStatus(lastActionResult.message);
    return;
  }

  const target = renderer.getLookTarget(world, avatar.id, controls.pointerNdc, 80);

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
  if (lastActionResult.ok) {
    logSystem(`Removed ${target.kind}: ${target.id}`);
  }
  ui.setStatus(lastActionResult.message);
  syncPhysicsObjects();
}

async function chatWithAvatarModel(avatarId: string, message: string): Promise<string> {
  const avatar = world.avatars.get(avatarId);
  if (!avatar) {
    return 'Avatar no longer exists.';
  }

  const brain = avatar.brainId ? world.brains.get(avatar.brainId) : undefined;
  const awareness = buildAwarenessSnapshot(world, avatar.id);
  const vision = buildVisionSnapshot(world, avatar.id, {
    range: 18,
    fieldOfViewDegrees: 360,
    maxItemsPerCategory: 12,
  });
  if (isVisionDebugRequest(message)) {
    return formatVisionDebugForChat(vision, [...world.blocks.values()]);
  }

  const provider = brain && isLlmProvider(brain.provider) ? brain.provider : currentLlmConfig.provider;
  const config: LLMProviderConfig = {
    ...currentLlmConfig,
    provider,
    model: brain?.model || currentLlmConfig.model || DEFAULT_LM_STUDIO_CONFIG.model,
    baseUrl: normalizeLlmBaseUrl(currentLlmConfig.baseUrl, provider),
  };
  const client = provider === 'lmstudio-rest' ? new LMStudioRestClient(config) : new OpenAICompatibleClient(config);
  const messages = buildAvatarChatPrompt({
    avatar,
    brain,
    awareness,
    vision,
    worldBlocks: [...world.blocks.values()],
    userMessage: message,
    maxEnergy: WORLD_RULES.maxEnergy,
  });

  const result = await client.completeChat(messages);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.content;
}

function isVisionDebugRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'debug vision' || normalized === 'raw vision' || normalized === 'show raw vision' || normalized === 'vision debug';
}

function updateBuildingPreview(): ActionResult | undefined {
  const avatar = world.getSelectedAvatar();

  if (!avatar || !ui.buildOpen) {
    renderer.updateGhost(undefined, false);
    renderer.updateDeleteGhost(world, undefined);
    return undefined;
  }

  if (!world.isAvatarControllable(avatar.id)) {
    renderer.updateGhost(undefined, false);
    renderer.updateDeleteGhost(world, undefined);
    return { ok: false, message: 'AI-occupied avatar cannot be directly controlled.' };
  }

  const target = renderer.getLookTarget(world, avatar.id, controls.pointerNdc, 80);
  renderer.updateDeleteGhost(world, isRemovableBuildTargetInReach(avatar, target) ? target : undefined);

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

function isRemovableBuildTargetInReach(avatar: AvatarState, target: RaycastTarget | undefined): boolean {
  if (!target?.id || (target.kind !== 'block' && target.kind !== 'tesla_node')) {
    return false;
  }

  const position = target.kind === 'block' ? world.blocks.get(target.id)?.position : world.teslaNodes.get(target.id)?.position;
  return !!position && distance2D(avatar.position, position) <= WORLD_RULES.buildReach;
}

function handleHeldInteraction(dt: number): void {
  const avatar = world.getSelectedAvatar();

  if (!avatar || cameraMode === 'free_camera' || !world.isAvatarControllable(avatar.id)) {
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

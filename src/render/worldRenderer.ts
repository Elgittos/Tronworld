import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Chunk } from '../world/types';
import {
  AvatarState,
  BlockShape,
  BLOCK_DEFINITIONS,
  CameraMode,
  PlacementCandidate,
  PlacementTargetKind,
  Vec3,
} from '../world/types';
import { WorldState } from '../world/worldState';
import { AvatarGlowSettings, AvatarVisual } from './avatarVisual';
import { createBlockVisual, createGhostVisual, updateGhostVisual } from './blockVisual';
import { disposeObject, applyRaycastMeta } from './geometry';
import { createTeslaNodeVisual, TeslaGlowSettings } from './teslaNodeVisual';

export type FreeCameraState = {
  position: THREE.Vector3;
  yaw: number;
  pitch: number;
};

export type ThirdPersonCameraState = {
  orbitYawOffset: number;
  orbitPitchOffset: number;
  steerFollow: boolean;
};

export type BuildSelection = {
  shape: BlockShape;
  color: string;
  rotation: 0 | 90 | 180 | 270;
};

export type RaycastTarget = {
  kind: PlacementTargetKind | 'avatar';
  id?: string;
  point: Vec3;
  normal: Vec3;
};

export type GlowSettings = {
  sceneBloom: number;
  tesla: TeslaGlowSettings;
  avatar: AvatarGlowSettings;
};

type VisualEntry = {
  group: THREE.Group;
  signature: string;
};

const GRID_COLOR = 0x00ff88;
const BACKGROUND_COLOR = 0x020610;
const CAMERA_HEIGHT = 1.62;

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 900);

  private readonly raycaster = new THREE.Raycaster();
  private readonly bloomPass: UnrealBloomPass;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly chunkGroups = new Map<string, THREE.Group>();
  private readonly blockGroups = new Map<string, THREE.Group>();
  private readonly teslaGroups = new Map<string, VisualEntry>();
  private readonly avatarGroups = new Map<string, AvatarVisual>();
  private readonly ghostRoot = new THREE.Group();
  private readonly avatarFillLight = new THREE.PointLight(0x00ff88, 0.5, 7);
  private readonly groundPlane: THREE.Mesh;
  private ghostShape?: BlockShape;

  constructor(container: HTMLElement) {
    this.scene.background = new THREE.Color(BACKGROUND_COLOR);
    this.scene.fog = new THREE.FogExp2(BACKGROUND_COLOR, 0.026);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.28, 0.28, 0.74);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(10000, 10000),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.groundPlane.rotation.x = -Math.PI / 2;
    applyRaycastMeta(this.groundPlane, 'floor', 'floor');
    this.scene.add(this.groundPlane);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const directional = new THREE.DirectionalLight(0xffffff, 0.68);
    directional.position.set(8, 12, 5);
    this.scene.add(directional);

    const horizon = new THREE.PointLight(0x00ff88, 0.35, 30);
    horizon.position.set(0, 7, 0);
    this.scene.add(horizon);

    this.avatarFillLight.position.set(0, 2, 2);
    this.scene.add(this.avatarFillLight);

    this.ghostRoot.visible = false;
    this.scene.add(this.ghostRoot);

    window.addEventListener('resize', () => this.resize());
  }

  sync(world: WorldState, mode: CameraMode, glowSettings: GlowSettings): void {
    this.syncChunks(world.chunkManager.getVisibleChunks());
    this.syncBlocks(world);
    this.syncTeslaNodes(world, glowSettings.tesla);
    this.syncAvatars(world, mode);
  }

  update(
    world: WorldState,
    mode: CameraMode,
    freeCamera: FreeCameraState,
    thirdPersonCamera: ThirdPersonCameraState,
    glowSettings: GlowSettings,
    time: number,
  ): void {
    this.sync(world, mode, glowSettings);
    const selected = world.getSelectedAvatar();
    this.updateCamera(mode, selected, freeCamera, thirdPersonCamera);
    this.updateAvatarFillLight(mode, selected);

    for (const [id, visual] of this.avatarGroups) {
      const avatar = world.avatars.get(id);
      if (avatar) {
        visual.update(avatar, time, mode === 'avatar_pov' && selected?.id === id, glowSettings.avatar);
      }
    }

    this.composer.render();
  }

  setGlowLevel(settings: GlowSettings): void {
    const normalized = THREE.MathUtils.clamp(settings.sceneBloom, 0, 100) / 100;
    this.bloomPass.strength = 0.02 + normalized * 0.58;
    this.bloomPass.radius = 0.12 + normalized * 0.3;
    this.bloomPass.threshold = 0.88 - normalized * 0.16;
  }

  getPlacementCandidate(
    world: WorldState,
    selection: BuildSelection,
    avatarId?: string,
    pointerNdc = new THREE.Vector2(0, 0),
  ): PlacementCandidate | undefined {
    const target = this.raycastAt(world, avatarId, pointerNdc);

    if (!target || target.kind === 'avatar') {
      return undefined;
    }

    const shapeSize = BLOCK_DEFINITIONS[selection.shape].size;
    let position: Vec3;

    if (target.kind === 'floor') {
      position = {
        x: Math.round(target.point.x),
        y: selection.shape === 'tesla_node' ? shapeSize.y / 2 : shapeSize.y / 2,
        z: Math.round(target.point.z),
      };
    } else if (target.kind === 'block' && target.id) {
      const block = world.blocks.get(target.id);
      if (!block) {
        return undefined;
      }

      const targetSize = BLOCK_DEFINITIONS[block.shape].size;
      const normal = this.axisNormal(target.normal);

      if (Math.abs(normal.y) > 0.5) {
        position = {
          x: Math.round(target.point.x),
          y:
            normal.y > 0
              ? block.position.y + targetSize.y / 2 + shapeSize.y / 2
              : block.position.y - targetSize.y / 2 - shapeSize.y / 2,
          z: Math.round(target.point.z),
        };
      } else if (Math.abs(normal.x) > 0.5) {
        position = {
          x: block.position.x + normal.x * (targetSize.x / 2 + shapeSize.x / 2),
          y: block.position.y,
          z: Math.round(target.point.z),
        };
      } else {
        position = {
          x: Math.round(target.point.x),
          y: block.position.y,
          z: block.position.z + normal.z * (targetSize.z / 2 + shapeSize.z / 2),
        };
      }
    } else {
      const normal = this.axisNormal(target.normal);
      position = {
        x: Math.round(target.point.x + normal.x * shapeSize.x * 0.5),
        y: shapeSize.y / 2,
        z: Math.round(target.point.z + normal.z * shapeSize.z * 0.5),
      };
    }

    return {
      shape: selection.shape,
      position,
      rotation: selection.rotation,
      color: selection.color,
      surfaceNormal: this.axisNormal(target.normal),
      targetKind: target.kind,
      targetId: target.id,
    };
  }

  getLookTarget(world: WorldState, avatarId?: string): RaycastTarget | undefined {
    return this.raycastAt(world, avatarId, new THREE.Vector2(0, 0));
  }

  getFloorPoint(pointerNdc: THREE.Vector2): Vec3 | undefined {
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    const point = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point);

    if (hit) {
      return { x: point.x, y: 0, z: point.z };
    }

    const flatDirection = new THREE.Vector3(this.raycaster.ray.direction.x, 0, this.raycaster.ray.direction.z);
    if (flatDirection.lengthSq() < 0.0001) {
      return undefined;
    }

    flatDirection.normalize();
    return {
      x: this.camera.position.x + flatDirection.x * 50,
      y: 0,
      z: this.camera.position.z + flatDirection.z * 50,
    };
  }

  updateGhost(candidate: PlacementCandidate | undefined, valid: boolean): void {
    if (!candidate) {
      this.ghostRoot.visible = false;
      return;
    }

    if (this.ghostShape !== candidate.shape) {
      this.ghostRoot.clear();
      const ghost = createGhostVisual(candidate.shape);
      this.ghostRoot.add(ghost);
      this.ghostShape = candidate.shape;
    }

    this.ghostRoot.visible = true;
    this.ghostRoot.position.set(candidate.position.x, candidate.shape === 'tesla_node' ? 0 : candidate.position.y, candidate.position.z);
    this.ghostRoot.rotation.y = THREE.MathUtils.degToRad(candidate.rotation);
    updateGhostVisual(this.ghostRoot, valid);
  }

  private syncChunks(chunks: Chunk[]): void {
    const visible = new Set<string>(chunks.map((chunk) => chunk.key));

    for (const [key, group] of this.chunkGroups) {
      if (!visible.has(key)) {
        this.scene.remove(group);
        disposeObject(group);
        this.chunkGroups.delete(key);
      }
    }

    for (const chunk of chunks) {
      if (this.chunkGroups.has(chunk.key)) {
        continue;
      }

      const group = this.createChunkGroup(chunk);
      this.chunkGroups.set(chunk.key, group);
      this.scene.add(group);
    }
  }

  private syncBlocks(world: WorldState): void {
    for (const [id, group] of this.blockGroups) {
      if (!world.blocks.has(id)) {
        this.scene.remove(group);
        disposeObject(group);
        this.blockGroups.delete(id);
      }
    }

    for (const block of world.blocks.values()) {
      if (this.blockGroups.has(block.id)) {
        continue;
      }

      const group = createBlockVisual(block);
      this.blockGroups.set(block.id, group);
      this.scene.add(group);
    }
  }

  private syncTeslaNodes(world: WorldState, glowSettings: TeslaGlowSettings): void {
    for (const [id, entry] of this.teslaGroups) {
      if (!world.teslaNodes.has(id)) {
        this.scene.remove(entry.group);
        disposeObject(entry.group);
        this.teslaGroups.delete(id);
      }
    }

    for (const node of world.teslaNodes.values()) {
      const showField = node.starting || node.interference;
      const glowLevel = node.active ? glowSettings.active : glowSettings.unfinished;
      const haloLevel = node.active ? glowSettings.activeHalo : glowSettings.unfinishedHalo;
      const signature = `${node.active}:${node.interference}:${node.starting}:${Math.floor(node.contribution)}:${showField}:${glowLevel}:${haloLevel}`;
      const existing = this.teslaGroups.get(node.id);

      if (existing?.signature === signature) {
        continue;
      }

      if (existing) {
        this.scene.remove(existing.group);
        disposeObject(existing.group);
      }

      const group = createTeslaNodeVisual(node, showField, glowSettings);
      this.scene.add(group);
      this.teslaGroups.set(node.id, { group, signature });
    }
  }

  private syncAvatars(world: WorldState, mode: CameraMode): void {
    const selected = world.getSelectedAvatar();

    for (const [id, visual] of this.avatarGroups) {
      if (!world.avatars.has(id)) {
        this.scene.remove(visual.group);
        disposeObject(visual.group);
        this.avatarGroups.delete(id);
      }
    }

    for (const avatar of world.avatars.values()) {
      let visual = this.avatarGroups.get(avatar.id);

      if (!visual) {
        visual = new AvatarVisual(avatar);
        this.avatarGroups.set(avatar.id, visual);
        this.scene.add(visual.group);
      }

      visual.group.visible = !(mode === 'avatar_pov' && selected?.id === avatar.id);
    }
  }

  private createChunkGroup(chunk: Chunk): THREE.Group {
    const group = new THREE.Group();
    const size = 16;
    const centerX = chunk.cx * size + size / 2;
    const centerZ = chunk.cz * size + size / 2;

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: 0x020711,
        side: THREE.DoubleSide,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(centerX, -0.012, centerZ);

    const fineGrid = new THREE.GridHelper(size, size, GRID_COLOR, GRID_COLOR);
    fineGrid.position.set(centerX, 0.002, centerZ);
    const fineMat = fineGrid.material as THREE.Material;
    fineMat.transparent = true;
    fineMat.opacity = 0.075;

    const majorGrid = new THREE.GridHelper(size, 4, 0x88ffff, GRID_COLOR);
    majorGrid.position.set(centerX, 0.004, centerZ);
    const majorMat = majorGrid.material as THREE.Material;
    majorMat.transparent = true;
    majorMat.opacity = 0.16;

    group.add(base, fineGrid, majorGrid);
    return group;
  }

  private updateCamera(
    mode: CameraMode,
    avatar: AvatarState | undefined,
    freeCamera: FreeCameraState,
    thirdPersonCamera: ThirdPersonCameraState,
  ): void {
    if (mode === 'free_camera' || !avatar) {
      const direction = new THREE.Vector3(
        Math.sin(freeCamera.yaw) * Math.cos(freeCamera.pitch),
        Math.sin(freeCamera.pitch),
        Math.cos(freeCamera.yaw) * Math.cos(freeCamera.pitch),
      );
      this.camera.position.copy(freeCamera.position);
      this.camera.lookAt(freeCamera.position.clone().add(direction));
      return;
    }

    const avatarBase = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
    const forward = new THREE.Vector3(Math.sin(avatar.yaw), 0, Math.cos(avatar.yaw));

    if (mode === 'avatar_pov') {
      const eye = avatarBase.clone().add(new THREE.Vector3(0, CAMERA_HEIGHT, 0));
      const gaze = new THREE.Vector3(
        Math.sin(avatar.yaw) * Math.cos(avatar.pitch),
        Math.sin(avatar.pitch),
        Math.cos(avatar.yaw) * Math.cos(avatar.pitch),
      );
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.clone().add(gaze));
      return;
    }

    const orbitYaw = avatar.yaw + thirdPersonCamera.orbitYawOffset;
    const orbitForward = new THREE.Vector3(Math.sin(orbitYaw), 0, Math.cos(orbitYaw));
    const orbitHeight = 2.45 + thirdPersonCamera.orbitPitchOffset * 2.2;
    const orbitDistance = 5.4 - Math.abs(thirdPersonCamera.orbitPitchOffset) * 0.85;
    const desired = avatarBase.clone().add(new THREE.Vector3(0, orbitHeight, 0)).sub(orbitForward.multiplyScalar(orbitDistance));
    const target = avatarBase.clone().add(new THREE.Vector3(0, 1.16, 0));

    if (thirdPersonCamera.steerFollow) {
      this.camera.position.copy(desired);
      this.cameraTarget.copy(target);
    } else {
      this.camera.position.lerp(desired, 0.16);
      this.cameraTarget.lerp(target, 0.2);
    }

    this.camera.lookAt(this.cameraTarget);
  }

  private updateAvatarFillLight(mode: CameraMode, avatar: AvatarState | undefined): void {
    if (!avatar || mode === 'avatar_pov') {
      this.avatarFillLight.intensity = 0;
      return;
    }

    const tint = new THREE.Color(avatar.color);
    const avatarCenter = new THREE.Vector3(avatar.position.x, avatar.position.y + 1.1, avatar.position.z);
    const cameraToAvatar = avatarCenter.clone().sub(this.camera.position).normalize();
    const cameraRight = new THREE.Vector3().crossVectors(cameraToAvatar, this.camera.up).normalize();
    const lightPosition = avatarCenter
      .clone()
      .sub(cameraToAvatar.multiplyScalar(1.45))
      .add(cameraRight.multiplyScalar(0.95))
      .add(new THREE.Vector3(0, 0.35, 0));

    this.avatarFillLight.color.copy(tint);
    this.avatarFillLight.intensity = avatar.shutdown ? 0.12 : mode === 'free_camera' ? 0.42 : 0.82;
    this.avatarFillLight.position.lerp(lightPosition, 0.35);
  }

  private raycastAt(world: WorldState, avatarId: string | undefined, pointerNdc: THREE.Vector2): RaycastTarget | undefined {
    this.raycaster.setFromCamera(pointerNdc, this.camera);
    this.raycaster.far = 12;
    const objects = this.getRaycastObjects();
    const hits = this.raycaster.intersectObjects(objects, true);

    for (const hit of hits) {
      if (this.isVisualOnlyRaycastHit(hit.object)) {
        continue;
      }

      const meta = this.getRaycastMeta(hit.object);
      if (!meta) {
        continue;
      }

      if (meta.kind === 'avatar' && meta.id === avatarId) {
        continue;
      }

      if (meta.kind === 'floor') {
        return {
          kind: 'floor',
          id: undefined,
          point: { x: hit.point.x, y: 0, z: hit.point.z },
          normal: { x: 0, y: 1, z: 0 },
        };
      }

      const normal = this.hitNormal(hit);
      if (meta.kind === 'block' || meta.kind === 'tesla_node' || meta.kind === 'avatar') {
        return {
          kind: meta.kind,
          id: meta.id,
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          normal,
        };
      }
    }

    const selected = avatarId ? world.avatars.get(avatarId) : undefined;
    if (!selected) {
      return undefined;
    }

    return undefined;
  }

  private isVisualOnlyRaycastHit(object: THREE.Object3D): boolean {
    return object.userData.ignoreRaycast === true || object instanceof THREE.Line || object instanceof THREE.Sprite;
  }

  private getRaycastObjects(): THREE.Object3D[] {
    return [
      this.groundPlane,
      ...this.blockGroups.values(),
      ...[...this.teslaGroups.values()].map((entry) => entry.group),
      ...[...this.avatarGroups.values()].map((entry) => entry.group),
    ];
  }

  private getRaycastMeta(object: THREE.Object3D): { kind: RaycastTarget['kind']; id?: string } | undefined {
    let current: THREE.Object3D | null = object;
    while (current) {
      const kind = current.userData.raycastKind as RaycastTarget['kind'] | undefined;
      if (kind) {
        return { kind, id: current.userData.raycastId as string | undefined };
      }
      current = current.parent;
    }
    return undefined;
  }

  private hitNormal(hit: THREE.Intersection): Vec3 {
    if (!hit.face) {
      return { x: 0, y: 1, z: 0 };
    }

    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld);
    return this.axisNormal({ x: normal.x, y: normal.y, z: normal.z });
  }

  private axisNormal(normal: Vec3): Vec3 {
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    if (absY >= absX && absY >= absZ) {
      return { x: 0, y: Math.sign(normal.y) || 1, z: 0 };
    }
    if (absX >= absZ) {
      return { x: Math.sign(normal.x) || 1, y: 0, z: 0 };
    }
    return { x: 0, y: 0, z: Math.sign(normal.z) || 1 };
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}

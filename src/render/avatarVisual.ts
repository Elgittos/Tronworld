import * as THREE from 'three';
import { AvatarState } from '../world/types';
import { applyRaycastMeta, createSoftGlowTexture } from './geometry';

const WHITE_REACTOR = 0xf5fff7;
const ORANGE_REACTOR = 0xff8a1f;
const RED_REACTOR = 0xff0000;
const SHUTDOWN_GREY = 0x555d64;
const DARK_BODY = 0x0a1628;
const DARKER_SHUTDOWN_BODY = 0x111416;
const FOOT_OFFSET = 0.675;
const AVATAR_SCALE = 2;

type EnergyVisualState = {
  reactor: number;
  body: number;
  bodyGlow: number;
  bodyGlowIntensity: number;
  edge: number;
  edgeOpacity: number;
  eyes: number;
  eyeIntensity: number;
  active: boolean;
};

function getEnergyVisualState(avatar: AvatarState): EnergyVisualState {
  const tint = new THREE.Color(avatar.color).getHex();

  if (avatar.shutdown) {
    return {
      reactor: RED_REACTOR,
      body: DARKER_SHUTDOWN_BODY,
      bodyGlow: SHUTDOWN_GREY,
      bodyGlowIntensity: 0.02,
      edge: SHUTDOWN_GREY,
      edgeOpacity: 0.5,
      eyes: SHUTDOWN_GREY,
      eyeIntensity: 0.02,
      active: false,
    };
  }

  const reactor = avatar.energy > 65 ? WHITE_REACTOR : avatar.energy > 25 ? ORANGE_REACTOR : RED_REACTOR;

  return {
    reactor,
    body: DARK_BODY,
    bodyGlow: tint,
    bodyGlowIntensity: 0.12,
    edge: tint,
    edgeOpacity: 0.35,
    eyes: tint,
    eyeIntensity: avatar.energy > 25 ? 1.5 : 1.15,
    active: true,
  };
}

function highestPersonalityKey(avatar: AvatarState): string {
  return Object.entries(avatar.personality).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'focus';
}

export class AvatarVisual {
  readonly group = new THREE.Group();

  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private readonly ringMat: THREE.MeshStandardMaterial;
  private readonly glowSpriteMat: THREE.SpriteMaterial;
  private readonly edgeMat: THREE.LineBasicMaterial;
  private readonly limbs: {
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
  };
  private readonly eyeVariants: THREE.Group[] = [];
  private readonly lastPosition = new THREE.Vector3();
  private firstUpdate = true;

  constructor(private readonly avatar: AvatarState) {
    const tint = new THREE.Color(avatar.color);

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: DARK_BODY,
      emissive: tint,
      emissiveIntensity: 0.12,
      roughness: 0.3,
      metalness: 0.7,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: tint,
      emissive: tint,
      emissiveIntensity: 1.5,
      roughness: 0,
      metalness: 1,
    });
    this.ringMat = new THREE.MeshStandardMaterial({
      color: WHITE_REACTOR,
      emissive: WHITE_REACTOR,
      emissiveIntensity: 4.5,
      roughness: 0.03,
      metalness: 1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
    });
    this.glowSpriteMat = new THREE.SpriteMaterial({
      map: createSoftGlowTexture(),
      color: WHITE_REACTOR,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.edgeMat = new THREE.LineBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.35,
    });

    this.group.scale.setScalar(AVATAR_SCALE);
    this.buildBody();
    this.limbs = this.buildLimbs();
    this.selectEyeStyle();
    applyRaycastMeta(this.group, 'avatar', avatar.id);
  }

  update(avatar: AvatarState, time: number, hiddenForPov: boolean): void {
    const visualState = getEnergyVisualState(avatar);
    const baseY = avatar.position.y - FOOT_OFFSET * AVATAR_SCALE;
    this.group.position.set(avatar.position.x, baseY, avatar.position.z);
    this.group.rotation.y = avatar.yaw;
    this.group.visible = !hiddenForPov;

    this.bodyMat.color.setHex(visualState.body);
    this.bodyMat.emissive.setHex(visualState.bodyGlow);
    this.bodyMat.emissiveIntensity = visualState.bodyGlowIntensity;
    this.eyeMat.color.setHex(visualState.eyes);
    this.eyeMat.emissive.setHex(visualState.eyes);
    this.eyeMat.emissiveIntensity = visualState.eyeIntensity;
    this.edgeMat.color.setHex(visualState.edge);
    this.edgeMat.opacity = visualState.edgeOpacity;
    this.ringMat.color.setHex(visualState.reactor);
    this.ringMat.emissive.setHex(visualState.reactor);
    this.glowSpriteMat.color.setHex(visualState.reactor);

    const currentPosition = new THREE.Vector3(avatar.position.x, avatar.position.y, avatar.position.z);
    const movedDistance = this.firstUpdate ? 0 : currentPosition.distanceTo(this.lastPosition);
    const moving = visualState.active && (avatar.isMoving || movedDistance > 0.003);
    this.firstUpdate = false;
    this.lastPosition.copy(currentPosition);

    if (moving) {
      const swing = Math.sin(time * 7) * 0.58;
      this.limbs.leftArm.rotation.x = swing;
      this.limbs.rightArm.rotation.x = -swing;
      this.limbs.leftLeg.rotation.x = -swing * 0.7;
      this.limbs.rightLeg.rotation.x = swing * 0.7;
      this.group.position.y += Math.sin(time * 12) * 0.015;
    } else {
      this.limbs.leftArm.rotation.x *= 0.85;
      this.limbs.rightArm.rotation.x *= 0.85;
      this.limbs.leftLeg.rotation.x *= 0.85;
      this.limbs.rightLeg.rotation.x *= 0.85;
    }

    const beatA = Math.pow(Math.max(0, Math.sin(time * 3.6)), 6);
    const beatB = Math.pow(Math.max(0, Math.sin(time * 3.6 - 0.85)), 10) * 0.55;
    const heartbeat = Math.min(1, beatA + beatB);
    const glowScale = visualState.active ? 0.3 + heartbeat * 0.035 : 0.32;
    this.glowSpriteMat.opacity = visualState.active ? 0.52 + heartbeat * 0.26 : 0.78;

    const glow = this.group.getObjectByName('reactorGlow');
    if (glow) {
      glow.scale.set(glowScale, glowScale, 1);
    }
  }

  private buildBody(): void {
    const headY = 1.47;
    const eyeY = 1.49;
    const torsoY = 1.105;
    const chestY = 1.145;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), this.bodyMat);
    head.position.set(0, headY, 0);
    this.group.add(head);

    const headEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.SphereGeometry(0.181, 16, 16)),
      this.edgeMat,
    );
    headEdge.position.copy(head.position);
    this.group.add(headEdge);

    this.createEyes(eyeY);

    const torsoGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.35, 16);
    const torso = new THREE.Mesh(torsoGeo, this.bodyMat);
    torso.position.set(0, torsoY, 0);
    this.group.add(torso);

    const torsoEdge = new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), this.edgeMat);
    torsoEdge.position.copy(torso.position);
    this.group.add(torsoEdge);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.046, 0.088, 32), this.ringMat);
    ring.position.set(0, chestY, 0.124);
    this.group.add(ring);

    const glowSprite = new THREE.Sprite(this.glowSpriteMat);
    glowSprite.name = 'reactorGlow';
    glowSprite.position.set(0, chestY, 0.119);
    glowSprite.scale.set(0.3, 0.3, 1);
    this.group.add(glowSprite);
  }

  private createEyes(eyeY: number): void {
    const makeEyeGroup = (name: string): THREE.Group => {
      const group = new THREE.Group();
      group.name = name;
      group.visible = false;
      this.group.add(group);
      this.eyeVariants.push(group);
      return group;
    };

    const twinDots = makeEyeGroup('twin dots');
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), this.eyeMat);
    leftEye.position.set(-0.06, eyeY, 0.15);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), this.eyeMat);
    rightEye.position.set(0.06, eyeY, 0.15);
    twinDots.add(leftEye, rightEye);

    const visor = makeEyeGroup('thin visor');
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.018, 0.018), this.eyeMat);
    visorMesh.position.set(0, eyeY, 0.155);
    visor.add(visorMesh);

    const mono = makeEyeGroup('mono scanner');
    const monoDot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 12), this.eyeMat);
    monoDot.position.set(0, eyeY, 0.158);
    const monoLine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.012), this.eyeMat);
    monoLine.position.set(0, eyeY, 0.148);
    mono.add(monoDot, monoLine);

    const pixels = makeEyeGroup('four pixels');
    [
      [-0.055, 0.012],
      [-0.025, -0.012],
      [0.025, -0.012],
      [0.055, 0.012],
    ].forEach(([x, y]) => {
      const pixel = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), this.eyeMat);
      pixel.position.set(x, eyeY + y, 0.158);
      pixels.add(pixel);
    });

    const slits = makeEyeGroup('angled slits');
    const leftSlit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.014), this.eyeMat);
    leftSlit.position.set(-0.052, eyeY, 0.158);
    leftSlit.rotation.z = -0.28;
    const rightSlit = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.014), this.eyeMat);
    rightSlit.position.set(0.052, eyeY, 0.158);
    rightSlit.rotation.z = 0.28;
    slits.add(leftSlit, rightSlit);
  }

  private selectEyeStyle(): void {
    const key = highestPersonalityKey(this.avatar);
    const indexByKey: Record<string, number> = {
      focus: 0,
      connection: 1,
      curiosity: 2,
      purpose: 3,
    };
    const selected = indexByKey[key] ?? 0;
    this.eyeVariants.forEach((group, index) => {
      group.visible = index === selected;
    });
  }

  private buildLimbs(): AvatarVisual['limbs'] {
    const armPivotY = 1.235;
    const armGeo = new THREE.CapsuleGeometry(0.04, 0.22, 6, 12);
    const legGeo = new THREE.CapsuleGeometry(0.045, 0.16, 6, 12);
    const armEdgeGeo = new THREE.EdgesGeometry(armGeo);
    const legEdgeGeo = new THREE.EdgesGeometry(legGeo);

    const makeLimb = (
      pivotPosition: THREE.Vector3,
      limbPosition: THREE.Vector3,
      geometry: THREE.BufferGeometry,
      edgeGeometry: THREE.EdgesGeometry,
    ): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.copy(pivotPosition);
      const mesh = new THREE.Mesh(geometry, this.bodyMat);
      mesh.position.copy(limbPosition);
      const edges = new THREE.LineSegments(edgeGeometry, this.edgeMat);
      edges.position.copy(limbPosition);
      pivot.add(mesh, edges);
      this.group.add(pivot);
      return pivot;
    };

    return {
      leftArm: makeLimb(new THREE.Vector3(-0.18, armPivotY, 0), new THREE.Vector3(0, -0.15, 0), armGeo, armEdgeGeo),
      rightArm: makeLimb(new THREE.Vector3(0.18, armPivotY, 0), new THREE.Vector3(0, -0.15, 0), armGeo, armEdgeGeo),
      leftLeg: makeLimb(new THREE.Vector3(-0.06, 0.92, 0), new THREE.Vector3(0, -0.12, 0), legGeo, legEdgeGeo),
      rightLeg: makeLimb(new THREE.Vector3(0.06, 0.92, 0), new THREE.Vector3(0, -0.12, 0), legGeo, legEdgeGeo),
    };
  }
}

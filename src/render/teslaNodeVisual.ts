import * as THREE from 'three';
import { TeslaNodeState } from '../world/types';
import { applyRaycastMeta, createSoftGlowTexture } from './geometry';

const ACTIVE_COLOR = 0xf5ffff;
const FIELD_COLOR = 0x88ffff;
const DANGER_COLOR = 0xff2020;

export type TeslaGlowSettings = {
  active: number;
  unfinished: number;
};

function sliderFactor(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 100) / 100;
}

function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 34px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(2, 6, 16, 0.72)';
    ctx.fillRect(10, 24, canvas.width - 20, 80);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 24, canvas.width - 20, 80);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 0.86, 1);
  return sprite;
}

export function createTeslaNodeVisual(node: TeslaNodeState, showField: boolean, glowSettings: TeslaGlowSettings): THREE.Group {
  const group = new THREE.Group();
  const complete = node.active;
  const glow = complete ? sliderFactor(glowSettings.active) : sliderFactor(glowSettings.unfinished);
  const color = node.interference ? DANGER_COLOR : complete ? ACTIVE_COLOR : DANGER_COLOR;
  const height = node.height;
  const radius = node.starting ? 0.32 : 0.28;
  group.position.set(node.position.x, 0, node.position.z);

  const activeCoreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: complete ? 1.1 + glow * 3.2 : 0.35 + glow * 1.6,
    roughness: 0.08,
    metalness: 1,
    transparent: true,
    opacity: complete ? 0.9 : 0.55,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: complete ? 1.8 + glow * 4.4 : 0.35 + glow * 1.6,
    roughness: 0.03,
    metalness: 1,
    transparent: true,
    opacity: 1,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: complete ? (node.starting ? 0.025 + glow * 0.16 : 0.02 + glow * 0.13) : 0.08 + glow * 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ringGlowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: node.starting ? 0.1 + glow * 0.48 : 0.08 + glow * 0.38,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const distanceHaloMat = new THREE.SpriteMaterial({
    map: createSoftGlowTexture(),
    color,
    transparent: true,
    opacity: complete ? (node.starting ? 0.012 + glow * 0.12 : 0.01 + glow * 0.085) : 0.008 + glow * 0.045,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });

  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), activeCoreMat);
  core.position.y = height / 2;
  group.add(core);

  const distanceHalo = new THREE.Sprite(distanceHaloMat);
  distanceHalo.name = 'teslaDistanceHalo';
  distanceHalo.position.y = height * 0.54;
  const haloScale = complete ? (node.starting ? 4.4 + glow * 5.2 : 3.2 + glow * 3.8) : 1.8 + glow * 2.1;
  distanceHalo.scale.set(haloScale, haloScale, 1);
  group.add(distanceHalo);

  const coreGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.45, radius * 1.45, height * 1.04, 32, 1, true),
    glowMat,
  );
  coreGlow.position.y = height / 2;
  group.add(coreGlow);

  for (let i = 0; i < 2; i += 1) {
    const planeGlow = new THREE.Mesh(new THREE.PlaneGeometry(radius * (complete ? 4.1 : 3.4), height * 1.08), glowMat);
    planeGlow.position.y = height / 2;
    planeGlow.rotation.y = i * Math.PI / 2;
    group.add(planeGlow);
  }

  const coreEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(radius, radius, height, 24)),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: complete ? 0.45 : 0.3,
    }),
  );
  coreEdge.position.copy(core.position);
  group.add(coreEdge);

  if (complete) {
    const ringCount = node.starting ? 4 : 3;
    for (let i = 0; i < ringCount; i += 1) {
      const y = (height * (i + 1)) / (ringCount + 1);
      const torus = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.35, 0.032, 12, 72), ringMat);
      torus.position.y = y;
      torus.rotation.x = Math.PI / 2;
      group.add(torus);

      const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.45, 0.105, 12, 72), ringGlowMat);
      ringGlow.position.y = y;
      ringGlow.rotation.x = Math.PI / 2;
      group.add(ringGlow);
    }

    const nodeLight = new THREE.PointLight(
      color,
      (node.starting ? 0.34 : 0.24) + glow * (node.starting ? 1.85 : 1.25),
      node.starting ? 42 : 28,
      1.45,
    );
    nodeLight.position.y = height * 0.55;
    group.add(nodeLight);
  } else {
    const remaining = Math.ceil(node.targetEnergy - node.contribution);
    const progress = createTextSprite(`${Math.floor(node.contribution)} / ${node.targetEnergy}  needs ${remaining}`, '#ff4b4b');
    progress.position.y = height + 0.55;
    group.add(progress);

    const redLight = new THREE.PointLight(DANGER_COLOR, 0.18 + glow * 1.05, 10, 1.55);
    redLight.position.y = height * 0.5;
    group.add(redLight);
  }

  if (complete && showField) {
    const fieldColor = node.interference ? DANGER_COLOR : FIELD_COLOR;
    const fieldOpacity = node.interference ? 0.05 + glow * 0.12 : node.starting ? 0.025 + glow * 0.1 : 0.02 + glow * 0.08;
    const fieldMat = new THREE.MeshBasicMaterial({
      color: fieldColor,
      transparent: true,
      opacity: fieldOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(node.radius, 96), fieldMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.012;
    group.add(disc);

    const ringMatField = new THREE.MeshBasicMaterial({
      color: fieldColor,
      transparent: true,
      opacity: node.interference ? 0.12 + glow * 0.42 : 0.09 + glow * 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(node.radius, 0.035, 8, 128), ringMatField);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.025;
    group.add(ring);

    const shimmerMat = new THREE.MeshBasicMaterial({
      color: fieldColor,
      transparent: true,
      opacity: node.interference ? 0.025 + glow * 0.085 : 0.018 + glow * 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shimmer = new THREE.Mesh(new THREE.CylinderGeometry(node.radius, node.radius, 0.75, 96, 1, true), shimmerMat);
    shimmer.position.y = 0.38;
    group.add(shimmer);
  }

  applyRaycastMeta(group, 'tesla_node', node.id);
  return group;
}

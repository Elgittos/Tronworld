import * as THREE from 'three';
import { BlockInstance, BlockShape, BLOCK_DEFINITIONS } from '../world/types';
import { applyRaycastMeta, createRampGeometry } from './geometry';

function materialForColor(color: string): THREE.MeshStandardMaterial {
  const tint = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: tint.clone().multiplyScalar(0.28),
    emissive: tint,
    emissiveIntensity: 0.12,
    metalness: 0.62,
    roughness: 0.42,
  });
}

function geometryForShape(shape: BlockShape): THREE.BufferGeometry {
  const definition = BLOCK_DEFINITIONS[shape];

  switch (shape) {
    case 'cube':
    case 'half_cube':
      return new THREE.BoxGeometry(definition.size.x, definition.size.y, definition.size.z);
    case 'tile': {
      const geometry = new THREE.PlaneGeometry(definition.size.x, definition.size.z);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    case 'pillar':
      return new THREE.CylinderGeometry(definition.size.x / 2, definition.size.x / 2, definition.size.y, 24);
    case 'ramp':
      return createRampGeometry();
    case 'tesla_node':
      return new THREE.CylinderGeometry(0.36, 0.36, 2, 32);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

export function createBlockVisual(block: BlockInstance): THREE.Group {
  const group = new THREE.Group();
  const geometry = geometryForShape(block.shape);
  const mesh = new THREE.Mesh(geometry, materialForColor(block.color));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: block.color,
      transparent: true,
      opacity: 0.86,
    }),
  );

  group.add(mesh, edges);
  group.position.set(block.position.x, block.position.y, block.position.z);
  group.rotation.y = THREE.MathUtils.degToRad(block.rotation);
  applyRaycastMeta(group, 'block', block.id);
  return group;
}

export function createGhostVisual(shape: BlockShape): THREE.Group {
  const group = new THREE.Group();
  const geometry = geometryForShape(shape);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 1,
    }),
  );

  group.add(mesh, edges);
  return group;
}

export function updateGhostVisual(group: THREE.Group, valid: boolean): void {
  const color = valid ? 0x29ff9a : 0xff3030;

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material;

    if (Array.isArray(material)) {
      material.forEach((entry) => {
        if ('color' in entry) {
          (entry as THREE.MeshBasicMaterial).color.setHex(color);
        }
      });
    } else if (material && 'color' in material) {
      (material as THREE.MeshBasicMaterial).color.setHex(color);
    }
  });
}

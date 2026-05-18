import * as THREE from 'three';

export function createRampGeometry(): THREE.BufferGeometry {
  const vertices = new Float32Array([
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5,
    -0.5, 0.5, -0.5,
    0.5, 0.5, -0.5,
  ]);

  const indices = [
    0, 2, 1,
    1, 2, 3,
    0, 1, 4,
    1, 5, 4,
    2, 4, 3,
    3, 4, 5,
    0, 4, 2,
    1, 3, 5,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createSoftGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.32, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.46, 'rgba(255,255,255,0.70)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  return new THREE.CanvasTexture(canvas);
}

export function applyRaycastMeta(object: THREE.Object3D, kind: string, id: string): void {
  object.traverse((child) => {
    child.userData.raycastKind = kind;
    child.userData.raycastId = id;
  });
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

import * as THREE from 'three';
import { AvatarState, CameraMode, Vec3, WORLD_RULES } from '../world/types';
import { FreeCameraState } from '../render/worldRenderer';

type InputCallbacks = {
  getMode: () => CameraMode;
  getAvatar: () => AvatarState | undefined;
  getFreeSpeed: () => number;
  onToggleBuild: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName) || element.isContentEditable;
}

export class InputController {
  readonly freeCamera: FreeCameraState = {
    position: new THREE.Vector3(4, 4, 8),
    yaw: Math.PI,
    pitch: -0.28,
  };

  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private pointerLocked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputCallbacks,
  ) {
    this.bind();
  }

  getInteractHeld(): boolean {
    return this.keys.has('keye');
  }

  getAvatarMove(avatar: AvatarState | undefined): { velocity: Vec3; jump: boolean; moving: boolean } {
    if (!avatar || avatar.shutdown || this.callbacks.getMode() === 'free_camera') {
      this.jumpQueued = false;
      return { velocity: { x: 0, y: 0, z: 0 }, jump: false, moving: false };
    }

    const forward = new THREE.Vector3(Math.sin(avatar.yaw), 0, Math.cos(avatar.yaw));
    const right = new THREE.Vector3(Math.cos(avatar.yaw), 0, -Math.sin(avatar.yaw));
    const direction = new THREE.Vector3();

    if (this.keys.has('keyw')) {
      direction.add(forward);
    }
    if (this.keys.has('keys')) {
      direction.sub(forward);
    }
    if (this.keys.has('keyd')) {
      direction.add(right);
    }
    if (this.keys.has('keya')) {
      direction.sub(right);
    }

    const moving = direction.lengthSq() > 0;
    if (moving) {
      direction.normalize().multiplyScalar(WORLD_RULES.avatarWalkSpeed);
    }

    const jump = this.jumpQueued;
    this.jumpQueued = false;

    return {
      velocity: { x: direction.x, y: 0, z: direction.z },
      jump,
      moving: moving || jump,
    };
  }

  updateFreeCamera(dt: number): void {
    if (this.callbacks.getMode() !== 'free_camera') {
      return;
    }

    const speed = this.callbacks.getFreeSpeed();
    const forward = new THREE.Vector3(
      Math.sin(this.freeCamera.yaw) * Math.cos(this.freeCamera.pitch),
      Math.sin(this.freeCamera.pitch),
      Math.cos(this.freeCamera.yaw) * Math.cos(this.freeCamera.pitch),
    ).normalize();
    const right = new THREE.Vector3(Math.cos(this.freeCamera.yaw), 0, -Math.sin(this.freeCamera.yaw)).normalize();
    const direction = new THREE.Vector3();

    if (this.keys.has('keyw')) {
      direction.add(forward);
    }
    if (this.keys.has('keys')) {
      direction.sub(forward);
    }
    if (this.keys.has('keyd')) {
      direction.add(right);
    }
    if (this.keys.has('keya')) {
      direction.sub(right);
    }
    if (this.keys.has('space')) {
      direction.y += 1;
    }
    if (this.keys.has('shiftleft') || this.keys.has('shiftright')) {
      direction.y -= 1;
    }

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed * dt);
      this.freeCamera.position.add(direction);
    }
  }

  private bind(): void {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 0) {
        if (!this.pointerLocked) {
          void this.canvas.requestPointerLock();
        }
        this.callbacks.onPrimary();
      } else if (event.button === 2) {
        this.callbacks.onSecondary();
      }
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('mousemove', (event) => {
      if (!this.pointerLocked) {
        return;
      }

      const mode = this.callbacks.getMode();
      const sensitivity = 0.0023;

      if (mode === 'free_camera') {
        this.freeCamera.yaw -= event.movementX * sensitivity;
        this.freeCamera.pitch = THREE.MathUtils.clamp(this.freeCamera.pitch - event.movementY * sensitivity, -1.25, 1.25);
        return;
      }

      const avatar = this.callbacks.getAvatar();
      if (!avatar || avatar.shutdown) {
        return;
      }

      avatar.yaw -= event.movementX * sensitivity;
      avatar.pitch = THREE.MathUtils.clamp(avatar.pitch - event.movementY * sensitivity, -1.1, 1.1);
    });

    document.addEventListener('keydown', (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const code = event.code.toLowerCase();
      this.keys.add(code);

      if (code === 'space') {
        event.preventDefault();
        if (this.callbacks.getMode() !== 'free_camera') {
          this.jumpQueued = true;
        }
      }

      if (code === 'keyq') {
        event.preventDefault();
        this.callbacks.onToggleBuild();
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.code.toLowerCase());
    });
  }
}

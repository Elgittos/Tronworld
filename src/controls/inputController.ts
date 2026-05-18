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

export type ThirdPersonCameraState = {
  orbitYawOffset: number;
  orbitPitchOffset: number;
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
  readonly thirdPersonCamera: ThirdPersonCameraState = {
    orbitYawOffset: 0,
    orbitPitchOffset: 0,
  };

  private readonly keys = new Set<string>();
  private jumpQueued = false;
  private leftMouseHeld = false;
  private rightMouseHeld = false;
  private leftMouseDragged = false;
  private rightMouseDragged = false;
  private leftMouseDownAt = 0;
  private rightMouseDownAt = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputCallbacks,
  ) {
    this.bind();
  }

  getInteractHeld(): boolean {
    return this.keys.has('keye');
  }

  getAvatarMove(avatar: AvatarState | undefined, dt: number): { velocity: Vec3; jump: boolean; moving: boolean } {
    if (!avatar || avatar.shutdown || this.callbacks.getMode() === 'free_camera') {
      this.jumpQueued = false;
      return { velocity: { x: 0, y: 0, z: 0 }, jump: false, moving: false };
    }

    const turnSpeed = 2.55;
    if (this.keys.has('keya')) {
      avatar.yaw += turnSpeed * dt;
    }
    if (this.keys.has('keyd')) {
      avatar.yaw -= turnSpeed * dt;
    }

    const forward = new THREE.Vector3(Math.sin(avatar.yaw), 0, Math.cos(avatar.yaw));
    const direction = new THREE.Vector3();

    if (this.keys.has('keyw') || this.rightMouseHeld) {
      direction.add(forward);
    }
    if (this.keys.has('keys')) {
      direction.sub(forward);
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

  updateHeldCamera(dt: number): void {
    if (!this.leftMouseHeld) {
      this.thirdPersonCamera.orbitYawOffset = THREE.MathUtils.damp(this.thirdPersonCamera.orbitYawOffset, 0, 7, dt);
      this.thirdPersonCamera.orbitPitchOffset = THREE.MathUtils.damp(this.thirdPersonCamera.orbitPitchOffset, 0, 7, dt);
    }
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
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      this.canvas.setPointerCapture(event.pointerId);

      if (event.button === 0) {
        this.leftMouseHeld = true;
        this.leftMouseDragged = false;
        this.leftMouseDownAt = performance.now();
      } else if (event.button === 2) {
        this.rightMouseHeld = true;
        this.rightMouseDragged = false;
        this.rightMouseDownAt = performance.now();
      }
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.canvas.addEventListener('pointerup', (event) => {
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }

      if (event.button === 0) {
        const wasClick = !this.leftMouseDragged && performance.now() - this.leftMouseDownAt < 250;
        this.leftMouseHeld = false;
        if (wasClick) {
          this.callbacks.onPrimary();
        }
      }

      if (event.button === 2) {
        const wasClick = !this.rightMouseDragged && performance.now() - this.rightMouseDownAt < 250;
        this.rightMouseHeld = false;
        if (wasClick) {
          this.callbacks.onSecondary();
        }
      }
    });

    this.canvas.addEventListener('pointercancel', () => {
      this.leftMouseHeld = false;
      this.rightMouseHeld = false;
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.leftMouseHeld && !this.rightMouseHeld) {
        return;
      }

      const mode = this.callbacks.getMode();
      const sensitivity = 0.004;
      const movedFarEnough = Math.abs(event.movementX) + Math.abs(event.movementY) > 2;

      if (this.leftMouseHeld && movedFarEnough) {
        this.leftMouseDragged = true;
      }
      if (this.rightMouseHeld && movedFarEnough) {
        this.rightMouseDragged = true;
      }

      if (mode === 'free_camera') {
        if (this.rightMouseHeld) {
          this.freeCamera.yaw -= event.movementX * sensitivity;
          this.freeCamera.pitch = THREE.MathUtils.clamp(this.freeCamera.pitch - event.movementY * sensitivity, -1.25, 1.25);
        }
        return;
      }

      const avatar = this.callbacks.getAvatar();
      if (!avatar || avatar.shutdown) {
        return;
      }

      if (this.rightMouseHeld) {
        avatar.yaw -= event.movementX * sensitivity;
        avatar.pitch = THREE.MathUtils.clamp(avatar.pitch - event.movementY * sensitivity, -1.1, 1.1);
      } else if (this.leftMouseHeld && mode === 'third_person') {
        this.thirdPersonCamera.orbitYawOffset -= event.movementX * sensitivity;
        this.thirdPersonCamera.orbitPitchOffset = THREE.MathUtils.clamp(
          this.thirdPersonCamera.orbitPitchOffset - event.movementY * sensitivity,
          -0.85,
          0.85,
        );
      }
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

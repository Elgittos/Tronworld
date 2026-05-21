import * as THREE from 'three';
import { AvatarState, CameraMode, Vec3 } from '../world/types';
import {
  FreeCameraState,
  THIRD_PERSON_DEFAULT_ZOOM,
  THIRD_PERSON_MAX_ZOOM,
  THIRD_PERSON_MIN_ZOOM,
} from '../render/worldRenderer';

type InputCallbacks = {
  getMode: () => CameraMode;
  getAvatar: () => AvatarState | undefined;
  getFreeSpeed: () => number;
  getAvatarSpeed: () => number;
  getOrbitHorizontalInverted: () => boolean;
  getOrbitVerticalInverted: () => boolean;
  getBuildOpen: () => boolean;
  getAvatarControllable: () => boolean;
  onToggleBuild: () => void;
  onPrimary: () => void;
  onSecondary: () => void;
};

export type ThirdPersonCameraState = {
  orbitYawOffset: number;
  orbitPitchOffset: number;
  steerFollow: boolean;
  zoomDistance: number;
};

const MOVEMENT_CODES = new Set(['keyw', 'keya', 'keys', 'keyd', 'space']);

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement && element.type === 'range') {
    return false;
  }

  if (element.tagName === 'BUTTON') {
    return false;
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
}

function releaseUiControlFocus(target: EventTarget | null, code: string): boolean {
  if (!MOVEMENT_CODES.has(code)) {
    return false;
  }

  const element = target as HTMLElement | null;
  const focusTarget = element?.closest('button, input[type="range"]') as HTMLElement | null;

  if (!focusTarget) {
    return false;
  }

  focusTarget.blur();
  return true;
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
    steerFollow: false,
    zoomDistance: THIRD_PERSON_DEFAULT_ZOOM,
  };
  readonly pointerNdc = new THREE.Vector2(0, 0);

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
    if (!avatar || avatar.shutdown || this.callbacks.getMode() === 'free_camera' || !this.callbacks.getAvatarControllable()) {
      this.jumpQueued = false;
      this.thirdPersonCamera.steerFollow = false;
      return { velocity: { x: 0, y: 0, z: 0 }, jump: false, moving: false };
    }

    const turnSpeed = 2.55;
    if (this.keys.has('keya')) {
      avatar.yaw += turnSpeed * dt;
    }
    if (this.keys.has('keyd')) {
      avatar.yaw -= turnSpeed * dt;
    }

    const rightMouseSteering = this.rightMouseHeld && !this.callbacks.getBuildOpen();
    const forward = new THREE.Vector3(Math.sin(avatar.yaw), 0, Math.cos(avatar.yaw));
    const direction = new THREE.Vector3();

    if (this.keys.has('keyw') || rightMouseSteering) {
      direction.add(forward);
    }
    if (this.keys.has('keys')) {
      direction.sub(forward);
    }

    const moving = direction.lengthSq() > 0;
    if (moving) {
      direction.normalize().multiplyScalar(this.callbacks.getAvatarSpeed());
    }

    this.thirdPersonCamera.steerFollow = rightMouseSteering;

    const jump = this.jumpQueued;
    this.jumpQueued = false;

    return {
      velocity: { x: direction.x, y: 0, z: direction.z },
      jump,
      moving: moving || jump,
    };
  }

  updateHeldCamera(dt: number, recenterBehindAvatar: boolean): void {
    if (this.rightMouseHeld && !this.callbacks.getBuildOpen()) {
      this.thirdPersonCamera.orbitYawOffset = 0;
      return;
    }

    if (recenterBehindAvatar && !this.leftMouseHeld) {
      const followSpeed = this.thirdPersonCamera.steerFollow ? 18 : 7;
      this.thirdPersonCamera.orbitYawOffset = THREE.MathUtils.damp(this.thirdPersonCamera.orbitYawOffset, 0, followSpeed, dt);
      this.thirdPersonCamera.orbitPitchOffset = THREE.MathUtils.damp(this.thirdPersonCamera.orbitPitchOffset, 0, followSpeed, dt);
    }
  }

  updateFreeCamera(dt: number): void {
    if (this.callbacks.getMode() !== 'free_camera') {
      return;
    }

    const speed = this.callbacks.getFreeSpeed();
    const turnSpeed = 2.55;
    if (this.keys.has('keya')) {
      this.freeCamera.yaw += turnSpeed * dt;
    }
    if (this.keys.has('keyd')) {
      this.freeCamera.yaw -= turnSpeed * dt;
    }

    const forward = new THREE.Vector3(
      Math.sin(this.freeCamera.yaw) * Math.cos(this.freeCamera.pitch),
      Math.sin(this.freeCamera.pitch),
      Math.cos(this.freeCamera.yaw) * Math.cos(this.freeCamera.pitch),
    ).normalize();
    const direction = new THREE.Vector3();

    if (this.keys.has('keyw') || this.rightMouseHeld) {
      direction.add(forward);
    }
    if (this.keys.has('keys')) {
      direction.sub(forward);
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
    document.addEventListener(
      'pointermove',
      (event) => {
        this.updatePointerPosition(event);
      },
      { capture: true },
    );

    this.canvas.addEventListener('pointerdown', (event) => {
      this.updatePointerPosition(event);
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      this.canvas.setPointerCapture(event.pointerId);

      if (event.button === 0) {
        this.leftMouseHeld = true;
        this.leftMouseDragged = false;
        this.leftMouseDownAt = performance.now();
      } else if (event.button === 2) {
        if (this.callbacks.getBuildOpen()) {
          this.rightMouseHeld = false;
          this.rightMouseDragged = false;
          this.rightMouseDownAt = performance.now();
          return;
        }

        this.rightMouseHeld = true;
        this.thirdPersonCamera.steerFollow = true;
        this.thirdPersonCamera.orbitYawOffset = 0;
        this.rightMouseDragged = false;
        this.rightMouseDownAt = performance.now();
        this.canvas.style.cursor = 'none';
      }
    });

    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.canvas.addEventListener(
      'wheel',
      (event) => {
        if (this.callbacks.getMode() !== 'third_person') {
          return;
        }

        event.preventDefault();
        this.thirdPersonCamera.zoomDistance = THREE.MathUtils.clamp(
          this.thirdPersonCamera.zoomDistance + event.deltaY * 0.006,
          THIRD_PERSON_MIN_ZOOM,
          THIRD_PERSON_MAX_ZOOM,
        );
      },
      { passive: false },
    );

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
        this.endRightMouseHold();
        if (wasClick) {
          this.callbacks.onSecondary();
        }
      }
    });

    this.canvas.addEventListener('pointercancel', () => {
      this.leftMouseHeld = false;
      this.endRightMouseHold();
    });

    this.canvas.addEventListener('pointermove', (event) => {
      this.updatePointerPosition(event);
      if (!this.leftMouseHeld && !this.rightMouseHeld) {
        return;
      }

      const sensitivity = 0.004;
      const movedFarEnough = Math.abs(event.movementX) + Math.abs(event.movementY) > 2;

      if (this.leftMouseHeld && movedFarEnough) {
        this.leftMouseDragged = true;
      }
      if (this.rightMouseHeld && movedFarEnough) {
        this.rightMouseDragged = true;
      }

      if (this.rightMouseHeld) {
        this.applyRightMouseLook(event.movementX, event.movementY, sensitivity);
        return;
      }

      const mode = this.callbacks.getMode();
      if (mode === 'free_camera') {
        return;
      }

      const avatar = this.callbacks.getAvatar();
      if (!avatar) {
        return;
      }

      if (this.leftMouseHeld && mode === 'third_person') {
        const horizontalDirection = this.callbacks.getOrbitHorizontalInverted() ? 1 : -1;
        const verticalDirection = this.callbacks.getOrbitVerticalInverted() ? 1 : -1;
        this.thirdPersonCamera.orbitYawOffset += event.movementX * sensitivity * horizontalDirection;
        this.thirdPersonCamera.orbitPitchOffset = THREE.MathUtils.clamp(
          this.thirdPersonCamera.orbitPitchOffset + event.movementY * sensitivity * verticalDirection,
          -0.85,
          0.85,
        );
      }
    });

    document.addEventListener('mouseup', (event) => {
      if (event.button === 2 && this.rightMouseHeld) {
        this.endRightMouseHold();
      }
    });

    document.addEventListener('keydown', (event) => {
      const code = event.code.toLowerCase();
      if (releaseUiControlFocus(event.target, code)) {
        event.preventDefault();
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      this.keys.add(code);

      if (code === 'space') {
        event.preventDefault();
        if (this.callbacks.getMode() !== 'free_camera') {
          this.jumpQueued = true;
        }
      }

      if (code === 'digit1') {
        event.preventDefault();
        this.callbacks.onToggleBuild();
      }
    });

    document.addEventListener('keyup', (event) => {
      this.keys.delete(event.code.toLowerCase());
    });
  }

  private updatePointerPosition(event: { clientX: number; clientY: number }): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    this.pointerNdc.set(THREE.MathUtils.clamp(x, 0, 1) * 2 - 1, -(THREE.MathUtils.clamp(y, 0, 1) * 2 - 1));
  }

  private applyRightMouseLook(movementX: number, movementY: number, sensitivity: number): void {
    const mode = this.callbacks.getMode();

    if (mode === 'free_camera') {
      this.freeCamera.yaw -= movementX * sensitivity;
      this.freeCamera.pitch = THREE.MathUtils.clamp(this.freeCamera.pitch - movementY * sensitivity, -1.25, 1.25);
      return;
    }

    const avatar = this.callbacks.getAvatar();
    if (!avatar || avatar.shutdown || !this.callbacks.getAvatarControllable()) {
      return;
    }

    const horizontalDirection = this.callbacks.getOrbitHorizontalInverted() ? -1 : 1;
    const verticalDirection = this.callbacks.getOrbitVerticalInverted() ? 1 : -1;
    avatar.yaw -= movementX * sensitivity * horizontalDirection;
    avatar.pitch = THREE.MathUtils.clamp(avatar.pitch - movementY * sensitivity, -1.1, 1.1);
    this.thirdPersonCamera.orbitYawOffset = 0;
    this.thirdPersonCamera.orbitPitchOffset = THREE.MathUtils.clamp(
      this.thirdPersonCamera.orbitPitchOffset + movementY * sensitivity * verticalDirection,
      -0.85,
      0.85,
    );
  }

  private endRightMouseHold(): void {
    this.rightMouseHeld = false;
    this.thirdPersonCamera.steerFollow = false;
    this.canvas.style.cursor = '';
  }
}

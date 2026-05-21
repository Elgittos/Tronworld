type OneShotOptions = {
  src: string;
  volume: number;
  maxDurationMs: number;
};

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

class OneShotSound {
  private readonly template: HTMLAudioElement;

  constructor(private readonly options: OneShotOptions) {
    this.template = new Audio(options.src);
    this.template.preload = 'auto';
    this.template.volume = options.volume;
  }

  play(volumeScale = 1): void {
    const gain = Math.min(1, Math.max(0, volumeScale));
    if (gain <= 0.001) {
      return;
    }

    const audio = this.template.cloneNode(true) as HTMLAudioElement;
    audio.volume = this.options.volume * gain;
    audio.currentTime = 0;

    const stop = window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, this.options.maxDurationMs);

    audio.addEventListener('ended', () => window.clearTimeout(stop), { once: true });
    void audio.play().catch(() => {
      window.clearTimeout(stop);
    });
  }
}

export class SoundEffects {
  private readonly build = new OneShotSound({
    src: '/audio/sound_effects/buildingsound.mp3',
    volume: 0.52,
    maxDurationMs: 520,
  });

  private readonly menu = new OneShotSound({
    src: '/audio/sound_effects/menuclick1.mp3',
    volume: 0.088,
    maxDurationMs: 220,
  });

  private readonly step = new OneShotSound({
    src: '/audio/sound_effects/stepsound.mp3',
    volume: 0.12,
    maxDurationMs: 180,
  });

  playBuild(listener?: Vec3Like, source?: Vec3Like): void {
    this.build.play(this.spatialGain(listener, source, 11));
  }

  playMenuClick(): void {
    this.menu.play();
  }

  playStep(listener?: Vec3Like, source?: Vec3Like, strength = 1): void {
    this.step.play(this.spatialGain(listener, source, 8) * strength);
  }

  private spatialGain(listener: Vec3Like | undefined, source: Vec3Like | undefined, radius: number): number {
    if (!listener || !source) {
      return 1;
    }

    const distance = Math.hypot(listener.x - source.x, listener.z - source.z);
    if (distance >= radius) {
      return 0;
    }

    return Math.pow(1 - distance / radius, 1.7);
  }
}

export class TeslaNodeLoopSound {
  enabled = true;
  volumeScale = 1;

  private readonly audio = new Audio('/audio/sound_effects/FinishedTeslaNode.mp3');
  private started = false;

  constructor() {
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = 0;
  }

  update(proximity: number): void {
    const targetVolume = this.enabled ? Math.min(1, Math.max(0, proximity) * this.volumeScale * 0.25) : 0;
    this.audio.volume = targetVolume;

    if (targetVolume <= 0.001) {
      this.audio.pause();
      return;
    }

    if (!this.started) {
      this.started = true;
      this.audio.currentTime = 0;
    }

    void this.audio.play().catch(() => {
      this.started = false;
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.audio.pause();
    }
  }

  setVolumeScale(value: number): void {
    this.volumeScale = Math.min(2, Math.max(0, value));
  }
}

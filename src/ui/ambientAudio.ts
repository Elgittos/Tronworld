export class AmbientAudio {
  enabled = true;
  volume = 0.14;

  private readonly audio = new Audio();
  private trackIndex = 0;
  private started = false;
  private duckStrength = 0;
  private targetDuckStrength = 0;
  private lastDuckUpdate = performance.now();

  constructor(private readonly tracks: string[]) {
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.applyVolume();
    this.audio.addEventListener('ended', () => this.playNext());
  }

  start(): void {
    if (!this.enabled || this.tracks.length === 0) {
      return;
    }

    if (!this.started) {
      this.started = true;
      this.loadTrack(this.trackIndex);
    }

    void this.audio.play().catch(() => {
      this.started = false;
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.audio.pause();
      return;
    }

    this.start();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.applyVolume();
  }

  setTeslaDucking(strength: number): void {
    this.targetDuckStrength = Math.min(1, Math.max(0, strength));
    const now = performance.now();
    const dt = Math.min(0.12, Math.max(0, (now - this.lastDuckUpdate) / 1000));
    this.lastDuckUpdate = now;

    const rate = this.targetDuckStrength > this.duckStrength ? 2.8 : 1.35;
    const alpha = 1 - Math.exp(-rate * dt);
    this.duckStrength += (this.targetDuckStrength - this.duckStrength) * alpha;
    this.applyVolume();
  }

  private playNext(): void {
    if (!this.enabled || this.tracks.length === 0) {
      return;
    }

    this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
    this.loadTrack(this.trackIndex);
    this.start();
  }

  private loadTrack(index: number): void {
    this.audio.src = this.tracks[index];
    this.audio.load();
  }

  private applyVolume(): void {
    const duckMultiplier = 1 - this.duckStrength * 0.55;
    this.audio.volume = Math.min(1, Math.max(0, this.volume * duckMultiplier));
  }
}

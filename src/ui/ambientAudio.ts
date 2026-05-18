export class AmbientAudio {
  enabled = true;
  volume = 0.14;

  private readonly audio = new Audio();
  private trackIndex = 0;
  private started = false;

  constructor(private readonly tracks: string[]) {
    this.audio.preload = 'auto';
    this.audio.loop = false;
    this.audio.volume = this.volume;
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
    this.audio.volume = this.volume;
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
}

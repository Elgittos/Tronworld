import { Chunk, ChunkKey, Vec3, WORLD_RULES } from '../world/types';

export function floorDiv(value: number, size: number): number {
  return Math.floor(value / size);
}

export function chunkKey(cx: number, cz: number): ChunkKey {
  return `${cx}:${cz}`;
}

function chunkSeed(cx: number, cz: number): number {
  const x = Math.imul(cx, 73856093);
  const z = Math.imul(cz, 19349663);
  return (x ^ z) >>> 0;
}

export class ChunkManager {
  readonly chunkSize = WORLD_RULES.chunkSize;
  readonly visibleRadius = WORLD_RULES.visibleRadius;
  readonly loadedRadius = WORLD_RULES.loadedRadius;
  readonly preloadRadius = WORLD_RULES.preloadRadius;

  private readonly chunks = new Map<ChunkKey, Chunk>();
  private readonly visibleKeys = new Set<ChunkKey>();

  updateForAvatarPositions(avatarPositions: Vec3[]): void {
    const desiredVisible = new Set<ChunkKey>();
    const desiredLoaded = new Set<ChunkKey>();
    const desiredPreloaded = new Set<ChunkKey>();

    for (const position of avatarPositions) {
      const cx = floorDiv(position.x, this.chunkSize);
      const cz = floorDiv(position.z, this.chunkSize);

      this.fillRadius(cx, cz, this.preloadRadius, desiredPreloaded);
      this.fillRadius(cx, cz, this.loadedRadius, desiredLoaded);
      this.fillRadius(cx, cz, this.visibleRadius, desiredVisible);
    }

    for (const key of desiredPreloaded) {
      const [cx, cz] = key.split(':').map(Number);
      this.ensureChunk(cx, cz);
    }

    for (const [key, chunk] of this.chunks) {
      chunk.loaded = desiredLoaded.has(key);
      chunk.visible = desiredVisible.has(key);

      if (!chunk.loaded && !desiredPreloaded.has(key) && !chunk.modified) {
        this.chunks.delete(key);
      }
    }

    this.visibleKeys.clear();
    for (const key of desiredVisible) {
      if (this.chunks.has(key)) {
        this.visibleKeys.add(key);
      }
    }
  }

  getVisibleChunks(): Chunk[] {
    return [...this.visibleKeys]
      .map((key) => this.chunks.get(key))
      .filter((chunk): chunk is Chunk => Boolean(chunk));
  }

  getLoadedChunks(): Chunk[] {
    return [...this.chunks.values()].filter((chunk) => chunk.loaded);
  }

  markModifiedAt(position: Vec3): void {
    const cx = floorDiv(position.x, this.chunkSize);
    const cz = floorDiv(position.z, this.chunkSize);
    this.ensureChunk(cx, cz).modified = true;
  }

  private ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);

    if (existing) {
      return existing;
    }

    const chunk: Chunk = {
      key,
      cx,
      cz,
      seed: chunkSeed(cx, cz),
      loaded: false,
      visible: false,
      modified: false,
    };

    this.chunks.set(key, chunk);
    return chunk;
  }

  private fillRadius(cx: number, cz: number, radius: number, output: Set<ChunkKey>): void {
    for (let z = cz - radius; z <= cz + radius; z += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        output.add(chunkKey(x, z));
      }
    }
  }
}

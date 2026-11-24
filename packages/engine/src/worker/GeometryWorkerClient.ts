import type { TriangleSoup } from '../geometry/soup.ts';
import type {
  GeometryRequest,
  GeometryResponse,
  ShapeBuildInput,
  TextBuildInput,
  WorkerLike,
} from './protocol.ts';

type Pending = { resolve: (value: GeometryResponse) => void; reject: (error: Error) => void };

/**
 * Builds text and shape geometry in a Web Worker, so long texts, deformations and big
 * SVGs never freeze the UI. Results are plain triangle soups (transferred, not copied).
 */
export class GeometryWorkerClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  /** True once the worker failed; hosts then build on the main thread. */
  broken = false;

  constructor(
    private readonly worker: WorkerLike,
    builtinBaseUrl: string,
  ) {
    worker.addEventListener('message', (event) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response);
      else entry.reject(new Error(response.error));
    });
    worker.addEventListener('error', (event) => {
      console.warn('[galbe] geometry worker failed; building on the main thread', event);
      this.broken = true;
      for (const entry of this.pending.values()) entry.reject(new Error('Geometry worker failed'));
      this.pending.clear();
    });
    void this.request({ id: 0, kind: 'init', builtinBaseUrl }).catch(() => {});
  }

  private request(message: GeometryRequest): Promise<GeometryResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...message, id } as GeometryRequest);
    });
  }

  async buildText(input: TextBuildInput): Promise<{ soup: TriangleSoup; glyphCount: number }> {
    const response = await this.request({ id: 0, kind: 'text', input });
    if (response.ok && response.kind === 'text')
      return { soup: response.soup, glyphCount: response.glyphCount };
    throw new Error('Unexpected geometry worker response');
  }

  async buildShape(input: ShapeBuildInput): Promise<{ pathId: string; soup: TriangleSoup }[]> {
    const response = await this.request({ id: 0, kind: 'shape', input });
    if (response.ok && response.kind === 'shape') return response.parts;
    throw new Error('Unexpected geometry worker response');
  }

  dispose(): void {
    this.worker.terminate?.();
    for (const entry of this.pending.values()) entry.reject(new Error('Disposed'));
    this.pending.clear();
  }
}

import type { AssetSource } from '../assets/AssetSource.ts';
import { FontLibrary } from '../fonts/FontLibrary.ts';
import { buildShapeSoups } from '../shapes/buildShapeGeometry.ts';
import { buildTextSoup } from '../text/buildTextGeometry.ts';
import { type GeometryRequest, soupBuffers, type WorkerScopeLike } from './protocol.ts';

/**
 * The worker side: answers geometry requests. `createSource` receives the builtin assets'
 * base URL (sent by the client) and returns where fonts are read from.
 */
export function serveGeometry(
  scope: WorkerScopeLike,
  createSource: (builtinBaseUrl: string) => AssetSource,
): void {
  let fonts: FontLibrary | null = null;
  scope.addEventListener('message', (event) => {
    const request: GeometryRequest = event.data;
    void (async () => {
      try {
        if (request.kind === 'init') {
          fonts = new FontLibrary(createSource(request.builtinBaseUrl));
          scope.postMessage({ id: request.id, ok: true, kind: 'init' });
        } else if (request.kind === 'text') {
          if (!fonts) throw new Error('Geometry worker not initialised');
          const face = await fonts.load(request.input.font);
          const { soup, glyphCount } = buildTextSoup(face, request.input);
          scope.postMessage(
            { id: request.id, ok: true, kind: 'text', soup, glyphCount },
            soupBuffers(soup),
          );
        } else {
          const parts = buildShapeSoups(request.input);
          scope.postMessage(
            { id: request.id, ok: true, kind: 'shape', parts },
            parts.flatMap((part) => soupBuffers(part.soup)),
          );
        }
      } catch (error) {
        scope.postMessage({
          id: request.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });
}

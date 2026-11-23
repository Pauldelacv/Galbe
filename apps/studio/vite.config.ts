import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const builtinDir = path.resolve(here, '../../packages/assets/files');

const CONTENT_TYPES: Record<string, string> = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.hdr': 'image/vnd.radiance',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Serves `@galbe/assets/files` under `<base>builtin/` in dev and copies it into the build,
 * so builtin asset URIs resolve the same way everywhere.
 */
function builtinAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'galbe-builtin-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const base = server.config.base;
        const prefix = `${base}builtin/`;
        if (!req.url?.startsWith(prefix)) return next();
        const relative = decodeURIComponent(req.url.slice(prefix.length).split('?')[0] ?? '');
        const file = path.resolve(builtinDir, relative);
        if (
          !file.startsWith(builtinDir + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader(
          'Content-Type',
          CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        );
        res.setHeader('Cache-Control', 'public, max-age=3600');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      fs.cpSync(builtinDir, path.join(outDir, 'builtin'), { recursive: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), builtinAssets()],
  build: {
    target: 'es2023',
    chunkSizeWarningLimit: 2500,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});

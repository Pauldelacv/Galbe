#!/usr/bin/env node
/**
 * Renders Galbe's built-in matcaps from the bundled CC0 HDRIs.
 *
 * A matcap stores the shading of a sphere seen head-on: pixel (x, y) is the colour of the
 * surface whose normal is (x, y, √(1 − x² − y²)). We compute it analytically from an HDRI
 * (mirror reflection, diffuse irradiance, or a mix), so the images are original work
 * derived only from CC0 sources, and therefore CC0 as well.
 *
 * Usage: node packages/assets/scripts/matcaps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { FloatType } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hdriDir = path.join(root, 'files/hdri');
const outDir = path.join(root, 'files/matcaps');
const SIZE = 256;

function loadHdr(name) {
  const loader = new HDRLoader();
  loader.setDataType(FloatType);
  const buffer = fs.readFileSync(path.join(hdriDir, `${name}.hdr`));
  const { width, height, data } = loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return { width, height, data };
}

/** Bilinear lookup of an equirectangular image in direction d (three.js convention). */
function sampler(env, yaw = 0) {
  const { width, height, data } = env;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return (x, y, z) => {
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    const u = (Math.atan2(rz, rx) / (2 * Math.PI) + 0.5) * width;
    const v = (Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI) * height;
    const x0 = Math.floor(u - 0.5);
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(v - 0.5)));
    const fx = u - 0.5 - x0;
    const fy = v - 0.5 - Math.floor(v - 0.5);
    const out = [0, 0, 0];
    for (const [dx, dy, w] of [
      [0, 0, (1 - fx) * (1 - fy)],
      [1, 0, fx * (1 - fy)],
      [0, 1, (1 - fx) * fy],
      [1, 1, fx * fy],
    ]) {
      const px = (((x0 + dx) % width) + width) % width;
      const py = Math.min(height - 1, y0 + dy);
      const i = (py * width + px) * 4;
      out[0] += data[i] * w;
      out[1] += data[i + 1] * w;
      out[2] += data[i + 2] * w;
    }
    return out;
  };
}

/** Low-resolution, pre-convolved diffuse irradiance (cosine lobe). */
function irradiance(sample) {
  const dirs = [];
  const N = 400;
  for (let i = 0; i < N; i++) {
    // Fibonacci sphere.
    const y = 1 - (2 * (i + 0.5)) / N;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    const d = [Math.cos(phi) * r, y, Math.sin(phi) * r];
    dirs.push([d, sample(...d)]);
  }
  return (nx, ny, nz) => {
    const out = [0, 0, 0];
    let total = 0;
    for (const [[x, y, z], c] of dirs) {
      const w = Math.max(0, x * nx + y * ny + z * nz);
      out[0] += c[0] * w;
      out[1] += c[1] * w;
      out[2] += c[2] * w;
      total += w;
    }
    return out.map((v) => v / total);
  };
}

/** Glossy reflection: a few rays jittered around the mirror direction. */
function glossy(sample, roughness) {
  const offsets = [];
  for (let i = 0; i < 24; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt((i + 0.5) / 24) * roughness;
    offsets.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return (x, y, z) => {
    const out = [0, 0, 0];
    for (const [ox, oy] of offsets) {
      const d = normalize([x + ox, y + oy, z]);
      const c = sample(...d);
      out[0] += c[0];
      out[1] += c[1];
      out[2] += c[2];
    }
    return out.map((v) => v / offsets.length);
  };
}

const normalize = ([x, y, z]) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const aces = (x) =>
  Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const hue = (t) => [0, 1 / 3, 2 / 3].map((o) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (t + o)));

/** Renders a matcap. `shade(n, r, fresnel)` returns linear RGB for a normal. */
function render(shade, exposure = 1) {
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let x = ((px + 0.5) / SIZE) * 2 - 1;
      let y = 1 - ((py + 0.5) / SIZE) * 2;
      const l = Math.hypot(x, y);
      if (l > 0.999) {
        x = (x / l) * 0.999;
        y = (y / l) * 0.999;
      }
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      const n = [x, y, z];
      // View vector (0,0,1): r = 2(n·v)n − v. The env is looked up from the camera side,
      // so flip z to sample what lies in front of the object.
      const r = [2 * z * x, 2 * z * y, 2 * z * z - 1];
      const fresnel = 0.04 + 0.96 * (1 - z) ** 5;
      const c = shade(n, [r[0], r[1], -r[2]], fresnel);
      const i = (py * SIZE + px) * 3;
      for (let k = 0; k < 3; k++) pixels[i + k] = Math.round(srgb(aces(c[k] * exposure)) * 255);
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function png(pixels) {
  const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
  for (let y = 0; y < SIZE; y++)
    pixels.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const envs = {
  studio: sampler(loadHdr('studio-small-09'), 2.1),
  contrast: sampler(loadHdr('studio-small-03'), 0.6),
  sunset: sampler(loadHdr('venice-sunset'), 1.2),
  neon: sampler(loadHdr('neon-photostudio'), 0.3),
};

const MATCAPS = [
  {
    id: 'chrome-studio',
    name: 'Studio chrome',
    shade: (
      (g) => (_n, r) =>
        g(...r)
    )(glossy(envs.studio, 0.015)),
    exposure: 1,
  },
  {
    id: 'chrome-sunset',
    name: 'Sunset chrome',
    shade: (
      (g) => (_n, r) =>
        g(...r)
    )(glossy(envs.sunset, 0.02)),
    exposure: 1.1,
  },
  {
    id: 'chrome-neon',
    name: 'Neon chrome',
    shade: (
      (g) => (_n, r) =>
        g(...r)
    )(glossy(envs.neon, 0.02)),
    exposure: 1.2,
  },
  {
    id: 'clay-soft',
    name: 'Soft clay',
    shade: ((d) => (n) => {
      const key = Math.max(0, n[0] * -0.45 + n[1] * 0.6 + n[2] * 0.66);
      const occlusion = 0.3 + 0.7 * key ** 1.4;
      return d(...n).map((v) => v * 0.55 * occlusion + 0.02);
    })(irradiance(envs.studio)),
    exposure: 1,
  },
  {
    id: 'clay-warm',
    name: 'Warm clay',
    shade: ((d) => (n) => {
      const c = d(...n);
      const key = Math.max(0, n[0] * 0.5 + n[1] * 0.55 + n[2] * 0.67);
      const k = 0.25 + 0.75 * key ** 1.2;
      return [c[0] * 0.9 * k, c[1] * 0.6 * k, c[2] * 0.42 * k];
    })(irradiance(envs.contrast)),
    exposure: 0.9,
  },
  {
    id: 'gloss-black',
    name: 'Glossy black',
    shade: ((g) => (n, r, f) => {
      const c = g(...r);
      const k = 0.06 + f * 0.9;
      return [c[0] * k + 0.004, c[1] * k + 0.004, c[2] * k + 0.005];
    })(glossy(envs.contrast, 0.03)),
    exposure: 1,
  },
  {
    id: 'pearl',
    name: 'Pearl',
    shade: ((d, g) => (n, r, f) => {
      const base = d(...n);
      const spec = g(...r);
      const tint = hue(0.15 + (1 - n[2]) * 1.4);
      return base.map((v, k) => v * (0.75 + 0.25 * tint[k]) * 0.9 + spec[k] * (0.08 + f * 0.6));
    })(irradiance(envs.studio), glossy(envs.studio, 0.08)),
    exposure: 1.3,
  },
  {
    id: 'toon',
    name: 'Toon',
    shade: (n) => {
      const light = normalize([-0.5, 0.7, 0.6]);
      const ndl = n[0] * light[0] + n[1] * light[1] + n[2] * light[2];
      const band = ndl > 0.55 ? 1 : ndl > 0.1 ? 0.55 : 0.22;
      const rim = 1 - n[2] > 0.82 ? 0.25 : 0;
      const spec = ndl > 0.96 ? 0.6 : 0;
      return [band + rim + spec, band + rim + spec, band + rim + spec].map((v) => v * 0.55);
    },
    exposure: 1,
  },
];

fs.mkdirSync(outDir, { recursive: true });
for (const matcap of MATCAPS) {
  fs.writeFileSync(
    path.join(outDir, `${matcap.id}.png`),
    png(render(matcap.shade, matcap.exposure)),
  );
  console.log(`matcaps/${matcap.id}.png`);
}

const manifest = `// Generated by packages/assets/scripts/matcaps.mjs — do not edit by hand.
import type { BuiltinMatcap } from './types.ts';

export const BUILTIN_MATCAPS: readonly BuiltinMatcap[] = ${JSON.stringify(
  MATCAPS.map((m) => ({
    id: `matcaps/${m.id}`,
    name: m.name,
    file: `matcaps/${m.id}.png`,
    license: 'CC0-1.0',
  })),
  null,
  2,
)};
`;
fs.writeFileSync(path.join(root, 'src/matcaps.generated.ts'), manifest);

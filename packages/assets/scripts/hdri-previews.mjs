#!/usr/bin/env node
// Renders small tone-mapped PNG previews (256×128) of the bundled HDRIs, so the studio
// can show thumbnails without decoding HDR files. Dependency-free: a minimal Radiance
// RGBE decoder and PNG encoder (node:zlib).
//
//   node packages/assets/scripts/hdri-previews.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'files', 'hdri');
const OUT_W = 256;
const OUT_H = 128;

function decodeRgbe(buffer) {
  let pos = 0;
  const readLine = () => {
    const start = pos;
    while (pos < buffer.length && buffer[pos] !== 0x0a) pos++;
    return buffer.toString('latin1', start, pos++);
  };
  if (!readLine().startsWith('#?')) throw new Error('Not a Radiance file');
  for (let line = readLine(); line !== ''; line = readLine()) {
    if (line.startsWith('FORMAT=') && line !== 'FORMAT=32-bit_rle_rgbe') throw new Error(line);
  }
  const match = /-Y (\d+) \+X (\d+)/.exec(readLine());
  if (!match) throw new Error('Unsupported orientation');
  const height = Number(match[1]);
  const width = Number(match[2]);
  const data = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    if (
      buffer[pos] !== 2 ||
      buffer[pos + 1] !== 2 ||
      ((buffer[pos + 2] << 8) | buffer[pos + 3]) !== width
    ) {
      throw new Error('Only new-style RLE scanlines are supported');
    }
    pos += 4;
    for (let channel = 0; channel < 4; channel++) {
      let x = 0;
      while (x < width) {
        let count = buffer[pos++];
        if (count > 128) {
          count -= 128;
          const value = buffer[pos++];
          for (let i = 0; i < count; i++) scan[x++ * 4 + channel] = value;
        } else {
          for (let i = 0; i < count; i++) scan[x++ * 4 + channel] = buffer[pos++];
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3];
      const f = e === 0 ? 0 : 2 ** (e - 136);
      const o = (y * width + x) * 3;
      data[o] = scan[x * 4] * f;
      data[o + 1] = scan[x * 4 + 1] * f;
      data[o + 2] = scan[x * 4 + 2] * f;
    }
  }
  return { width, height, data };
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ACES filmic approximation (Narkowicz) + sRGB transfer.
const tonemap = (v) =>
  Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)));
const srgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.hdr'))) {
  const { width, height, data } = decodeRgbe(fs.readFileSync(path.join(dir, file)));
  // Auto-exposure on mean luminance so dim and bright HDRIs read alike.
  let sum = 0;
  for (let i = 0; i < data.length; i += 3)
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const exposure = 0.45 / Math.max(1e-4, sum / (data.length / 3));
  const out = Buffer.alloc(OUT_W * OUT_H * 3);
  const sx = width / OUT_W;
  const sy = height / OUT_H;
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
          const o = (yy * width + xx) * 3;
          acc[0] += data[o];
          acc[1] += data[o + 1];
          acc[2] += data[o + 2];
          n++;
        }
      }
      for (let c = 0; c < 3; c++)
        out[(y * OUT_W + x) * 3 + c] = Math.round(255 * srgb(tonemap((acc[c] / n) * exposure)));
    }
  }
  const target = path.join(dir, file.replace(/\.hdr$/, '.preview.png'));
  fs.writeFileSync(target, encodePng(OUT_W, OUT_H, out));
  console.log(`preview ${path.basename(target)}`);
}

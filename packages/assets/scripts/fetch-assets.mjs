#!/usr/bin/env node
// Downloads Galbe's bundled assets and regenerates the typed manifests.
//
//   node packages/assets/scripts/fetch-assets.mjs
//
// Fonts: Google Fonts families (SIL Open Font License 1.1), static TTF subsets served by
// Fontsource's CDN, plus each family's OFL.txt from github.com/google/fonts.
// HDRIs: Poly Haven (CC0 1.0), 1K equirectangular .hdr files.
//
// Every asset added here MUST also be listed in ASSETS.md with its source and licence.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filesDir = path.join(root, 'files');

/** Family id (Fontsource) → [weights/styles], description written by us. */
const FONTS = {
  inter: {
    faces: [
      [400, 'normal'],
      [700, 'normal'],
      [900, 'normal'],
    ],
    description: 'Neutral grotesque, the default',
  },
  'space-grotesk': {
    faces: [
      [500, 'normal'],
      [700, 'normal'],
    ],
    description: 'Geometric grotesque with quirky details',
  },
  'archivo-black': { faces: [[400, 'normal']], description: 'Compact, heavy grotesque' },
  'bricolage-grotesque': {
    faces: [[800, 'normal']],
    description: 'Expressive grotesque with ink traps',
  },
  syne: { faces: [[800, 'normal']], description: 'Wide, art-school display sans' },
  unbounded: {
    faces: [
      [700, 'normal'],
      [900, 'normal'],
    ],
    description: 'Rounded, extended display sans',
  },
  'bebas-neue': { faces: [[400, 'normal']], description: 'Tall all-caps condensed' },
  anton: { faces: [[400, 'normal']], description: 'Condensed impact-style sans' },
  'dm-serif-display': {
    faces: [
      [400, 'normal'],
      [400, 'italic'],
    ],
    description: 'High-contrast display serif',
  },
  'playfair-display': {
    faces: [
      [700, 'normal'],
      [900, 'italic'],
    ],
    description: 'Transitional serif with drama',
  },
  fraunces: {
    faces: [
      [700, 'normal'],
      [900, 'italic'],
    ],
    description: 'Soft, "wonky" old-style serif',
  },
  'instrument-serif': {
    faces: [
      [400, 'normal'],
      [400, 'italic'],
    ],
    description: 'Condensed editorial serif',
  },
  'jetbrains-mono': { faces: [[700, 'normal']], description: 'Monospace' },
  pacifico: { faces: [[400, 'normal']], description: 'Retro brush script' },
  'lilita-one': { faces: [[400, 'normal']], description: 'Rounded, friendly heavy sans' },
  'rubik-mono-one': { faces: [[400, 'normal']], description: 'Chunky monospaced display' },
};
const SUBSETS = ['latin', 'latin-ext'];

/** Our id → Poly Haven id, our own label and description. */
const HDRIS = {
  'studio-small-09': {
    polyhaven: 'studio_small_09',
    name: 'Softbox studio',
    description: 'Large soft boxes, neutral. The default.',
  },
  'brown-photostudio-02': {
    polyhaven: 'brown_photostudio_02',
    name: 'Warm studio',
    description: 'Warm photo studio with window light.',
  },
  'studio-small-03': {
    polyhaven: 'studio_small_03',
    name: 'Contrast studio',
    description: 'Small studio with crisp, contrasted lights.',
  },
  'neon-photostudio': {
    polyhaven: 'neon_photostudio',
    name: 'Neon studio',
    description: 'Coloured neon tubes; vivid reflections.',
  },
  'venice-sunset': {
    polyhaven: 'venice_sunset',
    name: 'Sunset',
    description: 'Golden-hour sky over a city.',
  },
  'kloofendal-sky': {
    polyhaven: 'kloofendal_48d_partly_cloudy_puresky',
    name: 'Open sky',
    description: 'Bright midday sky, no ground.',
  },
  'shanghai-bund': {
    polyhaven: 'shanghai_bund',
    name: 'City night',
    description: 'Night skyline with artificial lights.',
  },
};

async function get(url, as = 'buffer') {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
  return as === 'json'
    ? response.json()
    : as === 'text'
      ? response.text()
      : Buffer.from(await response.arrayBuffer());
}

async function fetchFonts() {
  const manifest = [];
  for (const [id, { faces, description }] of Object.entries(FONTS)) {
    const meta = await get(`https://api.fontsource.org/v1/fonts/${id}`, 'json');
    if (meta.license !== 'OFL-1.1') throw new Error(`${id}: unexpected licence ${meta.license}`);
    const dir = path.join(filesDir, 'fonts', id);
    fs.mkdirSync(dir, { recursive: true });
    const outFaces = [];
    for (const [weight, style] of faces) {
      const files = [];
      for (const subset of SUBSETS) {
        const url = meta.variants?.[weight]?.[style]?.[subset]?.url?.ttf;
        if (!url) continue;
        const name = `${subset}-${weight}-${style}`;
        fs.writeFileSync(path.join(dir, `${name}.ttf`), await get(url));
        files.push(`fonts/${id}/${name}`);
      }
      outFaces.push({ weight, style, files });
    }
    const licence = await get(
      `https://raw.githubusercontent.com/google/fonts/main/ofl/${id.replaceAll('-', '')}/OFL.txt`,
      'text',
    );
    fs.writeFileSync(path.join(dir, 'OFL.txt'), licence);
    manifest.push({
      id,
      family: meta.family,
      category: meta.category,
      description,
      license: meta.license,
      licenseFile: `fonts/${id}/OFL.txt`,
      source: `https://fontsource.org/fonts/${id}`,
      faces: outFaces,
    });
    console.log(`font ${id}: ${outFaces.length} face(s)`);
  }
  return manifest;
}

async function fetchHdris() {
  const manifest = [];
  const dir = path.join(filesDir, 'hdri');
  fs.mkdirSync(dir, { recursive: true });
  for (const [id, { polyhaven, name, description }] of Object.entries(HDRIS)) {
    const info = await get(`https://api.polyhaven.com/info/${polyhaven}`, 'json');
    fs.writeFileSync(
      path.join(dir, `${id}.hdr`),
      await get(`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/${polyhaven}_1k.hdr`),
    );
    manifest.push({
      id: `hdri/${id}`,
      name,
      description,
      file: `hdri/${id}.hdr`,
      preview: `hdri/${id}.preview.png`,
      license: 'CC0-1.0',
      credit: {
        title: info.name,
        authors: Object.keys(info.authors),
        url: `https://polyhaven.com/a/${polyhaven}`,
      },
    });
    console.log(`hdri ${id}`);
  }
  return manifest;
}

const header = '// Generated by packages/assets/scripts/fetch-assets.mjs — do not edit by hand.\n';
const fonts = await fetchFonts();
fs.writeFileSync(
  path.join(root, 'src/fonts.generated.ts'),
  `${header}import type { BuiltinFontFamily } from './types.ts';\n\nexport const BUILTIN_FONTS: readonly BuiltinFontFamily[] = ${JSON.stringify(fonts, null, 2)};\n`,
);
const hdris = await fetchHdris();
fs.writeFileSync(
  path.join(root, 'src/hdri.generated.ts'),
  `${header}import type { BuiltinHdri } from './types.ts';\n\nexport const BUILTIN_HDRIS: readonly BuiltinHdri[] = ${JSON.stringify(hdris, null, 2)};\n`,
);
console.log('Done. Run `node packages/assets/scripts/hdri-previews.mjs` to refresh previews.');

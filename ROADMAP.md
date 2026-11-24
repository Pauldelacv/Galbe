# Galbe — Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ planned

Each milestone ends with: tests green, the studio launched and checked by hand, and a
short "what works / what's missing / known bugs" note at the bottom of its section.

---

## v0.1 — Foundations & Type ✅

- ✅ Monorepo (pnpm, TypeScript strict, Biome, Vitest, Playwright)
- ✅ `@galbe/core`: versioned Zod scene schema, migrations, ops, presets, `.galbe` zip format
- ✅ `@galbe/assets`: bundled OFL fonts and CC0 HDRIs with a typed manifest
- ✅ `@galbe/engine`: SceneController, font library, text geometry, deformers,
  materials, HDRI environment, contact shadows
- ✅ Studio shell: viewport / tools + layers / inspector, collapsible panels, design tokens
- ✅ Type tool: any font (bundled, Google Fonts catalogue, .ttf/.otf/.woff import),
  extrusion, bevel (size, thickness, segments), letter spacing, line height,
  multi-line, alignment, bend / twist / wave
- ✅ 12 material presets (chrome, glass ×3, gold, steel, plastic, ceramic, clay, rubber,
  pearl, neon) with editable parameters
- ✅ HDRI lighting: 7 presets + import, rotation, intensity, background blur; contact shadows
- ✅ Frame formats (1:1, 4:5, 9:16, 16:9, A4, custom), transparent/colour/HDRI background
- ✅ PNG/JPG/WebP export up to 8K with alpha (tiled rendering)
- ✅ Local save: IndexedDB autosave, project list, `.galbe` import/export
- ✅ Precise sliders, keyboard shortcuts, drag & drop, adaptive quality
- ✅ CI (lint, typecheck, test, build, e2e smoke), Cloudflare Pages deploy workflow
- ✅ README, CONTRIBUTING, CODE_OF_CONDUCT, ASSETS, issue & PR templates
- ✅ Undo/redo (planned for v0.2, landed early: transactions for drags, camera excluded)

## v0.2 — Shape, Object, materials & effects ⬜

- ⬜ Shape tool: SVG import (file, paste from Figma/Illustrator), holes, one colour per path
- ⬜ Parametric primitives: sphere, torus, rounded box, capsule, ring, noise blob
- ⬜ Object tool: GLB/GLTF/FBX/OBJ import, scale & pivot normalisation, material override
- ⬜ Full material editor, custom material library (saved locally), PBR textures (ambientCG),
  matcaps, video textures, holographic shader
- ⬜ Add procedural node-based materials
- ⬜ Additional lights (directional, point, spot) UI, reflective ground
- ⬜ Post-processing stack (reorderable): bloom, DOF, chromatic aberration, grain, vignette,
  halftone, dithering, pixel, ASCII, glitch, LUT; extensible GLSL effect registry
- ⬜ History panel (undo/redo itself shipped in v0.1)
- ⬜ Multi-selection gizmo, grouping UI, layer re-parenting
- ⬜ Move text geometry and deformations to a Web Worker / GPU for long texts
- ⬜ On-demand high-resolution HDRIs (2K/4K) for large exports

## v0.3 — Motion & Cover ⬜

- ⬜ Animation presets: spin, float, swing, wave, letter-by-letter reveal, material transition
- ⬜ Timeline: keyframes on any numeric/colour property, easing curves, duration, seamless loops
- ⬜ Animated camera: orbit, truck, dolly
- ⬜ Video export: deterministic frame stepping, MP4 H.264 (WebCodecs + Mediabunny),
  WebM VP9 with alpha, PNG sequence fallback
- ⬜ Cover tool: gradient (linear, radial, mesh), image and video backgrounds, 2D text
  overlays, safe zones and grid

## v0.4 — 3D export, embeds & templates ⬜

- ⬜ GLB (GLTFExporter) and USDZ (USDZExporter) export
- ⬜ `@galbe/player`: `<galbe-scene src="…">` web component (orbit, mouse follow, scroll)
- ⬜ Embed export: HTML snippet
- ⬜ 12 original templates shipped as `.galbe` files (chrome logo, glass type, 9:16 key visual,
  3D sticker…)

---

## Milestone notes

### v0.1 — 2026-11-23

**Works**

- Studio runs locally (`pnpm dev`) and as a static build; starter scene renders chrome type
  with an HDRI and contact shadow.
- Type tool end to end: 16 bundled families, Google Fonts catalogue (downloaded into the
  project), font import, kerning (including GPOS extension lookups) and ligatures,
  bevels, bend/twist/wave without cracks.
- Materials, lighting, backgrounds, formats, camera focal length, tone mapping.
- Export verified at 2× and 4× (tiled 4320 × 4320) with alpha, no seams, editor gizmos hidden.
- Autosave, reload, project list with thumbnails, `.galbe` round trip, drag & drop.
- 98 unit tests (core, engine, exporters, studio logic) and 3 Playwright smoke tests.

**Missing / deferred**

- Additional lights exist in the schema and engine but have no UI yet (v0.2).
- Group nodes exist in the schema; there is no grouping UI yet.
- High-resolution HDRIs (bundled ones are 1K; reflections soften in very large exports).

**Known issues**

- Deformations are rebuilt on the CPU: on long texts (30+ glyphs) dragging a deform
  slider costs ~100 ms per step (a Worker/GPU path is planned).
- Only tested in Chromium (headless, software WebGL). Firefox and Safari are untested, and
  the 60 fps target has not been measured on real Apple hardware yet.
- WOFF2 font import is not supported (TTF, OTF and WOFF are).
- Clear glass over a plain dark background looks dark (physically correct): use an HDRI
  background, a lighter colour or tinted glass.
- One JavaScript bundle (~474 kB gzipped); code splitting comes with the next tools.

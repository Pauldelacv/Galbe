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

## v0.2 — Shape, Object, materials & effects ✅

- ✅ Shape tool: SVG import (file, drop, paste from Figma/Illustrator), holes and fill rules,
  strokes turned into outlines, one material per source colour (or per path), layer gap
- ✅ Parametric primitives: sphere, rounded box, torus, capsule, cylinder, cone, ring,
  noise blob (seeded)
- ✅ Object tool: GLB/GLTF (embedded)/FBX/OBJ import, fit size & pivot normalisation,
  material override
- ✅ Material editor: physical (all parameters) or matcap, multi-edit, per-path materials,
  custom material library (saved locally), PBR textures (drop an ambientCG / Poly Haven
  zip, maps matched by name), UV repeat/offset/rotation, 8 original matcaps + import,
  holographic layer, 2 new presets (holographic foil, satin paint)
- ✅ Additional lights UI (directional, point, spot), reflective floor
- ✅ Post-processing stack (reorderable): bloom, depth of field, colour adjust, LUT (.cube +
  6 built-in looks), chromatic aberration, vignette, film grain, halftone, dithering,
  pixelate, ASCII, glitch; self-describing effect registry (UI generated from params)
- ✅ History panel
- ✅ Multi-selection gizmo, grouping (Ctrl/⌘ G, ⇧ to ungroup), layer re-parenting by drag & drop
- ✅ On-demand 2K/4K HDRIs from Poly Haven for large exports
- ➡️ Procedural node-based materials — moved to Later (needs its own node editor)
- ➡️ Video textures — moved to v0.3 (they need the timeline's deterministic time)
- ➡️ Text/shape geometry in a Web Worker — moved to v0.3 (with per-letter animation)

## v0.3 — Motion & Cover ✅

- ✅ Animation presets: spin, float, swing, wave (per letter), letter-by-letter reveal
  (6 styles, 5 orders, in / out / in-out), material transition
- ✅ Timeline: keyframes on any numeric/colour property (layers, materials, camera, lights,
  environment, effects, backgrounds, overlays), 12 easings + cubic-bezier, duration, fps,
  seamless loops (whole turns/cycles, ping-pong, "close loop" per track), auto-key
- ✅ Animated camera: orbit, truck, dolly (orbiting the viewport keeps working: the base
  camera is solved back through the moves)
- ✅ Video export: deterministic frame stepping, MP4 H.264 (WebCodecs + Mediabunny),
  WebM VP9 with alpha, PNG sequence (zip)
- ✅ Cover tool: gradient (linear, radial, mesh), image and video backgrounds, 2D text
  overlays, safe zones (with 9:16 app UI zones) and grids (thirds, golden ratio, columns)
- ✅ Video textures (from v0.2), driven by the timeline's deterministic time
- ✅ Text and shape geometry built in a Web Worker (from v0.2), for long texts and
  per-letter animation

## v0.4 — 3D export, embeds & templates ⬜

- ⬜ GLB (GLTFExporter) and USDZ (USDZExporter) export
- ⬜ `@galbe/player`: `<galbe-scene src="…">` web component (orbit, mouse follow, scroll)
- ⬜ Embed export: HTML snippet
- ⬜ 12 original templates shipped as `.galbe` files (chrome logo, glass type, 9:16 key visual,
  3D sticker…)

## Later ⬜

- ⬜ Procedural node-based materials (from v0.2), with their own node editor
- ⬜ On-canvas light helpers and gizmos

---

## Milestone notes

### v0.3 — 2026-11-24

**Works**

- `evaluateScene(doc, t)` (core) is the single source of motion: keyframe tracks addressed by
  id-based paths, then preset motions on top. The viewport, the image export (at the
  playhead) and the video export all call it, so a frame is a pure function of the document
  and the time.
- Auto-key: with **K** on, editing any number or colour keys it at the playhead (and keys the
  previous value at 0, so the edit animates); a property that already has a track is always
  keyed. The inspector shows the animated values at the playhead.
- Per-letter motion moves each glyph (or each SVG path) around its own centre; the ground and
  contact shadow stay where the rest pose puts them.
- Backgrounds: gradients, images and videos are drawn by one shader in full-frame
  coordinates, in the scene (glass refracts them, shadows fall on them) or composited after
  tone mapping when effects are on — tiled exports stay seamless.
- Video export verified in Chromium: MP4/H.264 and WebM/VP9 with alpha (120 frames, exact
  4.000 s, decoded back and checked), PNG sequences.
- Text and shapes build in a Web Worker (fonts read from IndexedDB inside the worker); the
  previous geometry stays on screen until the new one arrives, and exports wait for it.
- 175 unit tests (core, engine, exporters, studio) and 11 Playwright tests (5 new: presets
  and playback, auto-key, Cover with and without effects, video background, PNG-sequence and
  WebM export).

**Missing / deferred**

- No curve (graph) editor: easings are picked per keyframe; custom cubic-bezier curves exist
  in the format but have no UI yet.
- No audio track.
- Overlays are flat text only (no shapes or images yet), drawn with the browser's 2D text
  engine.

**Known issues**

- With effects enabled, gradient/image/video backgrounds are composited after tone mapping,
  so glass does not refract them (it does when no effect is on).
- Keyframing geometry parameters (bevel, deformation…) rebuilds the mesh every frame: exports
  are exact, but playback of long texts can lag behind real time.
- H.264 encoding depends on the browser build (some Chromium builds ship without it); the
  dialog falls back to WebM or a PNG sequence. Keep the tab visible while a video renders.
- Videos are stored inside the project (IndexedDB and `.galbe` files), so long clips make
  big projects.
- Fixed in passing: hidden toggle inputs overflowed the page, which let focus or
  `scrollIntoView` scroll the whole studio out of view.

### v0.2 — 2026-11-24

**Works**

- Shapes from SVG files or the clipboard (tested with nested transforms, `evenodd` holes,
  strokes); each path extrudes separately and stacks along Z, so overlapping fills never
  z-fight. Alt-click a path in the viewport to edit only its material.
- Eight primitives with live parameters; noise blobs are identical for the same seed.
- GLB/GLTF/FBX/OBJ models load lazily (loaders are split into their own chunks), keep
  their own materials or take the node material.
- Effects preview live and export identically; Galbe's screen-space effects work in
  full-frame pixels, so tiled exports have no seams and sizes scale with resolution.
- Reflective floor, extra lights, matcaps, holographic foil, texture sets, LUTs.
- 144 unit tests (core, engine, exporters, studio) and 6 Playwright tests (3 new: SVG paste
  and per-path materials; primitives, GLB, grouping and history; effects in viewport and
  export).

**Missing / deferred**

- Procedural node materials (Later), video textures and worker geometry (v0.3), see above.
- Multi-file `.gltf` (with external `.bin`/textures) is refused with a hint to use `.glb`.
- SVG gradients and patterns import as a flat colour (the first stop is not used yet: the
  path's fill colour falls back to white).
- No on-canvas helpers for lights yet (they are edited numerically in Scene › Lights).

**Known issues**

- Bloom and depth of field spread over a fixed fraction of the _tile_: exports larger than
  the GPU's render-buffer limit (tiled) can show slightly different glow near tile edges.
  Exports up to the GPU limit (16K on most desktop GPUs) render in one tile.
- The reflective floor mirrors with a planar reflection: very rough settings blur through
  mip levels and can look blocky at extreme blur values.
- Software WebGL (CI) produced NaN depth on some torus fragments in the contact-shadow pass;
  the shaders now discard them, but the root cause was not isolated.

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

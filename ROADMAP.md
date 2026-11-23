# Galbe — Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ planned

Each milestone ends with: tests green, the studio launched and checked by hand, and a
short "what works / what's missing / known bugs" note at the bottom of its section.

---

## v0.1 — Foundations & Type 🚧

- ⬜ Monorepo (pnpm, TypeScript strict, Biome, Vitest, Playwright)
- ⬜ `@galbe/core`: versioned Zod scene schema, migrations, ops, presets, `.galbe` zip format
- ⬜ `@galbe/assets`: bundled OFL fonts and CC0 HDRIs with a typed manifest
- ⬜ `@galbe/engine`: SceneController, font library, text geometry, deformers,
  materials, HDRI environment, contact shadows
- ⬜ Studio shell: viewport / tools + layers / inspector, collapsible panels, design tokens
- ⬜ Type tool: any font (bundled, Google Fonts catalogue, .ttf/.otf/.woff import),
  extrusion, bevel (size, thickness, segments), letter spacing, line height,
  multi-line, alignment, bend / twist / wave
- ⬜ 6+ material presets (chrome, glass, gold, plastic, ceramic, iridescent…) with basic tweaks
- ⬜ HDRI lighting: presets + import, rotation, intensity, background blur; contact shadows
- ⬜ Frame formats (1:1, 4:5, 9:16, 16:9, A4, custom), transparent/colour/HDRI background
- ⬜ PNG/JPG/WebP export up to 8K with alpha (tiled rendering)
- ⬜ Local save: IndexedDB autosave, project list, `.galbe` import/export
- ⬜ Precise sliders, keyboard shortcuts, drag & drop, adaptive quality
- ⬜ CI (lint, typecheck, test, build, e2e smoke), Cloudflare Pages deploy workflow
- ⬜ README, CONTRIBUTING, CODE_OF_CONDUCT, ASSETS, issue & PR templates

## v0.2 — Shape, Object, materials & effects ⬜

- ⬜ Shape tool: SVG import (file, paste from Figma/Illustrator), holes, one colour per path
- ⬜ Parametric primitives: sphere, torus, rounded box, capsule, ring, noise blob
- ⬜ Object tool: GLB/GLTF/FBX/OBJ import, scale & pivot normalisation, material override
- ⬜ Full material editor, custom material library (saved locally), PBR textures (ambientCG),
  matcaps, video textures, holographic shader
- ⬜ Additional lights (directional, point, spot) UI, reflective ground
- ⬜ Post-processing stack (reorderable): bloom, DOF, chromatic aberration, grain, vignette,
  halftone, dithering, pixel, ASCII, glitch, LUT; extensible GLSL effect registry
- ⬜ Undo/redo UI (history engine lands in v0.1), history panel
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

## v0.5 — AI module (optional, off by default) ⬜

- ⬜ `AIProvider` interface, local key storage, provider settings
- ⬜ Adapters: fal.ai, Replicate, local ComfyUI
- ⬜ Text → PBR texture, text/image → 3D model, style variations, background generation

---

## Milestone notes

_(filled in at the end of each milestone)_

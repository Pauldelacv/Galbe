# Galbe — Architecture

This document describes how Galbe is put together: the scene document that is the
single source of truth, the rendering pipeline that derives pixels from it, and the
layout of the repository. It is meant to be read before contributing code.

> **Clean-room rule.** Galbe re-implements a _category_ of features (3D type, extruded
> logos, objects, social key visuals, motion, embeds). It does not copy code, assets,
> templates, presets, copy, names, logos or UI from any existing product. Every bundled
> asset is CC0 or under a compatible free licence and is listed in [ASSETS.md](./ASSETS.md).

---

## 1. Principles

1. **The document is the truth.** Everything the user makes is a plain, versioned,
   JSON-serialisable `GalbeDocument` validated by Zod (`@galbe/core`). The 3D scene,
   the UI, exports and the embed player are all _derived_ from it. Nothing that matters
   lives only in a three.js object or a React component.
2. **One renderer, many hosts.** The code that turns a document into three.js objects
   lives in a framework-free package (`@galbe/engine`). The studio (React Three Fiber),
   the exporters and the embed player all use the same engine, so what you see in the
   studio is what you export and what you embed.
3. **Local first, no backend.** Projects autosave to IndexedDB and are portable as
   `.galbe` files. The only network calls are opt-in (Google Fonts catalogue, AI
   providers chosen by the user with their own key).
4. **Deterministic by construction.** Scene evaluation is a pure function of
   `(document, time)`. No `Date.now()`, no unseeded randomness. This is what makes
   frame-by-frame video export exact and reproducible.
5. **Designer-grade ergonomics.** Precise sliders, keyboard shortcuts, drag & drop,
   60 fps target with automatic quality reduction while manipulating.
6. **Easy to extend.** Materials, post effects, templates and AI providers are
   registries with a small, documented surface (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

---

## 2. Repository structure

```
galbe/
├── apps/
│   └── studio/                 Vite + React + React Three Fiber web app
│       ├── src/
│       │   ├── app/            App shell, layout, global providers
│       │   ├── state/          Zustand stores (document + history, UI), autosave
│       │   ├── persistence/    IndexedDB repository, .galbe import/export glue
│       │   ├── viewport/       R3F canvas, engine bridge, camera rig, gizmos, overlays
│       │   ├── panels/         Left (tools, layers), right (inspector), bottom (timeline)
│       │   ├── features/       Feature modules: type, materials, environment, export, fonts…
│       │   ├── ui/             Design-system primitives (Slider, ColorInput, Select…)
│       │   ├── styles/         tokens.css (design tokens) + global styles
│       │   └── lib/            Hotkeys, drag & drop, file helpers
│       └── e2e/                Playwright smoke tests
├── packages/
│   ├── core/                   @galbe/core — schema, migrations, ops, presets, .galbe format
│   ├── assets/                 @galbe/assets — bundled CC0/OFL fonts & HDRIs + manifest
│   ├── engine/                 @galbe/engine — three.js runtime shared by every host
│   ├── exporters/              @galbe/exporters — image, overlays, video (v0.3), GLB/USDZ (v0.4)
│   ├── player/                 @galbe/player — <galbe-scene> web component (v0.4)
│   └── ai/                     @galbe/ai — provider-agnostic AI module (v0.5)
├── templates/                  Bundled .galbe templates (v0.4)
├── ARCHITECTURE.md  ROADMAP.md  ASSETS.md  CONTRIBUTING.md  README.md
└── .github/                    CI, deploy, issue & PR templates
```

### Dependency graph

```
            ┌──────────────┐
            │  @galbe/core │  zod, fflate — no three.js, runs in Node and browsers
            └──────┬───────┘
                   │
            ┌──────▼───────┐      ┌───────────────┐
            │ @galbe/engine│◄─────┤ @galbe/assets │  (manifest only; files served statically)
            └──┬────────┬──┘      └───────────────┘
               │        │
   ┌───────────▼──┐  ┌──▼────────────┐
   │ @galbe/      │  │ @galbe/player │  (no React)
   │ exporters    │  └───────────────┘
   └───────┬──────┘
           │
   ┌───────▼──────────────────────────────────┐
   │ apps/studio (React, R3F, drei, Zustand)   │
   └───────────────────────────────────────────┘
```

Internal packages are consumed **from source** (`exports` → `src/index.ts`); Vite and
Vitest compile TypeScript directly. Packages meant for npm (`@galbe/player`) get a
library build in v0.4.

### Tooling

| Concern         | Choice                                                                | Why                                                           |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Package manager | pnpm workspaces                                                       | Fast, strict, good monorepo support                           |
| Language        | TypeScript 7 (native compiler), `strict` + `noUncheckedIndexedAccess` | Latest stable, very fast typecheck                            |
| Lint + format   | Biome                                                                 | One fast tool; no dependency on the TS JS API (TS 7 has none) |
| Unit tests      | Vitest (projects per package)                                         | Native ESM/TS, same transform as Vite                         |
| E2E             | Playwright (Chromium, SwiftShader WebGL)                              | Smoke test of the real studio                                 |
| Bundler         | Vite                                                                  | Dev server + static build                                     |
| CI / hosting    | GitHub Actions, Cloudflare Pages                                      | Static deploy, no server                                      |

---

## 3. The scene document (`@galbe/core`)

### 3.1 Shape

All lengths are in **scene units** (1 unit ≈ the em size of default text). Angles in the
document are **degrees** (friendlier to read and diff); the engine converts. Colours are
`#rrggbb` sRGB hex strings; the engine converts to linear.

```ts
GalbeDocument {
  schemaVersion: 1                      // bumped only on breaking changes (see 3.3)
  id: string
  name: string
  createdAt / updatedAt: ISO string
  generator: string                     // "galbe-studio@0.1.0"

  frame: {                              // output frame (artboard): aspect + base pixel size
    preset: '1:1' | '4:5' | '9:16' | '16:9' | 'a4' | 'custom'
    width: number; height: number       // base pixels; export multiplies this
  }
  background:
    | { type: 'transparent' }
    | { type: 'color'; color }
    | { type: 'environment'; blur; intensity }
    | { type: 'gradient'; kind: 'linear'|'radial'|'mesh'; stops; angle; center; radius;
        points; softness; noise }                                  // v0.3 (Cover)
    | { type: 'image'; image; fit: 'cover'|'contain'|'stretch'; scale; offset; color; brightness }
    | { type: 'video'; video; fit; …; startAt; speed; loop }
  camera: { fov; position: Vec3; target: Vec3; near; far }
  environment: { hdri: AssetUri | null; intensity; rotation; resolution: '1k'|'2k'|'4k' }
  ground: { contactShadow: { enabled; opacity; blur; resolution; far; color }; offset; scale;
            reflection: { enabled; strength; blur; fade; color; floorOpacity } }
  lights: Light[]                       // directional | point | spot (additional to HDRI)
  render: { toneMapping: 'neutral'|'agx'|'aces'|'none'; exposure }

  materials: Record<MaterialId, MaterialSpec>   // document material library
  nodes: SceneNode[]                            // flat list, ordered, with parentId
  assets: Record<AssetId, AssetEntry>           // metadata; binaries live in IDB / zip
  effects: EffectSpec[]                         // post-processing stack, ordered (v0.2)

  // v0.3 (additive, defaults fill older files → no migration)
  animation: { duration; fps; loop; tracks: Track[]; motions: Motion[] }
  overlays: Overlay[]             // Cover 2D text layers, top-most last
}
```

**Nodes** are a discriminated union on `type`, sharing a base:

```ts
NodeBase { id; name; type; parentId: string | null; visible; locked;
           transform: { position: Vec3; rotation: Vec3 /*deg, XYZ*/; scale: Vec3 };
           castShadow }

TextNode extends NodeBase {
  type: 'text'
  text: string                         // multi-line with '\n'
  font: FontRef                        // { family, weight, style, files: AssetUri[] }
  size; depth; curveSegments
  bevel: { enabled; size; thickness; segments }
  letterSpacing /* em */; lineHeight /* em */; align: 'left'|'center'|'right'
  deform: { bend: { enabled; angle; mode: 'arc'|'wrap' };
            twist: { enabled; angle };
            wave:  { enabled; amplitude; frequency; phase; axis: 'y'|'z' } }
  materialId: MaterialId
}
GroupNode   { type: 'group' }

ShapeNode extends NodeBase {           // v0.2 — extruded SVG artwork
  type: 'shape'
  source: AssetUri | null              // the original .svg, for provenance
  viewBox: [x, y, w, h]
  paths: { id; name; d /* normalised: absolute, transforms baked, M L C Q Z only */;
           fillRule: 'nonzero'|'evenodd'; stroke: { width; join; cap } | null;
           sourceColor; visible; materialId?; depthScale }[]
  size /* longest side */; depth; curveSegments; bevel; layerSpacing; deform
  materialId: MaterialId               // fallback for paths without their own
}
PrimitiveNode { type: 'primitive'; kind: 'sphere'|'roundedBox'|'torus'|'capsule'|
                'cylinder'|'cone'|'ring'|'blob'; params: { radius; size; tube; … noise };
                smooth; materialId }
ModelNode   { type: 'model'; source: AssetUri; format: 'glb'|'gltf'|'fbx'|'obj';
              fitSize; pivot: 'center'|'bottom'|'original'; overrideMaterial; materialId }
```

Shape paths are normalised **at import** (the studio parses SVG with three's `SVGLoader`,
which needs a DOM) into plain path data, so the engine builds geometry anywhere — Node
tests, workers, the embed player — without a DOM. `nodeMaterialIds(node)` lists every
material a node uses (shape paths included); pruning, duplication and validation use it.

The flat list + `parentId` keeps reordering, selection and diffing simple while still
supporting hierarchy. Array order = draw/list order.

**Materials** are a discriminated union on `type`. `'physical'` maps 1:1 onto
`THREE.MeshPhysicalMaterial` parameters (colour, metalness, roughness,
transmission/IOR/thickness/dispersion/attenuation, clearcoat, sheen, iridescence,
anisotropy, specular, emissive, opacity, env intensity), plus texture slots (`map`,
`normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `emissiveMap`, `alphaMap` as
`AssetUri`), one shared UV transform and a `holographic` layer (v0.2). `'matcap'` (v0.2)
maps onto `MeshMatcapMaterial` (matcap image, tint, opacity). **Presets** are plain
data in `@galbe/core/presets`: applying a preset copies its spec into the document, so
documents never depend on preset definitions that might change later.

**Animation** (v0.3, `schema/animation.ts`). A `Track` holds keyframes
`{ id, time, value: number | '#rrggbb', easing }` for one property addressed by a dot path
from the document root, where arrays of identified objects are indexed by id:
`nodes.<id>.transform.rotation.1`, `materials.<id>.color`, `effects.<id>.params.intensity`,
`overlays.<id>.opacity`, `camera.fov`… Ids are base62, so paths never need escaping, and
they survive reordering. Easings are named curves (including `hold`, overshoot, elastic,
bounce) or a CSS-style cubic-bezier tuple. A `Motion` is a preset applied on top of the
tracks: `spin | float | swing | wave | reveal | materialTransition` on a node, or
`orbit | truck | dolly` on the camera, each with a time span (`start`, `end` or null =
end of the timeline). Repeating motions use whole turns and cycles, and one-way motions
offer ping-pong, so loops are seamless by construction.

**Overlays** (`schema/cover.ts`) are flat text drawn over the render: text, `FontRef`,
size as a fraction of the frame height, colour, opacity, position in frame coordinates
(0,0 top-left), alignment, spacing, rotation, case and a legibility shadow. They are
animatable like everything else.

### 3.2 Assets and URIs

Binary content is referenced, never inlined, through an **asset URI**:

| URI                       | Resolves to                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `builtin:fonts/inter-700` | A file shipped with the app (`@galbe/assets`), served under `/builtin/`. Builtin ids are **stable forever** (we only ever add). |
| `asset:<sha256-128>`      | A file stored with the project: IndexedDB `assets` store in the studio, `assets/<id>.<ext>` in a `.galbe` zip.                  |

Project asset ids are the first 128 bits of the SHA-256 of the content, so identical
files are deduplicated across projects. `doc.assets[id]` stores metadata only
(`kind`, `name`, `mime`, `size`, `origin`). Fonts chosen from the Google Fonts
catalogue are downloaded once (from Fontsource's CDN, OFL) and stored as project
assets, so a saved project renders offline and on any machine.

### 3.3 Versioning and migrations

- `schemaVersion` is an integer. **Additive** changes (new optional fields with
  defaults, new node/material/effect types) do _not_ bump it: Zod defaults fill
  missing fields when an older document is parsed.
- **Breaking** changes bump it and register a migration
  `migrations[n]: (raw: unknown) => unknown` that upgrades version `n` to `n + 1`.
- `loadDocument(raw)` reads the version, applies migrations in order, then validates
  with the current schema. Documents from a _newer_ Galbe are rejected with a clear
  error instead of being silently truncated.

### 3.4 Operations

`@galbe/core/ops` contains small functions (`addNode`, `removeNodes`, `duplicateNodes`,
`reorderNode`, `setMaterial`…) written to mutate a draft. The studio runs them inside
Immer's `produce`, which gives structural sharing for free; tests run them on clones.
Removing nodes also prunes their tracks and motions; duplicating copies them; materials a
transition blends into are never pruned. Keyframe operations (`setKeyframe`, `keyChanges`,
`shiftKeyframes`, `removeKeyframes`, `closeLoop`, `bakeTrackedValues`) live in
`@galbe/core/animation` and follow the same draft-mutating style.

### 3.5 The `.galbe` file format

A `.galbe` file is a zip (written with `fflate`):

```
scene.json            GalbeDocument (UTF-8 JSON)
assets/<id>.<ext>     every asset:… referenced by the document
thumbnail.png         optional, for file browsers and the project list
```

`packGalbe(doc, getAsset)` / `unpackGalbe(bytes)` live in core and are pure
(Uint8Array in, Uint8Array out) so they are tested in Node.

---

## 4. Rendering pipeline (`@galbe/engine`)

### 4.1 Overview

```
 GalbeDocument ──► SceneController.sync(doc)
                     │  diff by node id + per-node "build key"
                     │  ├─ geometry builders (text → glyph cache → extrude → deform)
                     │  ├─ MaterialLibrary (spec → MeshPhysicalMaterial, updated in place)
                     │  ├─ EnvironmentController (HDRI → PMREM, rotation, intensity, blur)
                     │  ├─ Lights, ContactShadows, background
                     │  └─ async loads (fonts, HDRIs) → onChange() → host re-renders
                     ▼
               THREE.Scene  ──►  frame render
                                   1. pre-passes  (contact shadow depth + blur)
                                   2. scene render (transmission pass handled by three)
                                   3. post stack  (when effects are enabled, see 4.4)
                                   4. output      (tone mapping + sRGB)
```

- **SceneController** owns a `THREE.Group`. On `sync(doc)` it creates, updates or
  disposes one object per node. Each builder computes a _build key_ from the
  parameters that affect geometry (text, font, size, depth, bevel, deform…). If the key
  is unchanged, only cheap properties (transform, visibility, material) are touched.
  Rebuilds are synchronous; moving text/shape builds to a Web Worker is planned for v0.3.
  Builders: text (4.2), shapes (one mesh per path, stacked by `layerSpacing`, Clipper
  boolean union per fill rule, `ClipperOffset` for strokes, then the same extrusion and
  deformers as text), primitives (three geometries plus a seeded simplex-noise blob) and
  models (`ModelLibrary` parses each asset once, lazily importing GLTF/FBX/OBJ loaders;
  nodes get a clone, scaled to `fitSize` and offset to the chosen pivot).
- **MaterialLibrary** creates a `MeshPhysicalMaterial` or `MeshMatcapMaterial` per
  document material; textures come from a `TextureLibrary` (one load per asset and colour
  space, one clone per material for its UV transform). The holographic layer is injected
  with `onBeforeCompile` and only compiled in when enabled (`customProgramCacheKey`).
- **ReflectiveGround** is three's `Reflector` with Galbe's shader: the mirror image is
  blurred through its mip chain and faded at the floor's edge. It copies the camera's
  projection, so export tiles (view offsets) reflect correctly.
- **Hosts** decide _when_ to render. The studio uses R3F with `frameloop="demand"`
  and mounts the controller's group with `<primitive>`; the player (v0.4) runs its own
  minimal loop; exporters render on demand.

### 4.2 Text geometry

1. **Fonts** — `FontLibrary` loads font files (`opentype.js`, TTF/OTF/WOFF) from asset
   URIs and caches parsed fonts. A `FontRef` lists several files (e.g. Latin and
   Latin-Extended subsets); per character the first font that has the glyph is used.
2. **Layout** — lines are split on `\n`; glyphs advance by their advance width, plus
   kerning and `letterSpacing × size`; lines are spaced by `lineHeight × size` and
   aligned left/centre/right. The block is centred on its bounding box.
3. **Glyph outlines → shapes** — opentype path commands are flattened (`curveSegments`
   points per curve) and merged with a boolean union using the **non-zero** fill rule
   (Clipper). This resolves holes and islands for TrueType and CFF alike, and fixes the
   overlapping or self-intersecting contours that static instances of variable fonts
   often keep. Kerning comes from a small built-in GPOS reader (PairPos formats 1–2,
   including Extension lookups that opentype.js skips), with opentype.js as fallback;
   ligatures use opentype.js shaping when the font's GSUB is supported.
4. **Extrusion** — `ExtrudeGeometry` per glyph with `bevelOffset = -bevelSize` so the
   silhouette stays true to the typeface while the bevel rounds the edges. Results are
   cached per `(font, glyph, size, depth, bevel, curveSegments)`; repeated letters reuse
   the cached buffers. Glyphs are merged into one geometry with a `glyphIndex`
   attribute (used by per-letter animation in v0.3).
5. **Deformations** — bend (arc in the text plane, or cylindrical wrap), twist and wave
   are pure functions `Vec3 → Vec3` composed in order. Before deforming, triangles are
   refined with a **crack-free, edge-length based subdivision** (an edge is split iff it
   is longer than a threshold, so neighbouring triangles always agree). Normals are
   transformed with the inverse-transpose of the deformation's Jacobian (finite
   differences), keeping bevels smooth instead of faceted.

### 4.3 Materials, light and colour

- Linear workflow, sRGB output; tone mapping selectable (default **Khronos PBR
  Neutral**, which keeps brand colours faithful; AgX and ACES for a filmic look).
- `MaterialLibrary` keeps one `MeshPhysicalMaterial` per document material and patches
  properties in place; three.js recompiles only when a feature toggles (e.g.
  transmission on/off).
- **Environment**: equirectangular HDRIs (Poly Haven, CC0) → `PMREMGenerator`;
  `scene.environmentRotation`, `environmentIntensity`, `backgroundBlurriness` give
  rotation, intensity and background blur without re-filtering.
- **Contact shadows**: an orthographic depth pass from below the objects, blurred in
  two separable passes, displayed on a ground plane. The texture is view-independent,
  so it does not need re-rendering for export tiles.

### 4.4 Post-processing

Effects are described **once, as data**, in `@galbe/core` (`EFFECT_DEFINITIONS`): each has
a type, a stage and self-describing params (kind, range, default, label, visibility
rules). Documents store `{ id, type, enabled, params }`; `resolveEffectParams` clamps and
defaults them, unknown types (plugins, newer files) are kept untouched. The studio
generates the effect inspector from the definitions.

The engine's **`PostStack`** (built on `postprocessing`) maps types to implementations
(`registerEffect`) and renders:

```
RenderPass (HalfFloat, MSAA ×4; colour background removed)
  → sanitize (NaN/∞ from half-float overflow)            only when an HDR effect is on
  → HDR effects in order: bloom, depth of field           linear light
  → tone mapping (the document's mode)                     one pass
  → background composite (flat colour, never tone-mapped, as without effects)
  → display effects in order, one pass each               sRGB-aware, may read neighbours
  → canvas (sRGB)
```

With no enabled effect the host renders directly (zero overhead). Any change to the set
or order rebuilds the composer; param changes only update uniforms. Galbe's own effects
(`GalbeEffect`) work in **full-frame pixel coordinates** — the renderer passes the tile
offset and the full output size — and express sizes in document pixels multiplied by
`uPxScale` (render pixels per document pixel). The viewport preview therefore matches
exports at any scale, and tiled exports have no seams; tiles are padded by the stack's
reach (`PostStack.support`). Grain and glitch are seeded, never time-based. LUTs come from
`.cube` files (`parseCubeLut`) or procedural looks, loaded with the document so exports
never miss them.

### 4.5 Animation

`evaluateScene(doc, t) → { doc, parts }` (core, pure) resolves the timeline at time `t`:

1. every enabled track is sampled (held before its first and after its last key, colours
   interpolated in sRGB like CSS, integer fields rounded) and written through a
   copy-on-write `PathWriter`, so the evaluated document shares every untouched branch with
   the source — cheap enough to run every frame;
2. motions are applied in order on top: transforms are offset (spin, float, swing), the
   camera is moved (orbit around the target, truck sideways, dolly along the view axis), a
   material transition writes a synthetic blended material (`__motion_<id>_<source>`:
   numbers and colours interpolate, textures and switches flip at half-way);
3. per-letter motions (`wave`, `reveal`) are returned as `parts` for text and shape nodes,
   and `partTransform(parts, index, count)` gives each letter's offset, rotation and scale
   about its own centre (reveal orders: forward, backward, centre, edges, seeded random).

`SceneController.syncAt(doc, t)` syncs the evaluated document, then applies `parts`: text
keeps its rest pose (positions, normals, glyph centres from the `part` attribute) and
rewrites the vertex buffers; shapes set one matrix per path mesh. A letter scaled to 0
collapses to a point and draws nothing. When the document is animated, the ground (contact
shadow, reflective floor) is placed from the _un-animated_ document once per edit, so a
floating object's shadow softens instead of following it. `baseCameraFor` inverts the
camera motions, which lets the studio's orbit controls keep editing the base camera while
a camera move is playing. Playback, the image export (at the playhead) and the video
export all call `syncAt`; nothing reads the clock.

### 4.6 Backgrounds and media

`BackgroundLayer` draws gradient, image and video backgrounds with one GLSL function,
`galbeBackground(p)`, evaluated in **full-frame** coordinates (the camera's view offset and
the render target size are read in `onBeforeRender`), so export tiles line up. Without
effects it is a full-screen triangle at the back of the scene (render order −10 000, not
tone-mapped): glass refracts it and contact shadows fall on it. With effects, the mesh is
hidden and the effect stack's background pass composites the same function after tone
mapping, sharing the layer's uniform objects. Gradients are blended in sRGB (mesh gradients
use inverse-distance weights) with optional dithering; media are fitted like CSS
`object-fit`.

`VideoLibrary` owns one `<video>` per clip and maps timeline time to clip time
(`startAt + t × speed`, looped or clamped). While the studio plays, clips play natively and
are re-synced only when they drift; when paused or exporting, each clip is seeked to the
exact time and `whenReady()` waits for the `seeked` event and the next presented frame.
The same clips back video _textures_: `TextureLibrary` routes asset URIs whose kind is
`video` to the library.

### 4.7 Geometry worker

`GeometryWorkerClient` (engine) talks to a worker that runs `serveGeometry`
(`@galbe/engine/worker`, which imports only the text and shape builders). The worker has
its own `FontLibrary`; the studio's worker reads project fonts straight from IndexedDB.
Requests carry the node's geometry fields; results are triangle soups whose buffers are
transferred. The controller keeps the previous geometry until the matching result arrives
(stale results are dropped by build key), tracks the request in `whenReady()`, and falls
back to building on the main thread if the worker dies. Tests run the same client and
server in-process.

## 5. Studio (`apps/studio`)

### 5.1 State

- **`useDocumentStore`** (Zustand + Immer): `doc`, `history { past, future }`, actions.
  - `update(recipe, { label, coalesce?, history? })` runs a recipe in `produce`.
  - **Transactions**: `begin()` / `end()` wrap a slider drag or gizmo drag so it yields a
    single undo step while the viewport updates live.
  - History stores document snapshots (cheap thanks to structural sharing). Camera
    moves are excluded from history: restoring a snapshot keeps the current camera.
- **`usePlaybackStore`**: playhead (snapped to frames when paused), playing, auto-key,
  timeline visibility, selected keyframes. Playback advances with `requestAnimationFrame`;
  the viewport re-syncs on every tick through `showFrame(doc, t)`.
- **Auto-key** is a hook inside `update`: after a recipe runs, `diffAnimatable` lists the
  numbers and colours that changed under animatable roots and `keyChanges` keys them at the
  playhead — always for properties that already have a track, and for any property when
  auto-key is on (with the previous value keyed at 0). Structural edits pass
  `animate: false`. When the playhead moves, `bakePlayhead` writes the tracked values at
  that time into the document (no undo step, never keyed), so the inspector shows and edits
  what the viewport shows.
- **`useUiStore`**: selection, active shape path, inspector and left-panel tabs, expanded
  effect, panel visibility, dialogs, `interacting` flag (drives adaptive quality).
- **History panel**: lists `past` / `future` labels; clicking an entry calls
  `step(delta)`, i.e. repeated undo/redo.
- **Grouping** (`groupNodes`, `ungroupNodes`, `reparentNode` in core) preserves world
  transforms with a small dependency-free matrix module (`@galbe/core/transform`). The
  multi-selection gizmo moves a pivot at the selection's centre and applies its delta to
  each top-level selected node in its parent's space.
- Components subscribe with selectors; the viewport bridge subscribes imperatively
  and calls `controller.sync(doc)` without re-rendering React.

### 5.2 Viewport

- R3F `<Canvas frameloop="demand">`, sized to the **frame aspect** and fitted in the
  viewport area like an artboard — what you see is exactly what you export.
  Transparent backgrounds show a checkerboard behind the canvas.
- Cover overlays are drawn on a 2D canvas over the WebGL canvas with the exporter's own
  `drawOverlays`, so the viewport matches exports; overlay fonts are registered as
  `FontFace`s (one family per file, listed in fallback order). In the Cover tab each
  overlay gets a drag handle. Guides (safe zones, thirds, golden ratio, columns, centre
  lines) are an SVG layer that is never exported.
- `OrbitControls` drive the document camera; drei `TransformControls` move the
  selected node; clicks raycast into the engine group to select (`userData.nodeId`).
- **Adaptive quality**: while orbiting, dragging a gizmo or a slider, DPR drops to 1;
  full DPR (max 2) is restored when the interaction ends.

### 5.3 Persistence

- IndexedDB database `galbe` (via `idb`, version 2): `projects` (document + thumbnail +
  dates), `assets` (content-addressed blobs shared across projects), `library` (the user's
  saved materials, with the metadata of the assets they use) and `cache` (re-downloadable
  files such as 2K/4K HDRIs).
- Autosave is debounced (≈ 600 ms after the last change) and flushed on
  `visibilitychange`/`pagehide`. The last opened project reopens on launch.
- Import/export of `.galbe` files. Drag & drop, the file picker and the clipboard route
  files by kind (`app/fileDrop.ts`): `.galbe`, fonts, `.hdr`, SVG (→ shape), models,
  images and zipped texture sets (→ the selection's material, maps matched by file name),
  `.cube` (→ the LUT effect). Pasted SVG markup becomes a shape.

### 5.4 UI system

- **Design tokens** in `src/styles/tokens.css` (colours, spacing, radii, type scale,
  motion, z-index) are the only place raw values live. Components use CSS Modules +
  tokens, so re-skinning the UI means editing one file.
- Primitives in `src/ui/`: `Slider` (drag on label/track, Shift = fine ×0.1,
  Alt = coarse ×10, double-click = reset, arrow keys, typed input with expressions),
  `ColorInput`, `Select`, `Segmented`, `Toggle`, `Section`, `Dialog`, `Tooltip`.
- Hotkeys are declared in one registry (`lib/hotkeys.ts`) that also feeds the
  shortcut cheat-sheet (`?`).

---

## 6. Exporters (`@galbe/exporters`)

- **Image** (v0.1): `renderImage({ width, height, maxTileSize, renderTile, format })`.
  The host supplies `renderTile(tile)`, which renders the scene with
  `camera.setViewOffset(fullW, fullH, x, y, w, h)` and returns a canvas. Tiles are
  rendered with a padding margin and cropped, composed on a 2D canvas, then encoded to
  PNG/JPG/WebP (alpha preserved for PNG/WebP). The tile size respects the GPU limits
  (`MAX_TEXTURE_SIZE`, `MAX_RENDERBUFFER_SIZE`, viewport dims), so 8K works on any GPU.
- **Frames**: `composeImage` is the tile composer shared by images and video frames; an
  `afterCompose` hook draws the overlays (`drawOverlays`, pure canvas 2D) on top.
- **Video** (v0.3): `renderVideo` asks the host to draw frame `i` at time `i / fps` into one
  canvas, awaits it, then hands it to Mediabunny's `CanvasSource` (WebCodecs): MP4 / H.264
  (fallback HEVC, AV1) or WebM / VP9 (alpha kept as side data). Sizes are rounded to even
  pixels. PNG sequences are streamed into a zip (stored, PNGs are already compressed). The
  studio's `renderFrame(doc, t)` syncs the scene at `t`, waits for every load (fonts,
  textures, worker geometry, video seeks), renders through the effect stack, then draws
  the overlays — the image export uses the same function at the playhead.
- **3D** (v0.4): `GLTFExporter` (GLB) and `USDZExporter` on a baked copy of the scene.

---

## 7. Embed player (v0.4)

`<galbe-scene src="scene.galbe" interaction="orbit|mouse|scroll" autoplay>` — a custom
element that unpacks the file, builds the scene with `@galbe/engine`, and renders with
its own loop. No React. The studio's "Embed" export produces the HTML snippet.

## 8. AI module (v0.5)

`@galbe/ai` defines `AIProvider` (`textToTexture`, `imageTo3D`, `styleVariations`,
`generateBackground`, each optional and capability-flagged). Adapters: fal.ai,
Replicate, local ComfyUI. Disabled by default; the user's key is stored locally and
sent only to the chosen provider. The studio never depends on it.

---

## 9. Performance budget

- 60 fps on a recent MacBook for a typical scene (≤ 200k triangles, one transmissive
  material, contact shadows, two effects).
- `frameloop="demand"`: no GPU work when nothing changes.
- Glyph extrusion cache; deformation subdivision only when a deformer is active.
- DPR drop during interaction; heavy pre-passes (contact shadows) skipped while the
  camera alone moves.

## 10. Privacy & security

- No telemetry. No account. No server.
- Network access only for: the Google Fonts catalogue (Fontsource API/CDN, when the
  user opens it) and, if enabled, the AI provider the user configured.
- Imported files are parsed client-side; SVG is never injected into the DOM
  (parsed with `SVGLoader`), and `.galbe` contents are validated by Zod before use.

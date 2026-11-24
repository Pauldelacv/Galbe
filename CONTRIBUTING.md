# Contributing to Galbe

Thanks for helping! Galbe is a 3D design studio for graphic designers, so contributions are
judged on two things: **does it make better images**, and **is it pleasant to use**.

- [Setup](#setup)
- [Ground rules](#ground-rules)
- [Where things live](#where-things-live)
- [Recipes](#recipes): add a material · an effect · a template · an AI provider · a font, HDRI or matcap
- [Pull requests](#pull-requests)

## Setup

Requirements: Node ≥ 22.12 and pnpm (the version is pinned in `package.json`; with
Corepack, `corepack enable` is enough).

```bash
pnpm install
pnpm dev            # studio on http://localhost:5173
pnpm test           # unit tests (Vitest)
pnpm lint           # Biome (lint + format check); `pnpm lint:fix` to fix
pnpm typecheck      # TypeScript, every package
pnpm test:e2e       # Playwright smoke test of the built studio
```

Read [ARCHITECTURE.md](./ARCHITECTURE.md) first: it explains the scene document, the engine
and how the studio is wired.

## Ground rules

1. **Clean room.** Galbe re-implements features found in other 3D design tools; it never
   copies them. Do not paste code, shaders, assets, presets, templates, UI copy, names or
   pixel-perfect layouts from other products. If you studied a commercial tool, describe the
   _behaviour_ you want, then design it yourself.
2. **Licences.** Bundled assets must be CC0, or under a licence that allows redistribution
   inside an MIT application (e.g. SIL OFL for fonts). Every bundled file is listed in
   [ASSETS.md](./ASSETS.md) with its source and licence, in the same pull request.
3. **The document is the truth.** Anything a user makes must live in the `GalbeDocument`
   (`@galbe/core`). Rendering derives from it. Never store state only in a three.js object
   or a React component.
4. **Determinism.** Engine code is a pure function of `(document, time)`: no `Date.now()`,
   no `Math.random()` without a seed stored in the document.
5. **Schema changes.** Prefer additive changes (new optional fields with Zod defaults). A
   breaking change bumps `CURRENT_SCHEMA_VERSION` and registers a migration with a test.
6. **UI values come from tokens.** Colours, spacing, radii and type sizes live in
   `apps/studio/src/styles/tokens.css`. Components use CSS Modules + tokens only.

## Where things live

| You want to…                         | Look in                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| Change what a project can contain    | `packages/core/src/schema`                                        |
| Change how something renders         | `packages/engine/src`                                             |
| Change how images/videos are written | `packages/exporters/src`                                          |
| Change the studio UI                 | `apps/studio/src` (`features/`, `panels/`, `ui/`)                 |
| Add a keyboard shortcut              | `apps/studio/src/lib/hotkeys.ts` (also feeds the `?` cheat sheet) |

## Recipes

### Add a material preset

Presets are plain data in `packages/core/src/presets/materials.ts`:

```ts
{
  id: 'satin-copper',                 // stable, kebab-case, never reused
  name: 'Satin copper',
  category: 'metal',                   // metal | glass | solid | special
  description: 'Warm metal with a soft sheen.',
  spec: { name: 'Satin copper', color: '#e3a07a', metalness: 1, roughness: 0.28 },
  swatch: 'linear-gradient(160deg,#ffd9c2,#b8653d 50%,#5a2a12)',
}
```

`spec` accepts any field of `PhysicalMaterialSchema` (`packages/core/src/schema/material.ts`);
unspecified fields use schema defaults. Applying a preset **copies** its values into the
document, so tuning a preset later never changes existing projects. Check it under several
HDRIs, then run `pnpm test` (every preset is validated).

### Add a post-processing effect

An effect has two halves:

1. **Its definition** — plain data in `packages/core/src/effects.ts` (`EFFECT_DEFINITIONS`):
   type, label, stage and params. Params are self-describing (`number`, `boolean`, `color`,
   `select`, `asset`) with ranges and defaults; they drive validation, defaults **and** the
   inspector UI, which is generated from them.

   ```ts
   {
     type: 'posterize',
     label: 'Posterize',
     description: 'Reduces the number of colour levels.',
     stage: 'display', // 'hdr' runs before tone mapping (bloom, DOF), 'display' after
     params: { levels: num('Levels', 6, 2, 32, { integer: true, step: 1, precision: 0 }) },
   }
   ```

2. **Its implementation** — registered in the engine (`packages/engine/src/effects`):

   ```ts
   registerEffect('posterize', {
     create: () => new GalbeEffect('Posterize', glsl, { levels: 6 }),
     update: (effect, params, frame) => {
       (effect as GalbeEffect).setFrame(frame);
       (effect as GalbeEffect).set('levels', params.levels);
     },
   });
   ```

Rules: effects must be deterministic for a given document (seed any noise; no clock);
screen-space effects extend `GalbeEffect` and work in **full-frame pixels**
(`framePx(uv)`, `tileUv(px)`) with sizes multiplied by `uPxScale`, so the viewport matches
exports and tiled 8K exports have no seams. Colour work happens in display space
(`toSrgb` / `toLinear`). Write your own GLSL and keep it in the effect's file. Avoid GLSL
reserved words as identifiers (`active`, `half`, `input`, `output`…).

### Add a template (v0.4)

Templates are ordinary `.galbe` files in `templates/`:

1. Build the scene in the studio, using only builtin fonts/HDRIs or CC0/OFL assets you add
   to `ASSETS.md`.
2. _Save as .galbe_ and drop the file in `templates/<kebab-name>.galbe`.
3. Add an entry (name, category, frame format) to `templates/index.json`.

Templates must be original designs. Do not recreate templates from other products.

### Add an AI provider (v0.5)

Providers implement the `AIProvider` interface in `packages/ai`:

```ts
export const myProvider: AIProvider = {
  id: 'my-provider',
  label: 'My provider',
  capabilities: ['textToTexture', 'imageTo3D'],
  settings: z.object({ apiKey: z.string().min(1) }),
  async textToTexture(prompt, options, context) {
    /* call the API, return PBR maps */
  },
};
```

The user's key is stored locally and sent **only** to that provider's endpoint. Network
calls must be cancellable (`AbortSignal`) and report progress. The studio must stay fully
usable when no provider is configured.

### Add a builtin font or HDRI

Edit the lists in `packages/assets/scripts/fetch-assets.mjs` (Google Fonts families via
Fontsource, Poly Haven HDRIs), run it, then run `hdri-previews.mjs`, and update
`ASSETS.md`. Builtin ids are **permanent**: never rename or remove one, because saved
projects reference them.

## Pull requests

- One topic per pull request; keep commits focused (`feat(engine): …`, `fix(studio): …`).
- Include tests for logic (core, engine geometry, exporters) and a screenshot or short clip
  for visual changes.
- CI must be green: lint, typecheck, unit tests, build and the e2e smoke test.
- By contributing you agree that your work is released under the [MIT licence](./LICENSE)
  and that you follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

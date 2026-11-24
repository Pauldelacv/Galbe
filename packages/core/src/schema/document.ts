import { z } from 'zod';
import { EffectSpecSchema } from '../effects.ts';
import { CURRENT_SCHEMA_VERSION } from '../version.ts';
import { AssetUriSchema, ColorSchema, unit, Vec3Schema } from './common.ts';
import { MaterialSpecSchema } from './material.ts';
import { nodeMaterialIds, SceneNodeSchema } from './nodes.ts';

export const FRAME_PRESET_IDS = ['1:1', '4:5', '9:16', '16:9', 'a4', 'custom'] as const;
export type FramePresetId = (typeof FRAME_PRESET_IDS)[number];

/** Output frame (artboard). Width/height are the base export size in pixels. */
export const FrameSchema = z.object({
  preset: z.enum(FRAME_PRESET_IDS).default('1:1'),
  width: z.number().int().min(16).max(16384).default(1080),
  height: z.number().int().min(16).max(16384).default(1080),
});
export type Frame = z.infer<typeof FrameSchema>;

export const BackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transparent') }),
  z.object({ type: z.literal('color'), color: ColorSchema.default('#16161a') }),
  z.object({
    type: z.literal('environment'),
    /** 0 = sharp HDRI, 1 = fully blurred. */
    blur: unit().default(0.6),
    intensity: z.number().min(0).max(10).default(1),
  }),
]);
export type Background = z.infer<typeof BackgroundSchema>;

export const CameraSchema = z.object({
  /** Vertical field of view in degrees. */
  fov: z.number().min(1).max(120).default(27),
  position: Vec3Schema.default([0, 0.6, 7]),
  target: Vec3Schema.default([0, 0, 0]),
  near: z.number().positive().default(0.05),
  far: z.number().positive().default(500),
});
export type Camera = z.infer<typeof CameraSchema>;

export const EnvironmentSchema = z.object({
  /** Equirectangular HDRI. `null` = no image-based lighting (lights only). */
  hdri: AssetUriSchema.nullable().default('builtin:hdri/studio-small-09'),
  intensity: z.number().min(0).max(10).default(1),
  /** Rotation around the vertical axis, degrees. */
  rotation: z.number().min(-360).max(360).default(0),
  /**
   * Resolution of builtin HDRIs. Bundled files are 1K; `2k`/`4k` are downloaded on demand
   * from Poly Haven (CC0) and cached locally, for sharper reflections in large exports.
   */
  resolution: z.enum(['1k', '2k', '4k']).default('1k'),
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ContactShadowSchema = z.object({
  enabled: z.boolean().default(true),
  opacity: unit().default(0.55),
  /** Blur radius, roughly in texels of the shadow map. */
  blur: z.number().min(0).max(10).default(2.5),
  /** How far above the ground objects still cast a shadow, scene units. */
  far: z.number().min(0.01).max(50).default(1.2),
  color: ColorSchema.default('#000000'),
  resolution: z.union([z.literal(256), z.literal(512), z.literal(1024)]).default(512),
});
export type ContactShadow = z.infer<typeof ContactShadowSchema>;

export const GroundSchema = z.object({
  contactShadow: ContactShadowSchema.prefault({}),
  /** Gap between the lowest point of the content and the ground plane, scene units. */
  offset: z.number().min(0).max(10).default(0.02),
  /** Ground size relative to the content's footprint. */
  scale: z.number().min(1).max(20).default(2.5),
  /** Mirror-like floor under the content. */
  reflection: z
    .object({
      enabled: z.boolean().default(false),
      /** Reflection strength. */
      strength: unit().default(0.5),
      /** 0 = mirror, 1 = very blurry. */
      blur: unit().default(0.35),
      /** How quickly the reflection fades with height above the floor, scene units. */
      fade: z.number().min(0.01).max(50).default(1.5),
      /** Floor colour under the reflection. */
      color: ColorSchema.default('#000000'),
      /** Opacity of the floor colour (0 = only the reflection is visible). */
      floorOpacity: unit().default(0),
    })
    .prefault({}),
});
export type Ground = z.infer<typeof GroundSchema>;

const lightBase = {
  id: z.string().min(1),
  name: z.string().default('Light'),
  visible: z.boolean().default(true),
  color: ColorSchema.default('#ffffff'),
  intensity: z.number().min(0).max(1000).default(2),
};
export const LightSchema = z.discriminatedUnion('type', [
  z.object({
    ...lightBase,
    type: z.literal('directional'),
    position: Vec3Schema.default([3, 5, 4]),
    target: Vec3Schema.default([0, 0, 0]),
  }),
  z.object({
    ...lightBase,
    type: z.literal('point'),
    position: Vec3Schema.default([2, 2, 2]),
    distance: z.number().min(0).default(0),
  }),
  z.object({
    ...lightBase,
    type: z.literal('spot'),
    position: Vec3Schema.default([2, 4, 3]),
    target: Vec3Schema.default([0, 0, 0]),
    /** Cone half-angle, degrees. */
    angle: z.number().min(1).max(89).default(30),
    penumbra: unit().default(0.5),
    distance: z.number().min(0).default(0),
  }),
]);
export type Light = z.infer<typeof LightSchema>;

export const TONE_MAPPINGS = ['neutral', 'agx', 'aces', 'none'] as const;
export const RenderSettingsSchema = z.object({
  toneMapping: z.enum(TONE_MAPPINGS).default('neutral'),
  exposure: z.number().min(0.05).max(8).default(1),
});
export type RenderSettings = z.infer<typeof RenderSettingsSchema>;

export const ASSET_KINDS = ['font', 'hdri', 'image', 'video', 'model', 'svg', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Metadata for a project asset; the bytes live in IndexedDB or in the `.galbe` zip. */
export const AssetEntrySchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  kind: z.enum(ASSET_KINDS),
  name: z.string().default('asset'),
  mime: z.string().default('application/octet-stream'),
  size: z.number().int().min(0).default(0),
  /** Free-form provenance (e.g. `{ source: 'fontsource', family: 'Inter', subset: 'latin' }`). */
  meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const GalbeDocumentSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().default('Untitled'),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    generator: z.string().default('galbe'),

    frame: FrameSchema.prefault({}),
    background: BackgroundSchema.default({ type: 'color', color: '#16161a' }),
    camera: CameraSchema.prefault({}),
    environment: EnvironmentSchema.prefault({}),
    ground: GroundSchema.prefault({}),
    lights: z.array(LightSchema).default([]),
    render: RenderSettingsSchema.prefault({}),

    materials: z.record(z.string(), MaterialSpecSchema).default({}),
    nodes: z.array(SceneNodeSchema).default([]),
    assets: z.record(z.string(), AssetEntrySchema).default({}),

    /** Post-processing stack, applied in order (within each stage). */
    effects: z.array(EffectSpecSchema).default([]),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const [index, node] of doc.nodes.entries()) {
      if (ids.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate node id "${node.id}"`,
          path: ['nodes', index, 'id'],
        });
      }
      ids.add(node.id);
    }
    for (const [index, node] of doc.nodes.entries()) {
      if (node.parentId !== null && !ids.has(node.parentId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Unknown parent "${node.parentId}"`,
          path: ['nodes', index, 'parentId'],
        });
      }
      for (const materialId of nodeMaterialIds(node)) {
        if (!(materialId in doc.materials)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown material "${materialId}"`,
            path: ['nodes', index, 'materialId'],
          });
        }
      }
    }
    for (const [key, material] of Object.entries(doc.materials)) {
      if (material.id !== key) {
        ctx.addIssue({
          code: 'custom',
          message: 'Material key must equal its id',
          path: ['materials', key, 'id'],
        });
      }
    }
    for (const [key, asset] of Object.entries(doc.assets)) {
      if (asset.id !== key) {
        ctx.addIssue({
          code: 'custom',
          message: 'Asset key must equal its id',
          path: ['assets', key, 'id'],
        });
      }
    }
  });

export type GalbeDocument = z.infer<typeof GalbeDocumentSchema>;
export type GalbeDocumentInput = z.input<typeof GalbeDocumentSchema>;

import { z } from 'zod';
import { AssetUriSchema, TransformSchema } from './common.ts';

const nodeBase = {
  id: z.string().min(1),
  name: z.string().default('Layer'),
  parentId: z.string().nullable().default(null),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  transform: TransformSchema.prefault({}),
  castShadow: z.boolean().default(true),
};

/**
 * A font face made of one or more files. Files are tried in order for each character,
 * which lets a face be split in subsets (Latin, Latin Extended…) or fall back.
 */
export const FontRefSchema = z.object({
  family: z.string().min(1),
  weight: z.number().int().min(1).max(1000).default(400),
  style: z.enum(['normal', 'italic']).default('normal'),
  files: z.array(AssetUriSchema).min(1),
});
export type FontRef = z.infer<typeof FontRefSchema>;

export const BevelSchema = z.object({
  enabled: z.boolean().default(true),
  /** How far the bevel reaches into the face, in scene units. */
  size: z.number().min(0).max(1).default(0.02),
  /** How deep the bevel is along the extrusion axis, in scene units. */
  thickness: z.number().min(0).max(1).default(0.03),
  segments: z.number().int().min(1).max(16).default(4),
});
export type Bevel = z.infer<typeof BevelSchema>;

export const DeformSchema = z.object({
  bend: z
    .object({
      enabled: z.boolean().default(false),
      /** Total arc angle across the text width, degrees. Negative bends the other way. */
      angle: z.number().min(-360).max(360).default(60),
      /** `arc`: curve the baseline in the text plane. `wrap`: wrap around a vertical cylinder. */
      mode: z.enum(['arc', 'wrap']).default('arc'),
    })
    .prefault({}),
  twist: z
    .object({
      enabled: z.boolean().default(false),
      /** Total twist across the text width around the horizontal axis, degrees. */
      angle: z.number().min(-1440).max(1440).default(90),
    })
    .prefault({}),
  wave: z
    .object({
      enabled: z.boolean().default(false),
      /** Scene units. */
      amplitude: z.number().min(0).max(5).default(0.15),
      /** Number of periods across the text width. */
      frequency: z.number().min(0).max(20).default(1),
      /** Degrees. */
      phase: z.number().default(0),
      axis: z.enum(['y', 'z']).default('z'),
    })
    .prefault({}),
});
export type Deform = z.infer<typeof DeformSchema>;

export const TextNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('text'),
  name: z.string().default('Text'),
  text: z.string().max(2000).default('Galbe'),
  font: FontRefSchema,
  /** Em size in scene units. */
  size: z.number().min(0.01).max(100).default(1),
  /** Extrusion depth in scene units (bevel excluded). */
  depth: z.number().min(0).max(100).default(0.3),
  curveSegments: z.number().int().min(1).max(32).default(8),
  bevel: BevelSchema.prefault({}),
  /** Extra space between glyphs, in em. */
  letterSpacing: z.number().min(-1).max(5).default(0),
  /** Distance between baselines, in em. */
  lineHeight: z.number().min(0.1).max(10).default(1.1),
  align: z.enum(['left', 'center', 'right']).default('center'),
  deform: DeformSchema.prefault({}),
  materialId: z.string().min(1),
});
export type TextNode = z.infer<typeof TextNodeSchema>;

export const GroupNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('group'),
  name: z.string().default('Group'),
});
export type GroupNode = z.infer<typeof GroupNodeSchema>;

/** Node union. v0.2 adds `shape`, `primitive` and `model`. */
export const SceneNodeSchema = z.discriminatedUnion('type', [TextNodeSchema, GroupNodeSchema]);
export type SceneNode = z.infer<typeof SceneNodeSchema>;
export type SceneNodeType = SceneNode['type'];
export type SceneNodeInput = z.input<typeof SceneNodeSchema>;

/** Nodes that render a mesh and reference a material. */
export type MeshNode = Extract<SceneNode, { materialId: string }>;
export const isMeshNode = (node: SceneNode): node is MeshNode => 'materialId' in node;

import { z } from 'zod';
import { AssetUriSchema, TransformSchema, Vec3Schema } from './common.ts';

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

/**
 * One filled region of an imported vector shape. `d` is normalised SVG path data: absolute
 * coordinates, transforms baked in, y pointing down, commands `M L C Q Z` only.
 */
export const ShapePathSchema = z.object({
  id: z.string().min(1),
  name: z.string().default('Path'),
  d: z.string().max(2_000_000),
  fillRule: z.enum(['nonzero', 'evenodd']).default('nonzero'),
  /** When set, the path is an open or closed outline of this width (SVG units), not a fill. */
  stroke: z
    .object({
      width: z.number().positive(),
      join: z.enum(['miter', 'round', 'bevel']).default('round'),
      cap: z.enum(['butt', 'round', 'square']).default('round'),
    })
    .nullable()
    .default(null),
  /** Fill colour found in the source file (informational; the material holds the look). */
  sourceColor: z.string().default('#ffffff'),
  visible: z.boolean().default(true),
  /** Material of this path; falls back to the node's material when absent. */
  materialId: z.string().min(1).optional(),
  /** Extrusion of this path relative to the node depth (1 = same depth). */
  depthScale: z.number().min(0).max(20).default(1),
});
export type ShapePath = z.infer<typeof ShapePathSchema>;

/** Extruded vector artwork (SVG import or paste). */
export const ShapeNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('shape'),
  name: z.string().default('Shape'),
  /** Original file, kept for provenance and re-import. */
  source: AssetUriSchema.nullable().default(null),
  /** View box of the artwork in SVG units: [minX, minY, width, height]. */
  viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  paths: z.array(ShapePathSchema).max(2000),
  /** Size of the longest side of the artwork, scene units. */
  size: z.number().min(0.01).max(100).default(2),
  depth: z.number().min(0).max(100).default(0.2),
  curveSegments: z.number().int().min(1).max(32).default(8),
  bevel: BevelSchema.prefault({}),
  /** Gap along Z between successive paths, so overlapping fills never z-fight. */
  layerSpacing: z.number().min(0).max(1).default(0.004),
  deform: DeformSchema.prefault({}),
  materialId: z.string().min(1),
});
export type ShapeNode = z.infer<typeof ShapeNodeSchema>;

export const PRIMITIVE_KINDS = [
  'sphere',
  'roundedBox',
  'torus',
  'capsule',
  'cylinder',
  'cone',
  'ring',
  'blob',
] as const;
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/**
 * Parameters of every primitive kind live side by side so switching kind keeps a sensible
 * size; each kind reads the fields it needs.
 */
export const PrimitiveParamsSchema = z.object({
  /** sphere, torus (major), capsule, cylinder, cone, ring (outer), blob. */
  radius: z.number().min(0.01).max(100).default(0.75),
  /** roundedBox. */
  size: Vec3Schema.default([1.2, 1.2, 1.2]),
  /** roundedBox corner radius. */
  cornerRadius: z.number().min(0).max(50).default(0.15),
  /** torus tube radius. */
  tube: z.number().min(0.005).max(50).default(0.25),
  /** ring inner radius as a fraction of the outer radius. */
  innerRatio: z.number().min(0).max(0.99).default(0.6),
  /** capsule, cylinder, cone, ring thickness. */
  height: z.number().min(0.01).max(100).default(1.2),
  /** cylinder top radius ratio (1 = straight). */
  taper: z.number().min(0).max(4).default(1),
  /** Ring bevel (rounded edges). */
  bevel: z.number().min(0).max(1).default(0.04),
  /** Tessellation quality, 1 (coarse) … 4 (dense). */
  detail: z.number().int().min(1).max(4).default(2),
  /** Torus / cylinder / sphere: arc in degrees (360 = closed). */
  arc: z.number().min(1).max(360).default(360),
  /** blob: noise displacement. */
  noise: z
    .object({
      amplitude: z.number().min(0).max(2).default(0.25),
      frequency: z.number().min(0.01).max(10).default(1.4),
      octaves: z.number().int().min(1).max(5).default(2),
      seed: z.number().int().min(0).max(1_000_000).default(1),
    })
    .prefault({}),
});
export type PrimitiveParams = z.infer<typeof PrimitiveParamsSchema>;

export const PrimitiveNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('primitive'),
  name: z.string().default('Primitive'),
  kind: z.enum(PRIMITIVE_KINDS).default('sphere'),
  params: PrimitiveParamsSchema.prefault({}),
  smooth: z.boolean().default(true),
  materialId: z.string().min(1),
});
export type PrimitiveNode = z.infer<typeof PrimitiveNodeSchema>;

export const MODEL_FORMATS = ['glb', 'gltf', 'fbx', 'obj'] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];

/** Imported 3D model (GLB/GLTF/FBX/OBJ). */
export const ModelNodeSchema = z.object({
  ...nodeBase,
  type: z.literal('model'),
  name: z.string().default('Model'),
  source: AssetUriSchema,
  format: z.enum(MODEL_FORMATS),
  /** Longest side after normalisation, scene units. 0 = keep the file's own scale. */
  fitSize: z.number().min(0).max(100).default(2),
  /** Where the node origin sits relative to the model's bounds. */
  pivot: z.enum(['center', 'bottom', 'original']).default('center'),
  /** true: every mesh uses the node material; false: the file's own materials. */
  overrideMaterial: z.boolean().default(false),
  materialId: z.string().min(1),
});
export type ModelNode = z.infer<typeof ModelNodeSchema>;

export const SceneNodeSchema = z.discriminatedUnion('type', [
  TextNodeSchema,
  GroupNodeSchema,
  ShapeNodeSchema,
  PrimitiveNodeSchema,
  ModelNodeSchema,
]);
export type SceneNode = z.infer<typeof SceneNodeSchema>;
export type SceneNodeType = SceneNode['type'];
export type SceneNodeInput = z.input<typeof SceneNodeSchema>;

/** Nodes that render a mesh and reference a material. */
export type MeshNode = Extract<SceneNode, { materialId: string }>;
export const isMeshNode = (node: SceneNode): node is MeshNode => 'materialId' in node;

/** Every material a node references (its own, plus per-path materials of shapes). */
export function nodeMaterialIds(node: SceneNode): string[] {
  if (!isMeshNode(node)) return [];
  const ids = [node.materialId];
  if (node.type === 'shape') {
    for (const path of node.paths)
      if (path.materialId && !ids.includes(path.materialId)) ids.push(path.materialId);
  }
  return ids;
}

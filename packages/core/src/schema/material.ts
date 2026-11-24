import { z } from 'zod';
import { AssetUriSchema, ColorSchema, unit } from './common.ts';

export const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
] as const;
export type TextureSlot = (typeof TEXTURE_SLOTS)[number];

/** Texture slots of a physical material. Colour textures are sRGB, data textures linear. */
export const MaterialTexturesSchema = z
  .object(
    Object.fromEntries(
      TEXTURE_SLOTS.map((slot) => [slot, AssetUriSchema.nullable().default(null)]),
    ) as {
      [K in TextureSlot]: z.ZodDefault<z.ZodNullable<typeof AssetUriSchema>>;
    },
  )
  .prefault({});
export type MaterialTextures = z.infer<typeof MaterialTexturesSchema>;

/** UV placement shared by every texture of a material. */
export const UvTransformSchema = z.object({
  repeat: z
    .tuple([z.number().min(0.001).max(1000), z.number().min(0.001).max(1000)])
    .default([1, 1]),
  offset: z.tuple([z.number(), z.number()]).default([0, 0]),
  /** Degrees. */
  rotation: z.number().default(0),
});
export type UvTransform = z.infer<typeof UvTransformSchema>;

/** View-dependent thin-film rainbow layered on a physical material. */
export const HolographicSchema = z.object({
  enabled: z.boolean().default(false),
  /** Strength of the rainbow sheen. */
  strength: z.number().min(0).max(4).default(1),
  /** Number of colour bands across the view angle. */
  bands: z.number().min(0.1).max(20).default(2.5),
  /** Hue offset, degrees. */
  shift: z.number().min(-360).max(360).default(0),
  /** Concentrates the effect on grazing angles (0 = everywhere). */
  fresnel: z.number().min(0).max(8).default(1.5),
  /** Fine diffraction lines across the surface (0 = off). */
  lines: z.number().min(0).max(1).default(0.3),
});
export type Holographic = z.infer<typeof HolographicSchema>;

/**
 * Physically based material, mapped 1:1 onto `THREE.MeshPhysicalMaterial`.
 * Every field has a default so older documents keep parsing when fields are added.
 */
export const PhysicalMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().default('Material'),
  type: z.literal('physical'),
  /** Preset this material was created from, for display only (never re-read). */
  preset: z.string().optional(),

  color: ColorSchema.default('#ffffff'),
  metalness: unit().default(0),
  roughness: unit().default(0.5),
  opacity: unit().default(1),

  // Transmission (glass)
  transmission: unit().default(0),
  ior: z.number().min(1).max(2.333).default(1.5),
  thickness: z.number().min(0).max(20).default(0),
  dispersion: z.number().min(0).max(10).default(0),
  attenuationColor: ColorSchema.default('#ffffff'),
  /** 0 means "no attenuation" (infinite distance). */
  attenuationDistance: z.number().min(0).default(0),

  // Coatings
  clearcoat: unit().default(0),
  clearcoatRoughness: unit().default(0),
  sheen: unit().default(0),
  sheenColor: ColorSchema.default('#ffffff'),
  sheenRoughness: unit().default(0.5),
  iridescence: unit().default(0),
  iridescenceIOR: z.number().min(1).max(2.333).default(1.3),
  /** Thin-film thickness range in nanometres. */
  iridescenceThickness: z.tuple([z.number().min(0), z.number().min(0)]).default([100, 400]),

  // Specular & anisotropy
  specularIntensity: unit().default(1),
  specularColor: ColorSchema.default('#ffffff'),
  anisotropy: unit().default(0),
  /** Degrees. */
  anisotropyRotation: z.number().default(0),

  // Emission & environment
  emissive: ColorSchema.default('#000000'),
  emissiveIntensity: z.number().min(0).max(100).default(0),
  envMapIntensity: z.number().min(0).max(10).default(1),
  flatShading: z.boolean().default(false),

  // Textures (v0.2)
  textures: MaterialTexturesSchema,
  uv: UvTransformSchema.prefault({}),
  normalScale: z.number().min(-10).max(10).default(1),
  aoIntensity: unit().default(1),
  holographic: HolographicSchema.prefault({}),
});
export type PhysicalMaterial = z.infer<typeof PhysicalMaterialSchema>;

/** Unlit "material capture": a sphere image gives the whole look, independent of lights. */
export const MatcapMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().default('Matcap'),
  type: z.literal('matcap'),
  preset: z.string().optional(),
  matcap: AssetUriSchema,
  color: ColorSchema.default('#ffffff'),
  opacity: unit().default(1),
  flatShading: z.boolean().default(false),
});
export type MatcapMaterial = z.infer<typeof MatcapMaterialSchema>;

export const MaterialSpecSchema = z.discriminatedUnion('type', [
  PhysicalMaterialSchema,
  MatcapMaterialSchema,
]);
export type MaterialSpec = z.infer<typeof MaterialSpecSchema>;
export type MaterialSpecInput = z.input<typeof MaterialSpecSchema>;

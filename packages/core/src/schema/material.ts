import { z } from 'zod';
import { ColorSchema, unit } from './common.ts';

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
});
export type PhysicalMaterial = z.infer<typeof PhysicalMaterialSchema>;

/** Material union. v0.2 adds `matcap`. */
export const MaterialSpecSchema = z.discriminatedUnion('type', [PhysicalMaterialSchema]);
export type MaterialSpec = z.infer<typeof MaterialSpecSchema>;
export type MaterialSpecInput = z.input<typeof MaterialSpecSchema>;

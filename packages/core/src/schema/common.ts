import { z } from 'zod';

/** `#rrggbb` sRGB colour. */
export const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb colour')
  .transform((value) => value.toLowerCase());
export type Color = z.infer<typeof ColorSchema>;

/** A 3-component vector stored as a tuple to keep documents compact and diff-friendly. */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

/** Number in [0, 1]. */
export const unit = () => z.number().min(0).max(1);

/**
 * Reference to binary content.
 * - `builtin:<path>` — shipped with Galbe (`@galbe/assets`); ids are stable forever.
 * - `asset:<id>` — stored with the project; `<id>` is 128 bits of SHA-256, hex encoded.
 */
export const ASSET_URI_PATTERN = /^(?:builtin:[a-z0-9][a-z0-9/_.-]*|asset:[0-9a-f]{32})$/;
export const AssetUriSchema = z.string().regex(ASSET_URI_PATTERN, 'Expected builtin:… or asset:…');
export type AssetUri = z.infer<typeof AssetUriSchema>;

export const TransformSchema = z.object({
  position: Vec3Schema.default([0, 0, 0]),
  /** Euler angles in degrees, XYZ order. */
  rotation: Vec3Schema.default([0, 0, 0]),
  scale: Vec3Schema.default([1, 1, 1]),
});
export type Transform = z.infer<typeof TransformSchema>;

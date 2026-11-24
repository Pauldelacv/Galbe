import { z } from 'zod';
import { AssetUriSchema, ColorSchema, unit } from './common.ts';
import { FontRefSchema } from './nodes.ts';

/** A point in the frame: 0,0 = top-left, 1,1 = bottom-right. */
export const FramePointSchema = z.tuple([z.number().min(-1).max(2), z.number().min(-1).max(2)]);
export type FramePoint = z.infer<typeof FramePointSchema>;

export const GradientStopSchema = z.object({
  color: ColorSchema,
  /** 0–1 along the gradient. */
  position: unit(),
});
export type GradientStop = z.infer<typeof GradientStopSchema>;

export const MeshPointSchema = z.object({
  color: ColorSchema,
  position: FramePointSchema,
});
export type MeshPoint = z.infer<typeof MeshPointSchema>;

export const MAX_GRADIENT_STOPS = 6;
export const MAX_MESH_POINTS = 6;

export const GRADIENT_KINDS = ['linear', 'radial', 'mesh'] as const;
export type GradientKind = (typeof GRADIENT_KINDS)[number];

export const MEDIA_FITS = ['cover', 'contain', 'stretch'] as const;
export type MediaFit = (typeof MEDIA_FITS)[number];

/** Background types added by the Cover tool (v0.3). Never tone-mapped, never lit. */
export const GradientBackgroundSchema = z.object({
  type: z.literal('gradient'),
  kind: z.enum(GRADIENT_KINDS).default('linear'),
  /** Linear and radial colours. */
  stops: z
    .array(GradientStopSchema)
    .min(2)
    .max(MAX_GRADIENT_STOPS)
    .default([
      { color: '#ff5f3a', position: 0 },
      { color: '#3b1d8f', position: 1 },
    ]),
  /** Linear: direction in degrees, 0 = bottom → top, 90 = left → right (CSS convention). */
  angle: z.number().min(-360).max(360).default(180),
  /** Radial: centre. */
  center: FramePointSchema.default([0.5, 0.45]),
  /** Radial: radius as a fraction of the frame diagonal's half. */
  radius: z.number().min(0.01).max(4).default(1),
  /** Mesh: colour points blended smoothly across the frame. */
  points: z
    .array(MeshPointSchema)
    .min(2)
    .max(MAX_MESH_POINTS)
    .default([
      { color: '#ff7a59', position: [0.1, 0.1] },
      { color: '#ffd166', position: [0.9, 0.2] },
      { color: '#5b3cc4', position: [0.2, 0.9] },
      { color: '#16a5a1', position: [0.85, 0.85] },
    ]),
  /** Mesh: softness of the blend (higher = smoother, more uniform). */
  softness: z.number().min(0.1).max(4).default(1),
  /** Subtle dithering noise that hides banding, 0–1. */
  noise: unit().default(0.03),
});
export type GradientBackground = z.infer<typeof GradientBackgroundSchema>;

export const ImageBackgroundSchema = z.object({
  type: z.literal('image'),
  image: AssetUriSchema.nullable().default(null),
  fit: z.enum(MEDIA_FITS).default('cover'),
  /** Zoom on top of the fit. */
  scale: z.number().min(0.1).max(10).default(1),
  /** Pan, as a fraction of the frame. */
  offset: z.tuple([z.number().min(-2).max(2), z.number().min(-2).max(2)]).default([0, 0]),
  /** Fill around a `contain`ed image. */
  color: ColorSchema.default('#000000'),
  /** Brightness multiplier. */
  brightness: z.number().min(0).max(4).default(1),
});
export type ImageBackground = z.infer<typeof ImageBackgroundSchema>;

export const VideoBackgroundSchema = z.object({
  type: z.literal('video'),
  video: AssetUriSchema.nullable().default(null),
  fit: z.enum(MEDIA_FITS).default('cover'),
  scale: z.number().min(0.1).max(10).default(1),
  offset: z.tuple([z.number().min(-2).max(2), z.number().min(-2).max(2)]).default([0, 0]),
  color: ColorSchema.default('#000000'),
  brightness: z.number().min(0).max(4).default(1),
  /** Seconds into the clip at timeline 0. */
  startAt: z.number().min(0).max(36_000).default(0),
  /** Playback rate relative to the timeline. */
  speed: z.number().min(0.05).max(8).default(1),
  /** Loop the clip when the timeline is longer than it. */
  loop: z.boolean().default(true),
});
export type VideoBackground = z.infer<typeof VideoBackgroundSchema>;

/** 2D text drawn over the render (titles, captions, credits on a cover). */
export const OverlaySchema = z.object({
  id: z.string().min(1),
  name: z.string().default('Title'),
  visible: z.boolean().default(true),
  text: z.string().max(2000).default('Title'),
  font: FontRefSchema,
  /** Em size as a fraction of the frame height. */
  size: z.number().min(0.002).max(2).default(0.08),
  color: ColorSchema.default('#ffffff'),
  opacity: unit().default(1),
  /** Anchor point in the frame (see `align` for the horizontal anchor). */
  position: FramePointSchema.default([0.5, 0.12]),
  align: z.enum(['left', 'center', 'right']).default('center'),
  /** Extra space between letters, em. */
  letterSpacing: z.number().min(-0.5).max(2).default(0),
  /** Distance between baselines, em. */
  lineHeight: z.number().min(0.5).max(4).default(1.1),
  /** Degrees, clockwise. */
  rotation: z.number().min(-360).max(360).default(0),
  uppercase: z.boolean().default(false),
  /** Soft drop shadow for legibility over busy images. */
  shadow: unit().default(0),
});
export type Overlay = z.infer<typeof OverlaySchema>;

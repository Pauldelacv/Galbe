import { z } from 'zod';
import { ColorSchema } from './common.ts';

/**
 * Named easing curves. `hold` keeps the keyframe's value until the next one (step). A
 * 4-tuple is a CSS-style `cubic-bezier(x1, y1, x2, y2)`.
 */
export const EASING_NAMES = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutBack',
  'easeInOutBack',
  'easeOutElastic',
  'easeOutBounce',
  'hold',
] as const;
export type EasingName = (typeof EASING_NAMES)[number];

export const EasingSchema = z.union([
  z.enum(EASING_NAMES),
  z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]),
]);
export type Easing = z.infer<typeof EasingSchema>;

/** A keyframe value: a number or a `#rrggbb` colour (interpolated in sRGB, like CSS). */
export const KeyframeValueSchema = z.union([z.number(), ColorSchema]);
export type KeyframeValue = z.infer<typeof KeyframeValueSchema>;

export const KeyframeSchema = z.object({
  id: z.string().min(1),
  /** Seconds from the start of the timeline. */
  time: z.number().min(0).max(600),
  value: KeyframeValueSchema,
  /** Curve from this keyframe to the next one. */
  easing: EasingSchema.default('easeInOut'),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

/**
 * Keyframes on one property, addressed by a dot path from the document root where
 * collections are indexed by id: `nodes.<id>.transform.rotation.1`, `materials.<id>.color`,
 * `camera.fov`, `lights.<id>.intensity`, `effects.<id>.params.intensity`,
 * `overlays.<id>.opacity`, `background.angle`…
 */
export const TrackSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1).max(400),
  enabled: z.boolean().default(true),
  keyframes: z.array(KeyframeSchema).max(2000).default([]),
});
export type Track = z.infer<typeof TrackSchema>;

const timing = {
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Start time in seconds. */
  start: z.number().min(0).max(600).default(0),
  /** End time in seconds; `null` = end of the timeline. */
  end: z.number().min(0).max(600).nullable().default(null),
};

const AXIS = z.enum(['x', 'y', 'z']);

/** Per-letter (text) / per-path (shape) entrance or exit. */
export const REVEAL_STYLES = ['rise', 'drop', 'slide', 'scale', 'flip', 'spin'] as const;
export const REVEAL_ORDERS = ['forward', 'backward', 'center', 'edges', 'random'] as const;

/**
 * Preset motions applied on top of a node (or the camera). They are pure functions of
 * time: the same document and time always give the same frame. Repeating motions use
 * whole turns / cycles so they loop seamlessly over their span.
 */
export const MotionSchema = z.discriminatedUnion('type', [
  z.object({
    ...timing,
    type: z.literal('spin'),
    nodeId: z.string().min(1),
    axis: AXIS.default('y'),
    /** Whole turns over the span (negative = the other way). */
    turns: z.number().min(-100).max(100).default(1),
    easing: EasingSchema.default('linear'),
  }),
  z.object({
    ...timing,
    type: z.literal('float'),
    nodeId: z.string().min(1),
    /** Vertical travel, scene units. */
    amplitude: z.number().min(0).max(20).default(0.12),
    cycles: z.number().int().min(1).max(100).default(1),
    /** Gentle tilt that accompanies the float, degrees. */
    tilt: z.number().min(0).max(90).default(4),
  }),
  z.object({
    ...timing,
    type: z.literal('swing'),
    nodeId: z.string().min(1),
    axis: AXIS.default('y'),
    /** Peak angle, degrees. */
    angle: z.number().min(0).max(180).default(20),
    cycles: z.number().int().min(1).max(100).default(1),
  }),
  z.object({
    ...timing,
    type: z.literal('wave'),
    nodeId: z.string().min(1),
    /** Height of the wave running through the letters / parts, scene units. */
    amplitude: z.number().min(0).max(10).default(0.15),
    /** Letters per wavelength. */
    wavelength: z.number().min(1).max(100).default(6),
    cycles: z.number().int().min(1).max(100).default(1),
    /** Letters also turn with the wave, degrees. */
    rotate: z.number().min(0).max(90).default(0),
  }),
  z.object({
    ...timing,
    type: z.literal('reveal'),
    nodeId: z.string().min(1),
    style: z.enum(REVEAL_STYLES).default('rise'),
    order: z.enum(REVEAL_ORDERS).default('forward'),
    /** `in`: letters appear; `out`: they leave; `inOut`: appear, hold, leave. */
    mode: z.enum(['in', 'out', 'inOut']).default('in'),
    /** 0 = every letter at once, 1 = one after the other. */
    stagger: z.number().min(0).max(1).default(0.6),
    /** Travel of each letter, scene units (rise, drop, slide). */
    distance: z.number().min(0).max(20).default(0.6),
    easing: EasingSchema.default('easeOutBack'),
    seed: z.number().int().min(0).max(1_000_000).default(1),
  }),
  z.object({
    ...timing,
    type: z.literal('materialTransition'),
    nodeId: z.string().min(1),
    /** Material the node blends into. */
    toMaterialId: z.string().min(1),
    /** Back to the original material at the end (seamless loop). */
    pingPong: z.boolean().default(true),
    easing: EasingSchema.default('easeInOut'),
  }),
  z.object({
    ...timing,
    type: z.literal('orbit'),
    /** Degrees around the camera target's vertical axis. */
    angle: z.number().min(-3600).max(3600).default(360),
    pingPong: z.boolean().default(false),
    easing: EasingSchema.default('linear'),
  }),
  z.object({
    ...timing,
    type: z.literal('truck'),
    /** Sideways travel of camera and target, scene units. */
    distance: z.number().min(-100).max(100).default(1.5),
    pingPong: z.boolean().default(true),
    easing: EasingSchema.default('easeInOut'),
  }),
  z.object({
    ...timing,
    type: z.literal('dolly'),
    /** Travel towards the target, scene units (negative pulls back). */
    distance: z.number().min(-100).max(100).default(2),
    pingPong: z.boolean().default(true),
    easing: EasingSchema.default('easeInOut'),
  }),
]);
export type Motion = z.infer<typeof MotionSchema>;
export type MotionType = Motion['type'];
export type NodeMotion = Extract<Motion, { nodeId: string }>;
export type CameraMotion = Exclude<Motion, { nodeId: string }>;

export const NODE_MOTION_TYPES = [
  'spin',
  'float',
  'swing',
  'wave',
  'reveal',
  'materialTransition',
] as const satisfies readonly NodeMotion['type'][];
export const CAMERA_MOTION_TYPES = [
  'orbit',
  'truck',
  'dolly',
] as const satisfies readonly CameraMotion['type'][];

export const isCameraMotion = (motion: Motion): motion is CameraMotion => !('nodeId' in motion);

export const FPS_OPTIONS = [24, 25, 30, 50, 60] as const;

export const AnimationSchema = z.object({
  /** Seconds. */
  duration: z.number().min(0.1).max(600).default(4),
  fps: z.number().int().min(1).max(120).default(30),
  /** Playback wraps around; seamless loops end where they start. */
  loop: z.boolean().default(true),
  tracks: z.array(TrackSchema).max(2000).default([]),
  motions: z.array(MotionSchema).max(500).default([]),
});
export type Animation = z.infer<typeof AnimationSchema>;

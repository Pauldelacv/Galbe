import type {
  Animation,
  CameraMotion,
  Easing,
  Keyframe,
  KeyframeValue,
  Motion,
  NodeMotion,
  Track,
} from '../schema/animation.ts';
import type { Camera, GalbeDocument } from '../schema/document.ts';
import type { MaterialSpec } from '../schema/material.ts';
import { nodeMaterialIds, type SceneNode } from '../schema/nodes.ts';
import { ease, pingPong } from './easing.ts';
import { getPath, PathWriter, splitPath } from './paths.ts';

type Vec3 = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/i;
export const isColorValue = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value);

/** Fields that only take whole numbers; animated values are rounded. */
const INTEGER_FIELDS = new Set([
  'segments',
  'curveSegments',
  'detail',
  'octaves',
  'seed',
  'resolution',
  'turns',
  'cycles',
]);

function hexToRgb(hex: string): Vec3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: Vec3): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Interpolates two keyframe values (colours channel by channel, in sRGB like CSS). */
export function mixValues(a: KeyframeValue, b: KeyframeValue, f: number): KeyframeValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * f;
  if (isColorValue(a) && isColorValue(b)) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return rgbToHex([
      ca[0] + (cb[0] - ca[0]) * f,
      ca[1] + (cb[1] - ca[1]) * f,
      ca[2] + (cb[2] - ca[2]) * f,
    ]);
  }
  return f < 0.5 ? a : b;
}

/** Keyframes sorted by time (tracks are usually kept sorted; this is defensive). */
const sorted = (keyframes: readonly Keyframe[]): readonly Keyframe[] => {
  for (let i = 1; i < keyframes.length; i++)
    if (keyframes[i]!.time < keyframes[i - 1]!.time)
      return [...keyframes].sort((a, b) => a.time - b.time);
  return keyframes;
};

/** The value of a track at time `t` (held before the first and after the last key). */
export function sampleTrack(track: Pick<Track, 'keyframes'>, t: number): KeyframeValue | undefined {
  const keys = sorted(track.keyframes);
  const first = keys[0];
  if (!first) return undefined;
  if (t <= first.time) return first.value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t < b.time) {
      const span = b.time - a.time;
      const f = span > 0 ? ease(a.easing, (t - a.time) / span) : 1;
      return mixValues(a.value, b.value, f);
    }
  }
  return keys.at(-1)!.value;
}

/** Progress of a motion at time `t`, in [0, 1]. */
export function motionProgress(motion: Motion, t: number, duration: number): number {
  const end = motion.end ?? duration;
  const span = end - motion.start;
  if (span <= 0) return t >= motion.start ? 1 : 0;
  return Math.min(1, Math.max(0, (t - motion.start) / span));
}

/** Per-letter / per-part motion active on a node at the evaluated time. */
export interface PartMotion {
  motion: Extract<NodeMotion, { type: 'wave' | 'reveal' }>;
  progress: number;
}

export interface PartTransform {
  offset: Vec3;
  /** Degrees, XYZ. */
  rotation: Vec3;
  scale: number;
}

export interface EvaluatedScene {
  /** The document with every animated value applied (shares unchanged parts). */
  doc: GalbeDocument;
  /** Per-letter motions by node id (text glyphs, shape paths). */
  parts: Record<string, PartMotion[]>;
  time: number;
}

/** Whether the document has anything that changes over time. */
export function isAnimated(doc: Pick<GalbeDocument, 'animation' | 'background'>): boolean {
  const { tracks, motions } = doc.animation;
  return (
    tracks.some((track) => track.enabled && track.keyframes.length > 1) ||
    motions.some((motion) => motion.enabled) ||
    doc.background.type === 'video'
  );
}

/** Snaps a time to the nearest frame of the timeline. */
export const snapTime = (t: number, fps: number): number => Math.round(t * fps) / fps;

export const frameCount = (animation: Pick<Animation, 'duration' | 'fps'>): number =>
  Math.max(1, Math.round(animation.duration * animation.fps));

const AXES = { x: 0, y: 1, z: 2 } as const;

function addToVec(writer: PathWriter<GalbeDocument>, path: string, delta: Vec3): void {
  const current = writer.get(path);
  if (!Array.isArray(current)) return;
  writer.set(path, [
    Number(current[0]) + delta[0],
    Number(current[1]) + delta[1],
    Number(current[2]) + delta[2],
  ]);
}

/** Blends two material specs: numbers and colours interpolate, everything else switches. */
export function blendMaterials(
  a: MaterialSpec,
  b: MaterialSpec,
  f: number,
  id: string,
): MaterialSpec {
  if (a.type !== b.type) return { ...(f < 0.5 ? a : b), id };
  const mix = (x: unknown, y: unknown): unknown => {
    if (typeof x === 'number' && typeof y === 'number') return x + (y - x) * f;
    if (isColorValue(x) && isColorValue(y)) return mixValues(x, y, f);
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length)
      return x.map((v, i) => mix(v, y[i]));
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(x))
        out[key] =
          key in y
            ? mix((x as Record<string, unknown>)[key], (y as Record<string, unknown>)[key])
            : (x as Record<string, unknown>)[key];
      return out;
    }
    return f < 0.5 ? x : y;
  };
  return { ...(mix(a, b) as MaterialSpec), id, name: a.name };
}

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** How far a camera motion has moved at progress `p` (eased, ping-ponged). */
function cameraAmount(motion: CameraMotion, p: number): number {
  const x = motion.pingPong ? pingPong(p) : p;
  return ease(motion.easing, x);
}

/**
 * Applies a camera motion. `direction` = -1 applies the inverse, which lets an editor turn
 * the camera it shows at time t back into the base camera.
 */
export function applyCameraMotion(
  camera: Camera,
  motion: CameraMotion,
  amount: number,
  direction: 1 | -1 = 1,
): Camera {
  const position: Vec3 = [...camera.position];
  const target: Vec3 = [...camera.target];
  if (motion.type === 'orbit') {
    const angle = ((motion.angle * amount * Math.PI) / 180) * direction;
    const dx = position[0] - target[0];
    const dz = position[2] - target[2];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    position[0] = target[0] + dx * c + dz * s;
    position[2] = target[2] - dx * s + dz * c;
  } else {
    const forward = normalize([
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ]);
    if (motion.type === 'truck') {
      // right = forward × up
      const right = normalize([-forward[2], 0, forward[0]]);
      const d = motion.distance * amount * direction;
      for (let i = 0; i < 3; i++) {
        position[i]! += right[i]! * d;
        target[i]! += right[i]! * d;
      }
    } else {
      const distance = Math.hypot(
        target[0] - position[0],
        target[1] - position[1],
        target[2] - position[2],
      );
      let d = motion.distance * amount;
      // Never pass through the target.
      d = Math.min(d, distance - 0.05);
      if (direction === -1) d = -motion.distance * amount;
      for (let i = 0; i < 3; i++) position[i]! += forward[i]! * d;
    }
  }
  return { ...camera, position, target };
}

/** Inverse of the camera motions at time t: the base camera that produces `shown`. */
export function baseCameraFor(doc: GalbeDocument, shown: Camera, t: number): Camera {
  let camera = shown;
  const motions = doc.animation.motions.filter(
    (m): m is CameraMotion => m.enabled && !('nodeId' in m),
  );
  for (const motion of [...motions].reverse()) {
    const amount = cameraAmount(motion, motionProgress(motion, t, doc.animation.duration));
    camera = applyCameraMotion(camera, motion, amount, -1);
  }
  return camera;
}

function applyNodeMotion(
  writer: PathWriter<GalbeDocument>,
  doc: GalbeDocument,
  motion: NodeMotion,
  p: number,
  parts: Record<string, PartMotion[]>,
): void {
  const node = writer.get(['nodes', motion.nodeId]) as SceneNode | undefined;
  if (!node) return;
  const base = `nodes.${motion.nodeId}.transform`;
  const tau = Math.PI * 2;
  switch (motion.type) {
    case 'spin': {
      const delta: Vec3 = [0, 0, 0];
      delta[AXES[motion.axis]] = 360 * motion.turns * ease(motion.easing, p);
      addToVec(writer, `${base}.rotation`, delta);
      break;
    }
    case 'float': {
      const phase = tau * motion.cycles * p;
      addToVec(writer, `${base}.position`, [0, motion.amplitude * Math.sin(phase), 0]);
      addToVec(writer, `${base}.rotation`, [
        motion.tilt * Math.sin(phase + Math.PI / 2) * 0.5,
        0,
        motion.tilt * Math.sin(phase),
      ]);
      break;
    }
    case 'swing': {
      const delta: Vec3 = [0, 0, 0];
      delta[AXES[motion.axis]] = motion.angle * Math.sin(tau * motion.cycles * p);
      addToVec(writer, `${base}.rotation`, delta);
      break;
    }
    case 'wave':
    case 'reveal': {
      if (node.type === 'text' || node.type === 'shape') {
        const list = parts[motion.nodeId] ?? [];
        list.push({ motion, progress: p });
        parts[motion.nodeId] = list;
      } else {
        // Single-part nodes move as one piece.
        const transform = partTransform([{ motion, progress: p }], 0, 1);
        addToVec(writer, `${base}.position`, transform.offset);
        addToVec(writer, `${base}.rotation`, transform.rotation);
        const scale = writer.get(`${base}.scale`);
        if (Array.isArray(scale))
          writer.set(
            `${base}.scale`,
            scale.map((v) => Number(v) * transform.scale),
          );
      }
      break;
    }
    case 'materialTransition': {
      const to = doc.materials[motion.toMaterialId];
      if (!to) break;
      const f = ease(motion.easing, motion.pingPong ? pingPong(p) : p);
      if (f <= 0) break;
      for (const sourceId of nodeMaterialIds(node)) {
        const from = writer.get(['materials', sourceId]) as MaterialSpec | undefined;
        if (!from) continue;
        const id = `__motion_${motion.id}_${sourceId}`;
        const blended = f >= 1 ? { ...to, id } : blendMaterials(from, to, f, id);
        const materials = writer.get('materials') as Record<string, MaterialSpec>;
        // Add the synthetic material (PathWriter only overwrites existing keys).
        writer.set('materials', { ...materials, [id]: blended });
        if ('materialId' in node && node.materialId === sourceId)
          writer.set(`nodes.${node.id}.materialId`, id);
        if (node.type === 'shape') {
          for (const path of node.paths)
            if (path.materialId === sourceId)
              writer.set(`nodes.${node.id}.paths.${path.id}.materialId`, id);
        }
      }
      break;
    }
  }
}

/**
 * Evaluates the scene at time `t` (seconds): keyframe tracks first, then preset motions on
 * top. A pure function of `(doc, t)`: playback and video export call it with the same
 * inputs and get the same frame, whatever the machine's speed.
 */
export function evaluateScene(doc: GalbeDocument, t: number): EvaluatedScene {
  const parts: Record<string, PartMotion[]> = {};
  const { tracks, motions, duration } = doc.animation;
  if (!tracks.length && !motions.length) return { doc, parts, time: t };
  const writer = new PathWriter(doc);

  for (const track of tracks) {
    if (!track.enabled || !track.keyframes.length) continue;
    const segments = splitPath(track.path);
    const current = getPath(doc, segments);
    let value = sampleTrack(track, t);
    if (value === undefined) continue;
    if (typeof current === 'number' && typeof value === 'number') {
      if (INTEGER_FIELDS.has(segments.at(-1)!)) value = Math.round(value);
      writer.set(segments, value);
    } else if (isColorValue(current) && isColorValue(value)) writer.set(segments, value);
  }

  for (const motion of motions) {
    if (!motion.enabled) continue;
    const p = motionProgress(motion, t, duration);
    if ('nodeId' in motion) applyNodeMotion(writer, doc, motion, p, parts);
    else {
      const camera = writer.get('camera') as Camera;
      writer.set('camera', applyCameraMotion(camera, motion, cameraAmount(motion, p)));
    }
  }
  return { doc: writer.value, parts, time: t };
}

/** Deterministic pseudo-random permutation of `0…count-1`. */
export function seededOrder(count: number, seed: number): number[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** Rank of part `index` in a reveal order, in [0, count-1]. */
function revealRank(
  order: typeof import('../schema/animation.ts').REVEAL_ORDERS[number],
  index: number,
  count: number,
  seed: number,
): number {
  switch (order) {
    case 'forward':
      return index;
    case 'backward':
      return count - 1 - index;
    case 'center':
      return Math.abs(index - (count - 1) / 2) * 2;
    case 'edges':
      return count - 1 - Math.abs(index - (count - 1) / 2) * 2;
    case 'random':
      return seededOrder(count, seed).indexOf(index);
  }
}

/** How hidden a part is during a reveal: 1 = fully hidden, 0 = at rest (may overshoot). */
export function revealAmount(
  motion: Extract<NodeMotion, { type: 'reveal' }>,
  progress: number,
  index: number,
  count: number,
): number {
  const local = (p: number, easing: Easing) => {
    const rank = revealRank(motion.order, index, count, motion.seed);
    const window = 1 / (1 + motion.stagger * Math.max(0, count - 1));
    const start = rank * motion.stagger * window;
    return ease(easing, (p - start) / window);
  };
  if (motion.mode === 'in') return 1 - local(progress, motion.easing);
  if (motion.mode === 'out') return local(progress, invertEasing(motion.easing));
  // In-out: appear over the first 40 %, hold, leave over the last 40 %.
  if (progress < 0.5) return 1 - local(Math.min(1, progress / 0.4), motion.easing);
  return local(Math.max(0, (progress - 0.6) / 0.4), invertEasing(motion.easing));
}

/** Leaving uses the mirrored curve so an overshooting entrance gets an anticipating exit. */
function invertEasing(easing: Easing): Easing {
  if (Array.isArray(easing)) return [1 - easing[2], 1 - easing[3], 1 - easing[0], 1 - easing[1]];
  const mirror: Partial<Record<string, Easing>> = {
    easeIn: 'easeOut',
    easeOut: 'easeIn',
    easeOutCubic: 'easeInCubic',
    easeInCubic: 'easeOutCubic',
    easeOutBack: [0.6, -0.28, 0.735, 0.045],
    easeOutElastic: 'easeInCubic',
    easeOutBounce: 'easeInCubic',
  };
  return mirror[easing as string] ?? easing;
}

/**
 * Transform of one letter (or shape path) under the node's per-part motions, relative to
 * the part's own centre. Pure, so engine and tests agree.
 */
export function partTransform(
  motions: readonly PartMotion[],
  index: number,
  count: number,
): PartTransform {
  const offset: Vec3 = [0, 0, 0];
  const rotation: Vec3 = [0, 0, 0];
  let scale = 1;
  for (const { motion, progress } of motions) {
    if (motion.type === 'wave') {
      const phase = Math.PI * 2 * (motion.cycles * progress - index / motion.wavelength);
      offset[1] += motion.amplitude * Math.sin(phase);
      rotation[2] += motion.rotate * Math.cos(phase);
    } else {
      const a = revealAmount(motion, progress, index, count);
      const d = motion.distance * a;
      switch (motion.style) {
        case 'rise':
          offset[1] -= d;
          break;
        case 'drop':
          offset[1] += d;
          break;
        case 'slide':
          offset[0] -= d;
          break;
        case 'flip':
          rotation[0] += 90 * a;
          break;
        case 'spin':
          rotation[1] += 180 * a;
          break;
        case 'scale':
          break;
      }
      scale *= Math.max(0, 1 - a);
    }
  }
  return { offset, rotation, scale };
}

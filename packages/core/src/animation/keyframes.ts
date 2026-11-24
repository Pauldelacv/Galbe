import { createId } from '../ids.ts';
import type { Animation, Easing, KeyframeValue, Motion, Track } from '../schema/animation.ts';
import type { GalbeDocument } from '../schema/document.ts';
import { isColorValue, sampleTrack } from './evaluate.ts';
import { getPath } from './paths.ts';

/** Two keyframes closer than this (seconds) are the same keyframe. */
export const KEY_EPSILON = 1e-4;

/** Document roots whose numeric and colour values can be animated. */
export const ANIMATABLE_ROOTS = [
  'nodes',
  'materials',
  'camera',
  'environment',
  'ground',
  'lights',
  'render',
  'effects',
  'background',
  'overlays',
] as const;

/** Fields that are never animated (identity, structure, imported data). */
const STATIC_FIELDS = new Set(['id', 'schemaVersion', 'near', 'far', 'viewBox', 'resolution']);

export interface ValueChange {
  path: string;
  before: KeyframeValue;
  after: KeyframeValue;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isAnimatableValue = (value: unknown): value is KeyframeValue =>
  (typeof value === 'number' && Number.isFinite(value)) || isColorValue(value);

function diffInto(a: unknown, b: unknown, path: string[], out: ValueChange[]): void {
  if (a === b) return;
  if (isAnimatableValue(a) && isAnimatableValue(b)) {
    if (typeof a === typeof b) out.push({ path: path.join('.'), before: a, after: b });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const identified = isObject(a[0]) && typeof a[0].id === 'string';
    if (identified) {
      const byId = new Map(b.filter(isObject).map((item) => [item.id as string, item]));
      for (const item of a) {
        if (!isObject(item)) continue;
        const other = byId.get(item.id as string);
        if (other) diffInto(item, other, [...path, item.id as string], out);
      }
    } else if (a.length === b.length) {
      for (let i = 0; i < a.length; i++) diffInto(a[i], b[i], [...path, String(i)], out);
    }
    return;
  }
  if (isObject(a) && isObject(b)) {
    // A union member switch (e.g. background type) is a structural change, not a value.
    if ('type' in a && a.type !== b.type) return;
    for (const key of Object.keys(a)) {
      if (STATIC_FIELDS.has(key) || !(key in b)) continue;
      diffInto(a[key], b[key], [...path, key], out);
    }
  }
}

/** Every animatable value that differs between two versions of a document. */
export function diffAnimatable(before: GalbeDocument, after: GalbeDocument): ValueChange[] {
  const out: ValueChange[] = [];
  for (const root of ANIMATABLE_ROOTS) diffInto(before[root], after[root], [root], out);
  return out;
}

export const findTrack = (animation: Animation, path: string): Track | undefined =>
  animation.tracks.find((track) => track.path === path);

/**
 * Inserts or updates a keyframe (mutates `animation`, e.g. an Immer draft). Creates the
 * track when needed. Returns the keyframe id.
 */
export function setKeyframe(
  animation: Animation,
  path: string,
  time: number,
  value: KeyframeValue,
  easing: Easing = 'easeInOut',
): string {
  let track = findTrack(animation, path);
  if (!track) {
    track = { id: createId(), path, enabled: true, keyframes: [] };
    animation.tracks.push(track);
    track = animation.tracks.at(-1)!;
  }
  const existing = track.keyframes.find((key) => Math.abs(key.time - time) < KEY_EPSILON);
  if (existing) {
    existing.value = value;
    return existing.id;
  }
  const id = createId();
  const index = track.keyframes.findIndex((key) => key.time > time);
  const keyframe = { id, time, value, easing };
  if (index < 0) track.keyframes.push(keyframe);
  else track.keyframes.splice(index, 0, keyframe);
  return id;
}

/**
 * Turns edits into keyframes at `time`. A property that already has a track always gets a
 * key (its base value is overridden anyway); with `autoKey`, untracked properties get a
 * track too, keyed at 0 with the previous value when `time` > 0, so the edit animates.
 * Mutates `animation`. Returns the number of keys written.
 */
export function keyChanges(
  animation: Animation,
  changes: readonly ValueChange[],
  time: number,
  autoKey: boolean,
): number {
  let written = 0;
  for (const change of changes) {
    const track = findTrack(animation, change.path);
    if (!track && !autoKey) continue;
    if (!track && time > KEY_EPSILON) setKeyframe(animation, change.path, 0, change.before);
    setKeyframe(animation, change.path, time, change.after);
    written++;
  }
  return written;
}

/** Writes each tracked value at time `t` into the document (mutates a draft). */
export function bakeTrackedValues(
  doc: GalbeDocument,
  t: number,
  set: (path: string, value: KeyframeValue) => void,
): void {
  for (const track of doc.animation.tracks) {
    if (!track.enabled || !track.keyframes.length) continue;
    const current = getPath(doc, track.path);
    const value = sampleTrack(track, t);
    if (value === undefined || value === current) continue;
    if (typeof current === 'number' && typeof value === 'number') {
      if (Math.abs(current - value) > 1e-9) set(track.path, value);
    } else if (isColorValue(current) && isColorValue(value)) set(track.path, value);
  }
}

export function removeKeyframes(animation: Animation, ids: Iterable<string>): void {
  const remove = new Set(ids);
  for (const track of animation.tracks)
    track.keyframes = track.keyframes.filter((key) => !remove.has(key.id));
  animation.tracks = animation.tracks.filter((track) => track.keyframes.length > 0);
}

/** Moves keyframes by `delta` seconds (clamped to the timeline), keeping tracks sorted. */
export function shiftKeyframes(
  animation: Animation,
  ids: Iterable<string>,
  delta: number,
  fps: number,
): void {
  const move = new Set(ids);
  for (const track of animation.tracks) {
    let changed = false;
    for (const key of track.keyframes) {
      if (!move.has(key.id)) continue;
      key.time = Math.max(
        0,
        Math.min(animation.duration, Math.round((key.time + delta) * fps) / fps),
      );
      changed = true;
    }
    if (!changed) continue;
    track.keyframes.sort((a, b) => a.time - b.time);
    // Two keys on the same frame: the moved one wins.
    track.keyframes = track.keyframes.filter(
      (key, i, all) =>
        !all.some(
          (other, j) =>
            j !== i &&
            Math.abs(other.time - key.time) < KEY_EPSILON &&
            move.has(other.id) &&
            !move.has(key.id),
        ),
    );
  }
}

/** Drops tracks and motions that point at nodes, materials, lights… that no longer exist. */
export function pruneAnimation(doc: GalbeDocument): void {
  const nodeIds = new Set(doc.nodes.map((node) => node.id));
  doc.animation.tracks = doc.animation.tracks.filter(
    (track) => getPath(doc, track.path) !== undefined,
  );
  doc.animation.motions = doc.animation.motions.filter(
    (motion) =>
      !('nodeId' in motion) ||
      (nodeIds.has(motion.nodeId) &&
        (motion.type !== 'materialTransition' || motion.toMaterialId in doc.materials)),
  );
}

/** Copies the tracks and motions of `fromId` onto `toId` (node duplication). */
export function copyNodeAnimation(doc: GalbeDocument, fromId: string, toId: string): void {
  const prefix = `nodes.${fromId}.`;
  for (const track of [...doc.animation.tracks]) {
    if (!track.path.startsWith(prefix)) continue;
    doc.animation.tracks.push({
      ...track,
      id: createId(),
      path: `nodes.${toId}.${track.path.slice(prefix.length)}`,
      keyframes: track.keyframes.map((key) => ({ ...key, id: createId() })),
    });
  }
  for (const motion of [...doc.animation.motions]) {
    if ('nodeId' in motion && motion.nodeId === fromId)
      doc.animation.motions.push({ ...motion, id: createId(), nodeId: toId } as Motion);
  }
}

/** Makes a track loop: its last key (at the end of the timeline) repeats the first value. */
export function closeLoop(animation: Animation, trackId: string): void {
  const track = animation.tracks.find((candidate) => candidate.id === trackId);
  const first = track?.keyframes[0];
  if (!track || !first) return;
  setKeyframe(animation, track.path, animation.duration, first.value, first.easing);
}

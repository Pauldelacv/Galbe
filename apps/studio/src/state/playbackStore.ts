import {
  bakeTrackedValues,
  frameCount,
  isAnimated,
  removeKeyframes,
  setPath,
  snapTime,
} from '@galbe/core';
import { create } from 'zustand';
import { setKeyer, useDocumentStore } from './documentStore.ts';

export interface PlaybackState {
  /** Playhead, seconds. */
  time: number;
  playing: boolean;
  /** Edits of untracked properties create keyframes at the playhead. */
  autoKey: boolean;
  /** Bottom timeline panel. */
  timelineOpen: boolean;
  /** Selected keyframe ids (timeline). */
  selectedKeys: string[];

  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Moves the playhead (snapped to frames) and pauses. */
  seek: (time: number) => void;
  step: (frames: number) => void;
  setAutoKey: (on: boolean) => void;
  toggleTimeline: () => void;
  selectKeys: (ids: string[], mode?: 'replace' | 'toggle') => void;
}

let frameRequest = 0;
let lastTick = 0;

const animation = () => useDocumentStore.getState().doc.animation;

function tick(now: number): void {
  const state = usePlaybackStore.getState();
  if (!state.playing) return;
  const { duration, loop } = animation();
  const dt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;
  let time = state.time + dt;
  if (time >= duration) {
    if (loop) time %= duration;
    else {
      usePlaybackStore.setState({ time: duration, playing: false });
      return;
    }
  }
  usePlaybackStore.setState({ time });
  frameRequest = requestAnimationFrame(tick);
}

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  time: 0,
  playing: false,
  autoKey: false,
  timelineOpen: false,
  selectedKeys: [],

  play: () => {
    if (get().playing) return;
    const { duration } = animation();
    const time = get().time >= duration - 1e-6 ? 0 : get().time;
    lastTick = performance.now();
    set({ playing: true, time });
    globalThis.cancelAnimationFrame?.(frameRequest);
    frameRequest = requestAnimationFrame(tick);
  },
  pause: () => {
    globalThis.cancelAnimationFrame?.(frameRequest);
    const { fps } = animation();
    set({ playing: false, time: snapTime(get().time, fps) });
  },
  toggle: () => (get().playing ? get().pause() : get().play()),
  seek: (time) => {
    globalThis.cancelAnimationFrame?.(frameRequest);
    const { fps, duration } = animation();
    set({ playing: false, time: Math.max(0, Math.min(duration, snapTime(time, fps))) });
  },
  step: (frames) => {
    const { fps, duration } = animation();
    const count = frameCount(animation());
    const current = Math.round(get().time * fps);
    const next = Math.max(0, Math.min(count, current + frames));
    get().seek(Math.min(duration, next / fps));
  },
  setAutoKey: (autoKey) => set({ autoKey }),
  toggleTimeline: () => set((state) => ({ timelineOpen: !state.timelineOpen })),
  selectKeys: (ids, mode = 'replace') =>
    set((state) => {
      if (mode === 'replace') return { selectedKeys: ids };
      const next = new Set(state.selectedKeys);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { selectedKeys: [...next] };
    }),
}));

/** The playhead snapped to a frame, where edits are keyed. */
export const keyTime = (): number => snapTime(usePlaybackStore.getState().time, animation().fps);

/**
 * Writes the values of animated properties at the playhead into the document, so the
 * inspector shows (and edits) what the viewport shows. Not an undo step, never keyed.
 */
export function bakePlayhead(): void {
  const { doc, update } = useDocumentStore.getState();
  if (!doc.animation.tracks.length || usePlaybackStore.getState().playing) return;
  const time = usePlaybackStore.getState().time;
  const writes: [string, unknown][] = [];
  bakeTrackedValues(doc, time, (path, value) => writes.push([path, value]));
  if (!writes.length) return;
  update(
    (draft) => {
      for (const [path, value] of writes) setPath(draft, path, value);
    },
    { history: false, animate: false },
  );
}

export function deleteSelectedKeys(): boolean {
  const ids = usePlaybackStore.getState().selectedKeys;
  if (!ids.length) return false;
  useDocumentStore.getState().update(
    (draft) => {
      removeKeyframes(draft.animation, ids);
    },
    { label: ids.length > 1 ? 'Delete keyframes' : 'Delete keyframe', animate: false },
  );
  usePlaybackStore.setState({ selectedKeys: [] });
  return true;
}

export const documentIsAnimated = (): boolean => isAnimated(useDocumentStore.getState().doc);

// Keep the inspector in step with the playhead: after seeking, pausing, undo, load…
let bakeQueued = false;
const queueBake = () => {
  if (bakeQueued) return;
  bakeQueued = true;
  queueMicrotask(() => {
    bakeQueued = false;
    bakePlayhead();
  });
};
usePlaybackStore.subscribe((state, previous) => {
  if (!state.playing && (state.time !== previous.time || previous.playing)) queueBake();
});
useDocumentStore.subscribe((state, previous) => {
  if (state.doc !== previous.doc) queueBake();
  // Keep the playhead inside the timeline when its duration shrinks.
  const { duration } = state.doc.animation;
  if (usePlaybackStore.getState().time > duration) usePlaybackStore.setState({ time: duration });
  // Forget selected keys that no longer exist.
  const selected = usePlaybackStore.getState().selectedKeys;
  if (selected.length && state.doc.animation !== previous.doc.animation) {
    const ids = new Set(state.doc.animation.tracks.flatMap((t) => t.keyframes.map((k) => k.id)));
    const kept = selected.filter((id) => ids.has(id));
    if (kept.length !== selected.length) usePlaybackStore.setState({ selectedKeys: kept });
  }
});

setKeyer({
  time: keyTime,
  autoKey: () => usePlaybackStore.getState().autoKey,
});

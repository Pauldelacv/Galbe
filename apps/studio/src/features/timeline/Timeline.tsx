import {
  closeLoop,
  describePath,
  EASING_LABELS,
  EASING_NAMES,
  type Easing,
  FPS_OPTIONS,
  findNode,
  type GalbeDocument,
  type Motion,
  sampleTrack,
  setKeyframe,
  shiftKeyframes,
  type Track,
} from '@galbe/core';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Trash2,
  X,
} from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { usePlaybackStore } from '../../state/playbackStore.ts';
import { gesture, useUiStore } from '../../state/uiStore.ts';
import { IconButton, Select, Toggle } from '../../ui/controls.tsx';
import { NumberField } from '../inspector/fields.tsx';
import { MOTION_LABELS, motionTargetName } from '../motion/motionInfo.ts';
import styles from './Timeline.module.css';

/** `mm:ss.ff` (frames), the way motion tools show time. */
export function formatTimecode(time: number, fps: number): string {
  const totalFrames = Math.round(time * fps);
  const frames = totalFrames % fps;
  const seconds = Math.floor(totalFrames / fps);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
}

/** Ruler ticks: a step that keeps labels ~70 px apart. */
function rulerStep(duration: number, width: number): number {
  const target = (duration * 70) / Math.max(width, 1);
  for (const step of [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120])
    if (step >= target) return step;
  return 300;
}

interface TrackGroup {
  key: string;
  owner: string;
  tracks: { track: Track; property: string }[];
}

function groupTracks(doc: GalbeDocument): TrackGroup[] {
  const groups = new Map<string, TrackGroup>();
  for (const track of doc.animation.tracks) {
    const { owner, property, group } = describePath(doc, track.path);
    let entry = groups.get(group);
    if (!entry) {
      entry = { key: group, owner, tracks: [] };
      groups.set(group, entry);
    }
    entry.tracks.push({ track, property });
  }
  return [...groups.values()];
}

const updateAnimation = (label: string, recipe: (doc: GalbeDocument) => void, coalesce?: string) =>
  documentApi.update(recipe, { label, animate: false, ...(coalesce ? { coalesce } : {}) });

export function Timeline() {
  const doc = useDocumentStore((state) => state.doc);
  const { duration, fps, loop, motions } = doc.animation;
  const time = usePlaybackStore((state) => state.time);
  const playing = usePlaybackStore((state) => state.playing);
  const autoKey = usePlaybackStore((state) => state.autoKey);
  const selectedKeys = usePlaybackStore((state) => state.selectedKeys);
  const playback = usePlaybackStore.getState();
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(600);
  const groups = useMemo(() => groupTracks(doc), [doc]);

  useLayoutEffect(() => {
    const element = laneRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setLaneWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const x = (t: number) => (t / duration) * laneWidth;
  const timeAt = (clientX: number) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  const scrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    playback.seek(timeAt(event.clientX));
    const move = (e: PointerEvent) => playback.seek(timeAt(e.clientX));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const dragKeys = (event: ReactPointerEvent, keyId: string) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const selected = usePlaybackStore.getState().selectedKeys;
    if (event.shiftKey) {
      playback.selectKeys([keyId], 'toggle');
      return;
    }
    const ids = selected.includes(keyId) ? selected : [keyId];
    if (!selected.includes(keyId)) playback.selectKeys(ids);
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    let applied = 0;
    let began = false;
    const move = (e: PointerEvent) => {
      const delta = Math.round(((e.clientX - startX) / laneWidth) * duration * fps) / fps;
      if (delta === applied) return;
      if (!began) {
        gesture.begin('Move keyframes');
        began = true;
      }
      const step = delta - applied;
      applied = delta;
      documentApi.update(
        (draft) => {
          shiftKeyframes(draft.animation, ids, step, fps);
        },
        { label: 'Move keyframes', animate: false },
      );
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      if (began) gesture.end();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const selectedEasing = useMemo(() => {
    const keys = doc.animation.tracks
      .flatMap((t) => t.keyframes)
      .filter((k) => selectedKeys.includes(k.id));
    const first = keys[0]?.easing;
    if (!first) return null;
    const same = keys.every((k) => JSON.stringify(k.easing) === JSON.stringify(first));
    return same && typeof first === 'string' ? first : 'mixed';
  }, [doc, selectedKeys]);

  const step = rulerStep(duration, laneWidth);
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(Number(t.toFixed(4)));
  const empty = !groups.length && !motions.length;

  return (
    <section className={styles.timeline} aria-label="Timeline" data-testid="timeline">
      <div className={styles.header}>
        <div className={styles.transport}>
          <IconButton label="Go to start (Home)" size="sm" onClick={() => playback.seek(0)}>
            <SkipBack />
          </IconButton>
          <IconButton label="Previous frame (,)" size="sm" onClick={() => playback.step(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label={playing ? 'Pause (Space)' : 'Play (Space)'}
            active={playing}
            onClick={() => playback.toggle()}
            data-testid="play"
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <IconButton label="Next frame (.)" size="sm" onClick={() => playback.step(1)}>
            <ChevronRight />
          </IconButton>
          <span className={styles.timecode} data-testid="timecode">
            {formatTimecode(time, fps)}
            <span> / {formatTimecode(duration, fps)}</span>
          </span>
        </div>
        <div className={styles.settings}>
          <button
            type="button"
            className={styles.record}
            data-active={autoKey || undefined}
            aria-pressed={autoKey}
            title="Auto-key (K): edits create keyframes at the playhead"
            onClick={() => playback.setAutoKey(!autoKey)}
            data-testid="autokey"
          >
            <Circle />
            Auto-key
          </button>
          {selectedEasing && (
            <Select
              label="Keyframe easing"
              className={styles.easing}
              value={selectedEasing}
              onChange={(event) => {
                const easing = event.target.value as Easing;
                updateAnimation('Keyframe easing', (draft) => {
                  for (const track of draft.animation.tracks)
                    for (const key of track.keyframes)
                      if (selectedKeys.includes(key.id)) key.easing = easing;
                });
              }}
            >
              {selectedEasing === 'mixed' && <option value="mixed">Mixed</option>}
              {EASING_NAMES.map((name) => (
                <option key={name} value={name}>
                  {EASING_LABELS[name]}
                </option>
              ))}
            </Select>
          )}
          <div className={styles.duration}>
            <NumberField
              label="Duration"
              value={duration}
              min={0.1}
              max={600}
              softMin={1}
              softMax={30}
              step={0.1}
              unit="s"
              defaultValue={4}
              onChange={(value) =>
                updateAnimation(
                  'Duration',
                  (draft) => {
                    draft.animation.duration = Math.round(value * fps) / fps || 1 / fps;
                  },
                  'timeline:duration',
                )
              }
            />
          </div>
          <Select
            label="Frame rate"
            value={String(fps)}
            onChange={(event) =>
              updateAnimation('Frame rate', (draft) => {
                draft.animation.fps = Number(event.target.value);
              })
            }
          >
            {FPS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} fps
              </option>
            ))}
          </Select>
          <Toggle
            label="Loop"
            checked={loop}
            onChange={(value) =>
              updateAnimation('Loop', (draft) => {
                draft.animation.loop = value;
              })
            }
          />
          <IconButton
            label="Close timeline (L)"
            size="sm"
            onClick={() => playback.toggleTimeline()}
          >
            <X />
          </IconButton>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.labels}>
          <div className={styles.rulerLabel} />
          {motions.map((motion) => (
            <MotionLabel key={motion.id} doc={doc} motion={motion} />
          ))}
          {groups.map((group) => (
            <div key={group.key}>
              <div className={styles.groupLabel}>{group.owner}</div>
              {group.tracks.map(({ track, property }) => (
                <div key={track.id} className={styles.trackLabel}>
                  <span title={track.path}>{property}</span>
                  <IconButton
                    label="Loop: repeat the first value at the end"
                    size="sm"
                    onClick={() =>
                      updateAnimation('Loop track', (draft) => closeLoop(draft.animation, track.id))
                    }
                  >
                    <Repeat />
                  </IconButton>
                  <IconButton
                    label="Delete track"
                    size="sm"
                    onClick={() =>
                      updateAnimation('Delete track', (draft) => {
                        draft.animation.tracks = draft.animation.tracks.filter(
                          (t) => t.id !== track.id,
                        );
                      })
                    }
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={styles.lanes} ref={laneRef}>
          <div className={styles.ruler} onPointerDown={scrub} data-testid="ruler">
            {ticks.map((tick) => (
              <span key={tick} className={styles.tick} style={{ left: x(tick) }}>
                {tick % 1 === 0 ? `${tick}s` : tick.toFixed(step < 0.5 ? 2 : 1)}
              </span>
            ))}
          </div>
          {motions.map((motion) => (
            <MotionBar
              key={motion.id}
              motion={motion}
              x={x}
              laneWidth={laneWidth}
              duration={duration}
              fps={fps}
            />
          ))}
          {groups.map((group) => (
            <div key={group.key}>
              <div className={styles.groupLane} />
              {group.tracks.map(({ track }) => (
                <div
                  key={track.id}
                  className={styles.trackLane}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      playback.selectKeys([]);
                      scrub(event);
                    }
                  }}
                  onDoubleClick={(event) => {
                    const t = Math.round(timeAt(event.clientX) * fps) / fps;
                    const value = sampleTrack(track, t);
                    if (value === undefined) return;
                    updateAnimation('Add keyframe', (draft) => {
                      setKeyframe(draft.animation, track.path, t, value);
                    });
                  }}
                  title="Double-click to add a keyframe"
                >
                  {track.keyframes.map((key) => (
                    <button
                      key={key.id}
                      type="button"
                      className={styles.key}
                      data-selected={selectedKeys.includes(key.id) || undefined}
                      data-easing={typeof key.easing === 'string' ? key.easing : 'custom'}
                      style={{ left: x(key.time) }}
                      title={`${formatTimecode(key.time, fps)} · ${typeof key.value === 'number' ? Number(key.value.toFixed(3)) : key.value}`}
                      onPointerDown={(event) => dragKeys(event, key.id)}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        playback.seek(key.time);
                      }}
                      data-testid="keyframe"
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
          <div className={styles.playhead} style={{ left: x(time) }} />
        </div>
      </div>
      {empty && (
        <p className={styles.empty}>
          Add a motion to a layer (Layer › Motion), or turn on <strong>Auto-key</strong>, move the
          playhead and change any value: it becomes a keyframe.
        </p>
      )}
    </section>
  );
}

function MotionLabel({ doc, motion }: { doc: GalbeDocument; motion: Motion }) {
  return (
    <div className={styles.motionLabel} data-disabled={!motion.enabled || undefined}>
      <button
        type="button"
        onClick={() => {
          if ('nodeId' in motion && findNode(doc, motion.nodeId)) {
            useUiStore.getState().select([motion.nodeId]);
            useUiStore.getState().setInspectorTab('layer');
          } else useUiStore.getState().setInspectorTab('scene');
        }}
        title="Edit this motion"
      >
        <strong>{MOTION_LABELS[motion.type]}</strong> {motionTargetName(doc, motion)}
      </button>
    </div>
  );
}

function MotionBar({
  motion,
  x,
  laneWidth,
  duration,
  fps,
}: {
  motion: Motion;
  x: (t: number) => number;
  laneWidth: number;
  duration: number;
  fps: number;
}) {
  const end = motion.end ?? duration;
  const drag = (event: ReactPointerEvent, edge: 'start' | 'end' | 'move') => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const from = { start: motion.start, end };
    let began = false;
    const move = (e: PointerEvent) => {
      const delta = Math.round(((e.clientX - startX) / laneWidth) * duration * fps) / fps;
      if (!began) {
        gesture.begin('Motion timing');
        began = true;
      }
      documentApi.update(
        (draft) => {
          const m = draft.animation.motions.find((candidate) => candidate.id === motion.id);
          if (!m) return;
          const span = from.end - from.start;
          const minSpan = 1 / fps;
          if (edge === 'move') {
            const start = Math.max(0, Math.min(duration - span, from.start + delta));
            m.start = start;
            m.end = start + span >= duration - 1e-6 ? null : start + span;
          } else if (edge === 'start')
            m.start = Math.max(0, Math.min(from.end - minSpan, from.start + delta));
          else {
            const next = Math.max(from.start + minSpan, Math.min(duration, from.end + delta));
            m.end = next >= duration - 1e-6 ? null : next;
          }
        },
        { label: 'Motion timing', animate: false },
      );
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      if (began) gesture.end();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <div className={styles.motionLane}>
      <div
        className={styles.motionBar}
        data-type={motion.type}
        data-disabled={!motion.enabled || undefined}
        style={{ left: x(motion.start), width: Math.max(4, x(end) - x(motion.start)) }}
        onPointerDown={(event) => drag(event, 'move')}
        title="Drag to move, drag the edges to change the timing"
      >
        <span
          className={styles.edge}
          data-edge="start"
          onPointerDown={(event) => drag(event, 'start')}
        />
        <span className={styles.barLabel}>{MOTION_LABELS[motion.type]}</span>
        <span
          className={styles.edge}
          data-edge="end"
          onPointerDown={(event) => drag(event, 'end')}
        />
      </div>
    </div>
  );
}

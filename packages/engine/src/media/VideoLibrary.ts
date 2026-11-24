import type { AssetUri } from '@galbe/core';
import { LinearFilter, SRGBColorSpace, VideoTexture } from 'three';
import type { AssetSource } from '../assets/AssetSource.ts';

/** How a clip maps timeline time to clip time. */
export interface ClipTiming {
  startAt?: number;
  speed?: number;
  loop?: boolean;
}

interface Clip {
  uri: AssetUri;
  video: HTMLVideoElement;
  texture: VideoTexture;
  /** Resolves once the first frame is decodable. */
  ready: Promise<void>;
  loaded: boolean;
  failed: boolean;
  /** Seek in flight. */
  seeking: Promise<void> | null;
  /** Clip time requested last. */
  wanted: number;
  timing: ClipTiming;
}

/** Clip time (seconds) for timeline time `t`. */
export function clipTime(t: number, duration: number, timing: ClipTiming = {}): number {
  const time = (timing.startAt ?? 0) + t * (timing.speed ?? 1);
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
  if (timing.loop ?? true) return ((time % duration) + duration) % duration;
  return Math.min(Math.max(0, time), Math.max(0, duration - 1e-3));
}

/**
 * Video files used as backgrounds or material textures. Frames are driven by the
 * timeline: when paused or exporting, each clip is *seeked* to the exact time and the
 * frame is awaited (`whenReady`), so a video export is frame-accurate. While the studio
 * plays, clips play natively and are re-synced only when they drift.
 */
export class VideoLibrary {
  private readonly clips = new Map<string, Clip>();
  private playing = false;
  private readonly used = new Set<string>();

  constructor(
    private readonly source: AssetSource,
    private readonly onChange: () => void,
  ) {}

  get pending(): number {
    let count = 0;
    for (const clip of this.clips.values())
      if (this.used.has(clip.uri) && !clip.failed && (!clip.loaded || clip.seeking)) count++;
    return count;
  }

  /** The texture of a clip (created on first use; shows black until the first frame). */
  texture(uri: AssetUri, timing: ClipTiming = {}): VideoTexture | null {
    if (typeof document === 'undefined') return null;
    let clip = this.clips.get(uri);
    if (!clip) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';
      const texture = new VideoTexture(video);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.generateMipmaps = false;
      const created: Clip = {
        uri,
        video,
        texture,
        loaded: false,
        failed: false,
        seeking: null,
        wanted: 0,
        timing,
        ready: Promise.resolve(),
      };
      created.ready = this.source
        .resolveUrl(uri)
        .then(
          (url) =>
            new Promise<void>((resolve, reject) => {
              video.addEventListener('loadeddata', () => resolve(), { once: true });
              video.addEventListener('error', () => reject(new Error(`Video ${uri} failed`)), {
                once: true,
              });
              video.src = url;
              video.load();
            }),
        )
        .then(
          () => {
            created.loaded = true;
            texture.needsUpdate = true;
            this.onChange();
          },
          (error: unknown) => {
            created.failed = true;
            created.loaded = true;
            console.warn('[galbe] video failed to load', error);
            this.onChange();
          },
        );
      this.clips.set(uri, created);
      clip = created;
    }
    clip.timing = timing;
    return clip.texture;
  }

  /** Clip length in seconds (NaN until known). */
  duration(uri: AssetUri): number {
    return this.clips.get(uri)?.video.duration ?? Number.NaN;
  }

  /** The clips the document uses; others are paused and ignored by `whenReady`. */
  setActive(uris: Iterable<string>): void {
    this.used.clear();
    for (const uri of uris) this.used.add(uri);
  }

  /** Free-running playback (studio) vs exact seeking (paused, exports). */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    for (const clip of this.clips.values()) {
      if (!playing) clip.video.pause();
    }
  }

  /** Moves every clip in use to timeline time `t`. */
  setTime(t: number): void {
    for (const clip of this.clips.values()) {
      if (!this.used.has(clip.uri)) {
        if (!clip.video.paused) clip.video.pause();
        continue;
      }
      if (!clip.loaded || clip.failed) continue;
      const target = clipTime(t, clip.video.duration, clip.timing);
      clip.wanted = target;
      if (this.playing) {
        clip.video.playbackRate = clip.timing.speed ?? 1;
        clip.video.loop = clip.timing.loop ?? true;
        if (clip.video.paused) void clip.video.play().catch(() => {});
        if (Math.abs(clip.video.currentTime - target) > 0.25) clip.video.currentTime = target;
      } else {
        if (!clip.video.paused) clip.video.pause();
        this.seek(clip, target);
      }
    }
  }

  private seek(clip: Clip, target: number): void {
    if (Math.abs(clip.video.currentTime - target) < 1e-3 && !clip.video.seeking) return;
    const run = new Promise<void>((resolve) => {
      const done = () => {
        clip.video.removeEventListener('seeked', done);
        // Wait until the new frame is actually presented before rendering it.
        const video = clip.video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };
        const finish = () => {
          clip.texture.needsUpdate = true;
          resolve();
        };
        if (video.requestVideoFrameCallback) {
          let settled = false;
          video.requestVideoFrameCallback(() => {
            settled = true;
            finish();
          });
          // Some browsers never present a frame for an unchanged position.
          setTimeout(() => {
            if (!settled) finish();
          }, 250);
        } else finish();
      };
      clip.video.addEventListener('seeked', done);
      clip.video.currentTime = target;
    });
    const tracked = run.then(() => {
      if (clip.seeking === tracked) clip.seeking = null;
      this.onChange();
    });
    clip.seeking = tracked;
  }

  /** Resolves once every clip in use has loaded and reached its requested time. */
  async whenReady(): Promise<void> {
    for (let guard = 0; guard < 20 && this.pending > 0; guard++) {
      const waits: Promise<void>[] = [];
      for (const clip of this.clips.values()) {
        if (!this.used.has(clip.uri)) continue;
        waits.push(clip.ready);
        if (clip.seeking) waits.push(clip.seeking);
      }
      await Promise.allSettled(waits);
    }
  }

  dispose(): void {
    for (const clip of this.clips.values()) {
      clip.video.pause();
      clip.video.removeAttribute('src');
      clip.video.load();
      clip.texture.dispose();
    }
    this.clips.clear();
  }
}

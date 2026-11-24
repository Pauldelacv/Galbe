import {
  type Background,
  createOverlay,
  GradientBackgroundSchema,
  ImageBackgroundSchema,
  isMeshNode,
  projectAssetUri,
  VideoBackgroundSchema,
} from '@galbe/core';
import { pickFiles } from '../../lib/files.ts';
import { putAsset } from '../../persistence/assetStore.ts';
import { documentApi } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';

export const IMAGE_ACCEPT =
  '.png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif';
export const VIDEO_ACCEPT = '.mp4,.webm,.mov,.m4v,video/mp4,video/webm,video/quicktime';

/** Default settings of each background type (keeps the current colour when it can). */
export function defaultBackground(type: Background['type'], current: Background): Background {
  switch (type) {
    case 'transparent':
      return { type };
    case 'color':
      return { type, color: current.type === 'color' ? current.color : '#16161a' };
    case 'environment':
      return { type, blur: 0.6, intensity: 1 };
    case 'gradient':
      return GradientBackgroundSchema.parse({ type });
    case 'image':
      return ImageBackgroundSchema.parse({ type });
    case 'video':
      return VideoBackgroundSchema.parse({ type });
  }
}

async function store(file: File, kind: 'image' | 'video') {
  return putAsset(await file.arrayBuffer(), {
    name: file.name,
    kind,
    ...(file.type ? { mime: file.type } : {}),
    meta: { source: 'upload' },
  });
}

/** Stores an image or a video and uses it as the background. */
export async function setBackgroundMedia(file: File, kind: 'image' | 'video'): Promise<void> {
  const entry = await store(file, kind);
  documentApi.update(
    (draft) => {
      draft.assets[entry.id] = entry;
      const uri = projectAssetUri(entry.id);
      const current = draft.background;
      if (kind === 'image')
        draft.background =
          current.type === 'image'
            ? { ...current, image: uri }
            : ImageBackgroundSchema.parse({ type: 'image', image: uri });
      else
        draft.background =
          current.type === 'video'
            ? { ...current, video: uri }
            : VideoBackgroundSchema.parse({ type: 'video', video: uri });
    },
    { label: kind === 'image' ? 'Background image' : 'Background video', animate: false },
  );
  notify(`${file.name} set as background`, 'success');
}

export async function pickBackgroundMedia(kind: 'image' | 'video'): Promise<void> {
  const [file] = await pickFiles(kind === 'image' ? IMAGE_ACCEPT : VIDEO_ACCEPT);
  if (!file) return;
  try {
    await setBackgroundMedia(file, kind);
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not import this file.', 'error');
  }
}

/**
 * A dropped video: with a layer selected (and the Layer tab open), it becomes the colour
 * map of its material (a video texture); otherwise the background.
 */
export async function importVideoFile(file: File): Promise<void> {
  const { selection, inspectorTab } = useUiStore.getState();
  const doc = documentApi.get();
  const target = doc.nodes.find((node) => selection.includes(node.id) && isMeshNode(node));
  const material = target && isMeshNode(target) ? doc.materials[target.materialId] : undefined;
  if (inspectorTab !== 'cover' && material?.type === 'physical') {
    const entry = await store(file, 'video');
    documentApi.update(
      (draft) => {
        draft.assets[entry.id] = entry;
        const spec = draft.materials[material.id];
        if (spec?.type === 'physical') spec.textures.map = projectAssetUri(entry.id);
      },
      { label: 'Video texture', animate: false },
    );
    notify(`${file.name} plays on ${material.name}`, 'success');
    return;
  }
  await setBackgroundMedia(file, 'video');
}

/** Adds a text overlay in the middle of the frame and selects it. */
export function addOverlay(text = 'Title'): string {
  const overlay = createOverlay({ text, name: text.split('\n')[0]?.slice(0, 24) || 'Title' });
  documentApi.update(
    (draft) => {
      draft.overlays.push(overlay);
    },
    { label: 'Add overlay', animate: false },
  );
  useUiStore.setState({ activeOverlay: overlay.id, inspectorTab: 'cover' });
  return overlay.id;
}

export function removeOverlay(id: string): void {
  documentApi.update(
    (draft) => {
      draft.overlays = draft.overlays.filter((overlay) => overlay.id !== id);
      draft.animation.tracks = draft.animation.tracks.filter(
        (track) => !track.path.startsWith(`overlays.${id}.`),
      );
    },
    { label: 'Delete overlay', animate: false },
  );
  if (useUiStore.getState().activeOverlay === id) useUiStore.setState({ activeOverlay: null });
}

/** Original gradient presets (CC0, made for Galbe). */
export const GRADIENT_PRESETS: { name: string; background: Background }[] = [
  {
    name: 'Ember',
    background: GradientBackgroundSchema.parse({
      type: 'gradient',
      kind: 'linear',
      angle: 160,
      stops: [
        { color: '#ffb36b', position: 0 },
        { color: '#ff4d3d', position: 0.45 },
        { color: '#4a0f3b', position: 1 },
      ],
    }),
  },
  {
    name: 'Lagoon',
    background: GradientBackgroundSchema.parse({
      type: 'gradient',
      kind: 'linear',
      angle: 200,
      stops: [
        { color: '#c8fff4', position: 0 },
        { color: '#1fb5b0', position: 0.5 },
        { color: '#0b2a4a', position: 1 },
      ],
    }),
  },
  {
    name: 'Studio',
    background: GradientBackgroundSchema.parse({
      type: 'gradient',
      kind: 'radial',
      center: [0.5, 0.4],
      radius: 1.1,
      stops: [
        { color: '#4a4a52', position: 0 },
        { color: '#141418', position: 1 },
      ],
    }),
  },
  {
    name: 'Dusk',
    background: GradientBackgroundSchema.parse({
      type: 'gradient',
      kind: 'radial',
      center: [0.5, 1],
      radius: 1.4,
      stops: [
        { color: '#ffd29a', position: 0 },
        { color: '#c2527d', position: 0.4 },
        { color: '#1b1340', position: 1 },
      ],
    }),
  },
  {
    name: 'Sorbet',
    background: GradientBackgroundSchema.parse({ type: 'gradient', kind: 'mesh' }),
  },
  {
    name: 'Aurora',
    background: GradientBackgroundSchema.parse({
      type: 'gradient',
      kind: 'mesh',
      softness: 1.4,
      points: [
        { color: '#0a1033', position: [0.5, 0.95] },
        { color: '#22d3a6', position: [0.2, 0.3] },
        { color: '#7b5cff', position: [0.8, 0.25] },
        { color: '#0f2f5c', position: [0.5, 0.6] },
      ],
    }),
  },
];

/** CSS preview of a background (for swatches). */
export function backgroundCss(background: Background): string {
  if (background.type === 'color') return background.color;
  if (background.type !== 'gradient') return 'var(--g-bg-control)';
  if (background.kind === 'mesh') {
    const layers = background.points.map(
      (point) =>
        `radial-gradient(circle at ${point.position[0] * 100}% ${point.position[1] * 100}%, ${point.color} 0%, transparent 70%)`,
    );
    return `${layers.join(', ')}, ${background.points[0]?.color ?? '#000'}`;
  }
  const stops = [...background.stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position * 100}%`)
    .join(', ');
  return background.kind === 'linear'
    ? `linear-gradient(${background.angle}deg, ${stops})`
    : `radial-gradient(circle at ${background.center[0] * 100}% ${background.center[1] * 100}%, ${stops})`;
}

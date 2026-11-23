import type { FramePresetId } from '../schema/document.ts';

export interface FramePreset {
  id: Exclude<FramePresetId, 'custom'>;
  label: string;
  hint: string;
  width: number;
  height: number;
}

/** Output formats. Base sizes are the common delivery size; export can scale them up. */
export const FRAME_PRESETS: readonly FramePreset[] = [
  { id: '1:1', label: 'Square', hint: '1:1 · feed post', width: 1080, height: 1080 },
  { id: '4:5', label: 'Portrait', hint: '4:5 · feed post', width: 1080, height: 1350 },
  { id: '9:16', label: 'Story', hint: '9:16 · story, reel, short', width: 1080, height: 1920 },
  { id: '16:9', label: 'Landscape', hint: '16:9 · video, slide', width: 1920, height: 1080 },
  { id: 'a4', label: 'A4', hint: 'A4 portrait · 300 dpi', width: 2480, height: 3508 },
];

export function getFramePreset(id: FramePresetId): FramePreset | undefined {
  return FRAME_PRESETS.find((preset) => preset.id === id);
}

/** Largest export side we offer; tiled rendering makes this GPU-independent. */
export const MAX_EXPORT_SIDE = 8192;

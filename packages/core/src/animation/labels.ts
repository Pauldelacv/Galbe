import type { GalbeDocument } from '../schema/document.ts';
import { splitPath } from './paths.ts';

const AXIS = ['X', 'Y', 'Z'];

const FIELD_LABELS: Record<string, string> = {
  position: 'Position',
  rotation: 'Rotation',
  scale: 'Scale',
  fov: 'Field of view',
  target: 'Target',
  intensity: 'Intensity',
  color: 'Colour',
  opacity: 'Opacity',
  exposure: 'Exposure',
  angle: 'Angle',
  size: 'Size',
  depth: 'Depth',
};

const humanize = (key: string): string =>
  FIELD_LABELS[key] ??
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Owner name and property label of a track path, for timeline rows. */
export function describePath(
  doc: GalbeDocument,
  path: string,
): { owner: string; property: string; group: string } {
  const [root, id, ...rest] = splitPath(path);
  let owner: string = humanize(root ?? '');
  let fields = [id ?? '', ...rest];
  let group: string = root ?? '';
  const named = (items: { id: string; name?: string }[]) => items.find((item) => item.id === id);
  if (root === 'nodes') {
    owner = named(doc.nodes)?.name ?? 'Layer';
    fields = rest;
    group = `nodes.${id}`;
  } else if (root === 'materials') {
    owner = doc.materials[id ?? '']?.name ?? 'Material';
    fields = rest;
    group = `materials.${id}`;
  } else if (root === 'lights') {
    owner = named(doc.lights)?.name ?? 'Light';
    fields = rest;
    group = `lights.${id}`;
  } else if (root === 'effects') {
    owner = humanize(doc.effects.find((effect) => effect.id === id)?.type ?? 'Effect');
    fields = rest[0] === 'params' ? rest.slice(1) : rest;
    group = `effects.${id}`;
  } else if (root === 'overlays') {
    owner = named(doc.overlays)?.name ?? 'Overlay';
    fields = rest;
    group = `overlays.${id}`;
  }
  const parts: string[] = [];
  for (const field of fields) {
    if (/^\d$/.test(field) && parts.length)
      parts[parts.length - 1] += ` ${AXIS[Number(field)] ?? field}`;
    else if (!/^\d+$/.test(field)) parts.push(humanize(field));
  }
  return { owner, property: parts.join(' › ') || humanize(root ?? ''), group };
}

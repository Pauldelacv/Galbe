import { createId } from './ids.ts';
import { DEFAULT_FONT } from './presets/fonts.ts';
import { DEFAULT_MATERIAL_PRESET_ID, getMaterialPreset } from './presets/materials.ts';
import {
  type GalbeDocument,
  type GalbeDocumentInput,
  GalbeDocumentSchema,
} from './schema/document.ts';
import {
  type MaterialSpec,
  type PhysicalMaterial,
  PhysicalMaterialSchema,
} from './schema/material.ts';
import { type GroupNode, GroupNodeSchema, type TextNode, TextNodeSchema } from './schema/nodes.ts';
import { CURRENT_SCHEMA_VERSION } from './version.ts';

export const GENERATOR = 'galbe@0.1.0';

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** A physical material, from a preset when `presetId` is given. */
export function createMaterial(
  presetId?: string,
  overrides: Partial<PhysicalMaterial> = {},
): PhysicalMaterial {
  const preset = presetId ? getMaterialPreset(presetId) : undefined;
  return PhysicalMaterialSchema.parse({
    ...preset?.spec,
    ...overrides,
    id: overrides.id ?? createId(),
    type: 'physical',
    ...(preset ? { preset: preset.id } : {}),
  });
}

export function createTextNode(
  input: DeepPartial<Omit<TextNode, 'type' | 'materialId'>> & { materialId: string },
): TextNode {
  return TextNodeSchema.parse({
    font: DEFAULT_FONT,
    ...input,
    id: input.id ?? createId(),
    type: 'text',
  });
}

export function createGroupNode(input: DeepPartial<Omit<GroupNode, 'type'>> = {}): GroupNode {
  return GroupNodeSchema.parse({ ...input, id: input.id ?? createId(), type: 'group' });
}

/** An empty, valid document. */
export function createDocument(input: Partial<GalbeDocumentInput> = {}): GalbeDocument {
  const now = new Date().toISOString();
  return GalbeDocumentSchema.parse({
    generator: GENERATOR,
    createdAt: now,
    updatedAt: now,
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: input.id ?? createId(),
  });
}

/** The scene a new project starts with: one line of chrome type. */
export function createStarterDocument(name = 'Untitled'): GalbeDocument {
  const material: MaterialSpec = createMaterial(DEFAULT_MATERIAL_PRESET_ID);
  const text = createTextNode({ name: 'Galbe', text: 'Galbe', materialId: material.id });
  return createDocument({
    name,
    // Puts the soft boxes of the default studio HDRI in front of the text, so chrome
    // reads as a bright gradient instead of reflecting the dark back of the studio.
    environment: { hdri: 'builtin:hdri/studio-small-09', intensity: 1, rotation: 120 },
    materials: { [material.id]: material },
    nodes: [text],
  });
}

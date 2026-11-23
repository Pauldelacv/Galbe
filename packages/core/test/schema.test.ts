import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createDocument,
  createMaterial,
  createStarterDocument,
  createTextNode,
  GalbeDocumentSchema,
  getMaterialPreset,
  MATERIAL_PRESETS,
  TextNodeSchema,
} from '../src/index.ts';

describe('schema', () => {
  it('creates a valid starter document', () => {
    const doc = createStarterDocument('Hello');
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(doc.name).toBe('Hello');
    expect(doc.nodes).toHaveLength(1);
    const text = doc.nodes[0]!;
    expect(text.type).toBe('text');
    expect(() => GalbeDocumentSchema.parse(JSON.parse(JSON.stringify(doc)))).not.toThrow();
  });

  it('fills nested defaults from a minimal node', () => {
    const node = TextNodeSchema.parse({
      id: 'a',
      type: 'text',
      materialId: 'm',
      font: { family: 'Inter', files: ['builtin:fonts/inter/latin-400-normal'] },
    });
    expect(node.bevel.segments).toBe(4);
    expect(node.deform.wave.axis).toBe('z');
    expect(node.transform.scale).toEqual([1, 1, 1]);
    expect(node.font.weight).toBe(400);
  });

  it('normalises colours to lowercase', () => {
    expect(createMaterial(undefined, { color: '#AABBCC' }).color).toBe('#aabbcc');
  });

  it('rejects invalid values', () => {
    const doc = createStarterDocument();
    const broken = structuredClone(doc) as unknown as { nodes: { size: number }[] };
    broken.nodes[0]!.size = -1;
    expect(GalbeDocumentSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects dangling material and parent references', () => {
    const doc = createDocument();
    const node = createTextNode({ materialId: 'missing' });
    const result = GalbeDocumentSchema.safeParse({
      ...doc,
      nodes: [{ ...node, parentId: 'nope' }],
    });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages).toContain('Unknown material "missing"');
    expect(messages).toContain('Unknown parent "nope"');
  });

  it('rejects duplicate node ids', () => {
    const doc = createStarterDocument();
    const result = GalbeDocumentSchema.safeParse({ ...doc, nodes: [doc.nodes[0], doc.nodes[0]] });
    expect(result.success).toBe(false);
  });

  it('rejects malformed asset URIs', () => {
    const doc = createDocument();
    const result = GalbeDocumentSchema.safeParse({
      ...doc,
      environment: { hdri: 'https://evil.example/x.hdr' },
    });
    expect(result.success).toBe(false);
  });

  it('every material preset produces a valid material', () => {
    expect(MATERIAL_PRESETS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set<string>();
    for (const preset of MATERIAL_PRESETS) {
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
      const material = createMaterial(preset.id);
      expect(material.preset).toBe(preset.id);
    }
    expect(getMaterialPreset('glass')?.spec.transmission).toBe(1);
  });
});

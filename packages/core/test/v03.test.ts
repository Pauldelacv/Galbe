import { describe, expect, it } from 'vitest';
import {
  addNode,
  baseCameraFor,
  createMaterial,
  createMotion,
  createOverlay,
  createStarterDocument,
  createTextNode,
  cubicBezier,
  describePath,
  diffAnimatable,
  duplicateNodes,
  ease,
  evaluateScene,
  type GalbeDocument,
  getPath,
  keyChanges,
  loadDocument,
  mixValues,
  PathWriter,
  partTransform,
  removeNodes,
  revealAmount,
  sampleTrack,
  seededOrder,
  setKeyframe,
  shiftKeyframes,
} from '../src/index.ts';

const clone = <T>(value: T): T => structuredClone(value);

function starter(): GalbeDocument {
  return createStarterDocument('Motion');
}

describe('easing', () => {
  it('matches the CSS curves at the ends and the middle', () => {
    expect(ease('linear', 0.25)).toBe(0.25);
    expect(ease('easeInOut', 0)).toBe(0);
    expect(ease('easeInOut', 1)).toBe(1);
    expect(ease('easeInOut', 0.5)).toBeCloseTo(0.5, 4);
    expect(ease('easeIn', 0.5)).toBeLessThan(0.5);
    expect(ease('easeOut', 0.5)).toBeGreaterThan(0.5);
    expect(ease('hold', 0.99)).toBe(0);
    expect(ease('easeOutBack', 0.7)).toBeGreaterThan(1);
    expect(cubicBezier(0.25, 0.1, 0.25, 1, 0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe('paths', () => {
  it('reads and writes by id, copy-on-write', () => {
    const doc = starter();
    const id = doc.nodes[0]!.id;
    expect(getPath(doc, `nodes.${id}.transform.position.1`)).toBe(0);
    const writer = new PathWriter(doc);
    expect(writer.set(`nodes.${id}.transform.position.1`, 2)).toBe(true);
    expect(writer.set(`nodes.missing.transform.position.1`, 2)).toBe(false);
    const out = writer.value;
    expect(out).not.toBe(doc);
    expect(out.nodes[0]!.transform.position[1]).toBe(2);
    expect(doc.nodes[0]!.transform.position[1]).toBe(0);
    // Unrelated branches are shared.
    expect(out.materials).toBe(doc.materials);
    expect(out.nodes[0]!.font).toBe(doc.nodes[0]!.font);
  });
});

describe('tracks', () => {
  it('interpolates numbers and colours and holds outside the keys', () => {
    const track = {
      keyframes: [
        { id: 'a', time: 1, value: 0, easing: 'linear' as const },
        { id: 'b', time: 3, value: 10, easing: 'linear' as const },
      ],
    };
    expect(sampleTrack(track, 0)).toBe(0);
    expect(sampleTrack(track, 2)).toBe(5);
    expect(sampleTrack(track, 5)).toBe(10);
    expect(mixValues('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('evaluates keyframes into the document without touching the source', () => {
    const doc = starter();
    const id = doc.nodes[0]!.id;
    const materialId = doc.nodes[0]!.type === 'text' ? doc.nodes[0]!.materialId : '';
    setKeyframe(doc.animation, `nodes.${id}.transform.rotation.1`, 0, 0, 'linear');
    setKeyframe(doc.animation, `nodes.${id}.transform.rotation.1`, 2, 90, 'linear');
    setKeyframe(doc.animation, `materials.${materialId}.color`, 0, '#000000', 'linear');
    setKeyframe(doc.animation, `materials.${materialId}.color`, 2, '#ff0000', 'linear');
    const { doc: at1 } = evaluateScene(doc, 1);
    expect(at1.nodes[0]!.transform.rotation[1]).toBe(45);
    expect(at1.materials[materialId]!.type === 'physical' && at1.materials[materialId]!.color).toBe(
      '#800000',
    );
    expect(doc.nodes[0]!.transform.rotation[1]).toBe(0);
  });

  it('rounds integer fields and ignores broken paths', () => {
    const doc = starter();
    const id = doc.nodes[0]!.id;
    setKeyframe(doc.animation, `nodes.${id}.bevel.segments`, 0, 1, 'linear');
    setKeyframe(doc.animation, `nodes.${id}.bevel.segments`, 1, 4, 'linear');
    setKeyframe(doc.animation, 'nodes.gone.transform.position.0', 0, 1);
    const { doc: out } = evaluateScene(doc, 0.4);
    const node = out.nodes[0]!;
    expect(node.type === 'text' && node.bevel.segments).toBe(2);
  });
});

describe('motions', () => {
  it('spin loops seamlessly and is deterministic', () => {
    const doc = starter();
    const id = doc.nodes[0]!.id;
    doc.animation.motions.push(createMotion('spin', { nodeId: id, turns: 1 }));
    const at = (t: number) => evaluateScene(doc, t).doc.nodes[0]!.transform.rotation[1];
    expect(at(0)).toBe(0);
    expect(at(1)).toBeCloseTo(90);
    expect(at(4)).toBeCloseTo(360);
    expect(at(1.234)).toBe(at(1.234));
  });

  it('per-letter motions are reported for text, applied whole for primitives', () => {
    const doc = starter();
    const id = doc.nodes[0]!.id;
    doc.animation.motions.push(createMotion('reveal', { nodeId: id }));
    const { parts } = evaluateScene(doc, 0);
    expect(parts[id]).toHaveLength(1);
    const hidden = partTransform(parts[id]!, 0, 5);
    expect(hidden.scale).toBe(0);
    const end = evaluateScene(doc, 4).parts[id]!;
    for (let i = 0; i < 5; i++) expect(partTransform(end, i, 5).scale).toBeCloseTo(1);
  });

  it('reveal staggers letters in order', () => {
    const motion = createMotion('reveal', { nodeId: 'x', stagger: 1, easing: 'linear' });
    expect(revealAmount(motion, 0.1, 0, 5)).toBeLessThan(revealAmount(motion, 0.1, 4, 5));
    expect(revealAmount({ ...motion, order: 'backward' }, 0.1, 4, 5)).toBeLessThan(
      revealAmount({ ...motion, order: 'backward' }, 0.1, 0, 5),
    );
    expect(seededOrder(8, 3)).toEqual(seededOrder(8, 3));
    expect([...seededOrder(8, 3)].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('material transition blends into another material and back', () => {
    const doc = starter();
    const node = doc.nodes[0]!;
    const gold = createMaterial('gold');
    doc.materials[gold.id] = gold;
    doc.animation.motions.push(
      createMotion('materialTransition', { nodeId: node.id, toMaterialId: gold.id }),
    );
    expect(evaluateScene(doc, 0).doc.nodes[0]).toEqual(node);
    const mid = evaluateScene(doc, 2).doc;
    const midNode = mid.nodes[0]!;
    expect('materialId' in midNode && midNode.materialId).toMatch(/^__motion_/);
    const blended = mid.materials['materialId' in midNode ? midNode.materialId : '']!;
    expect(blended.type === 'physical' && gold.type === 'physical' && blended.color).toBe(
      gold.color,
    );
    // The transition target survives pruning.
    removeNodes(doc, []);
    expect(doc.materials[gold.id]).toBeDefined();
  });

  it('camera motions are invertible', () => {
    const doc = starter();
    doc.animation.motions.push(createMotion('orbit', { angle: 90 }));
    doc.animation.motions.push(createMotion('dolly', { distance: 1 }));
    doc.animation.motions.push(createMotion('truck', { distance: 1 }));
    const shown = evaluateScene(doc, 1.3).doc.camera;
    expect(shown.position).not.toEqual(doc.camera.position);
    const base = baseCameraFor(doc, shown, 1.3);
    for (let i = 0; i < 3; i++) {
      expect(base.position[i]).toBeCloseTo(doc.camera.position[i]!, 6);
      expect(base.target[i]).toBeCloseTo(doc.camera.target[i]!, 6);
    }
  });
});

describe('auto-key', () => {
  it('diffs animatable values and keys them', () => {
    const before = starter();
    const after = clone(before);
    const id = after.nodes[0]!.id;
    after.nodes[0]!.transform.position[0] = 2;
    after.camera.fov = 40;
    after.name = 'renamed';
    const changes = diffAnimatable(before, after);
    expect(changes.map((c) => c.path).sort()).toEqual(
      ['camera.fov', `nodes.${id}.transform.position.0`].sort(),
    );
    // Without auto-key nothing is created; with it, a key at 0 (old) and at t (new).
    expect(keyChanges(after.animation, changes, 1, false)).toBe(0);
    expect(keyChanges(after.animation, changes, 1, true)).toBe(2);
    const track = after.animation.tracks.find((t) => t.path === 'camera.fov')!;
    expect(track.keyframes.map((k) => [k.time, k.value])).toEqual([
      [0, 27],
      [1, 40],
    ]);
    // A tracked property is always keyed.
    expect(
      keyChanges(after.animation, [{ path: 'camera.fov', before: 40, after: 50 }], 2, false),
    ).toBe(1);
    expect(track.keyframes).toHaveLength(3);
  });

  it('moves keyframes on frames and labels tracks', () => {
    const doc = starter();
    const id = setKeyframe(doc.animation, 'camera.fov', 1, 30);
    shiftKeyframes(doc.animation, [id], 0.51, 30);
    expect(doc.animation.tracks[0]!.keyframes[0]!.time).toBeCloseTo(1.5, 6);
    expect(describePath(doc, 'camera.fov')).toMatchObject({
      owner: 'Camera',
      property: 'Field of view',
    });
    const nodeId = doc.nodes[0]!.id;
    expect(describePath(doc, `nodes.${nodeId}.transform.rotation.1`).property).toBe(
      'Transform › Rotation Y',
    );
  });
});

describe('document', () => {
  it('round-trips the v0.3 fields and fills defaults for older files', () => {
    const doc = starter();
    doc.background = loadDocument({
      ...doc,
      background: { type: 'gradient', kind: 'mesh' },
    }).background;
    doc.overlays.push(createOverlay({ text: 'Hello' }));
    doc.animation.motions.push(createMotion('float', { nodeId: doc.nodes[0]!.id }));
    const loaded = loadDocument(JSON.parse(JSON.stringify(doc)));
    expect(loaded.background.type).toBe('gradient');
    expect(loaded.overlays[0]!.text).toBe('Hello');
    expect(loaded.animation.motions[0]!.type).toBe('float');
    const { animation: _a, overlays: _o, ...old } = JSON.parse(JSON.stringify(starter()));
    const upgraded = loadDocument(old);
    expect(upgraded.animation).toMatchObject({ duration: 4, fps: 30, tracks: [], motions: [] });
    expect(upgraded.overlays).toEqual([]);
  });

  it('drops animation of removed nodes and copies it on duplicate', () => {
    const doc = starter();
    const material = createMaterial('chrome');
    const extra = createTextNode({ materialId: material.id, text: 'B' });
    addNode(doc, extra, { materials: [material] });
    doc.animation.motions.push(createMotion('spin', { nodeId: extra.id }));
    setKeyframe(doc.animation, `nodes.${extra.id}.transform.position.0`, 1, 3);
    const [copy] = duplicateNodes(doc, [extra.id]);
    expect(doc.animation.motions.filter((m) => 'nodeId' in m && m.nodeId === copy)).toHaveLength(1);
    expect(doc.animation.tracks.some((t) => t.path.startsWith(`nodes.${copy}.`))).toBe(true);
    removeNodes(doc, [extra.id, copy!]);
    expect(doc.animation.motions).toHaveLength(0);
    expect(doc.animation.tracks).toHaveLength(0);
  });
});

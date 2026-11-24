import {
  addNode,
  createMaterial,
  createModelNode,
  createPrimitiveNode,
  createShapeNode,
  createStarterDocument,
  type GalbeDocument,
  PRIMITIVE_KINDS,
  ShapePathSchema,
} from '@galbe/core';
import { Window } from 'happy-dom';
import { produce } from 'immer';
import { Box3, Mesh, type MeshPhysicalMaterial, Scene, Texture } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNoise3D } from '../src/geometry/noise.ts';
import { buildPrimitiveGeometry } from '../src/geometry/primitives.ts';
import { MaterialLibrary } from '../src/materials/MaterialLibrary.ts';
import { TextureLibrary } from '../src/materials/TextureLibrary.ts';
import { SceneController } from '../src/scene/SceneController.ts';
import { buildShapeSoups, pathShapes, shapeLayout } from '../src/shapes/buildShapeGeometry.ts';
import { importSvg } from '../src/shapes/importSvg.ts';
import { parsePathData } from '../src/shapes/svgPath.ts';
import { diskAssetSource } from './helpers.ts';

beforeAll(() => {
  (globalThis as { DOMParser?: unknown }).DOMParser = new Window().DOMParser;
});

const path = (input: Parameters<typeof ShapePathSchema.parse>[0]) => ShapePathSchema.parse(input);
const SQUARE_WITH_HOLE = 'M0 0L100 0L100 100L0 100ZM25 25L75 25L75 75L25 75Z';

describe('primitives', () => {
  it.each(PRIMITIVE_KINDS)('builds a %s', (kind) => {
    const node = createPrimitiveNode({ kind, materialId: 'm' });
    const geometry = buildPrimitiveGeometry(node);
    expect(geometry.getAttribute('position').count).toBeGreaterThan(50);
    expect(geometry.getAttribute('normal')).toBeDefined();
    const size = geometry.boundingBox!.getSize(
      new (geometry.boundingBox!.max.constructor as never)(),
    );
    expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.5);
  });

  it('makes noise blobs deterministic per seed', () => {
    const a = buildPrimitiveGeometry(createPrimitiveNode({ kind: 'blob', materialId: 'm' }));
    const b = buildPrimitiveGeometry(createPrimitiveNode({ kind: 'blob', materialId: 'm' }));
    const c = buildPrimitiveGeometry(
      createPrimitiveNode({ kind: 'blob', materialId: 'm', params: { noise: { seed: 2 } } }),
    );
    const pa = a.getAttribute('position').array;
    expect(Array.from(pa)).toEqual(Array.from(b.getAttribute('position').array));
    expect(Array.from(pa)).not.toEqual(Array.from(c.getAttribute('position').array));
    const noise = createNoise3D(5);
    expect(noise(0.3, 0.2, 0.1)).toBe(createNoise3D(5)(0.3, 0.2, 0.1));
  });
});

describe('shapes', () => {
  it('parses normalised path data', () => {
    const subs = parsePathData('M0 0L10 0C10 5 5 10 0 10Q-5 5 0 0ZM20 20L30 20L30 30');
    expect(subs).toHaveLength(2);
    expect(subs[0]!.closed).toBe(true);
    expect(subs[1]!.closed).toBe(false);
  });

  it('resolves holes with nonzero and evenodd fill rules', () => {
    const node = {
      paths: [],
      viewBox: [0, 0, 100, 100] as [number, number, number, number],
      size: 2,
      curveSegments: 8,
    };
    const layout = shapeLayout({ ...node, paths: [path({ id: 'a', d: SQUARE_WITH_HOLE })] });
    expect(layout.scale).toBeCloseTo(0.02);
    // Same winding on both contours: nonzero fills the hole, evenodd keeps it.
    const nonzero = pathShapes(path({ id: 'a', d: SQUARE_WITH_HOLE }), layout);
    const evenodd = pathShapes(path({ id: 'a', d: SQUARE_WITH_HOLE, fillRule: 'evenodd' }), layout);
    expect(nonzero).toHaveLength(1);
    expect(nonzero[0]!.holes).toHaveLength(0);
    expect(evenodd[0]!.holes).toHaveLength(1);
  });

  it('turns strokes into outlines', () => {
    const line = path({ id: 's', d: 'M0 50L100 50', stroke: { width: 10 } });
    const layout = shapeLayout({
      paths: [line],
      viewBox: [0, 0, 100, 100],
      size: 2,
      curveSegments: 8,
    });
    const shapes = pathShapes(line, layout);
    expect(shapes).toHaveLength(1);
    const box = new Box3().setFromPoints(
      shapes[0]!.getPoints().map((p) => ({ x: p.x, y: p.y, z: 0 }) as never),
    );
    expect(box.max.y - box.min.y).toBeCloseTo(10 * layout.scale, 2);
  });

  it('stacks paths along Z and builds one soup per visible path', () => {
    const shape = createShapeNode({
      materialId: 'm',
      viewBox: [0, 0, 100, 100],
      paths: [
        { id: 'a', d: 'M0 0L100 0L100 100L0 100Z' },
        { id: 'b', d: 'M25 25L75 25L75 75L25 75Z' },
        { id: 'c', d: 'M0 0L10 0L10 10Z', visible: false },
      ],
    });
    const soups = buildShapeSoups(shape);
    expect(soups.map((s) => s.pathId)).toEqual(['a', 'b']);
    const maxZ = (i: number) => Math.max(...soups[i]!.soup.position.filter((_, k) => k % 3 === 2));
    expect(maxZ(1)).toBeGreaterThan(maxZ(0));
  });

  it('imports SVG markup with colours, transforms, holes and strokes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
      <rect id="bg" x="0" y="0" width="100" height="100" fill="#ff0000"/>
      <g transform="translate(100 0)">
        <path d="M0 0h100v100H0z M25 25v50h50V25z" fill="#00f" fill-rule="evenodd"/>
      </g>
      <path d="M10 90 L190 90" stroke="#00ff00" stroke-width="4" fill="none"/>
      <circle cx="50" cy="50" r="10" fill="none"/>
    </svg>`;
    const result = importSvg(svg);
    expect(result.viewBox).toEqual([0, 0, 200, 100]);
    expect(result.paths.map((p) => p.sourceColor)).toEqual(['#ff0000', '#0000ff', '#00ff00']);
    expect(result.paths[0]!.name).toBe('bg');
    expect(result.paths[1]!.fillRule).toBe('evenodd');
    expect(result.paths[1]!.d.startsWith('M100 0')).toBe(true);
    expect(result.paths[2]!.stroke?.width).toBe(4);
    expect(result.skipped).toBe(1);
    expect(() => importSvg('<html></html>')).toThrow();
  });
});

describe('materials', () => {
  it('switches material type and applies textures once loaded', async () => {
    let calls = 0;
    const textures = new TextureLibrary(
      diskAssetSource,
      () => calls++,
      async () => new Texture(),
    );
    const library = new MaterialLibrary(textures);
    const physical = createMaterial('chrome', { id: 'm' });
    library.sync({ m: physical });
    expect(library.get('m').type).toBe('MeshPhysicalMaterial');

    const textured = {
      ...physical,
      textures: { ...physical.textures, map: 'builtin:fonts/inter/latin-400-normal' },
    };
    library.sync({ m: textured });
    await textures.whenReady();
    library.sync({ m: textured }, true);
    const material = library.get('m') as MeshPhysicalMaterial;
    expect(material.map).not.toBeNull();
    expect(calls).toBeGreaterThan(0);

    library.sync({
      m: {
        id: 'm',
        name: 'M',
        type: 'matcap',
        matcap: 'builtin:matcaps/clay-soft',
        color: '#ffffff',
        opacity: 1,
        flatShading: false,
      },
    });
    expect(library.get('m').type).toBe('MeshMatcapMaterial');
  });

  it('flags holographic materials for a distinct shader', () => {
    const library = new MaterialLibrary();
    library.sync({ h: createMaterial('holographic', { id: 'h' }) });
    const material = library.get('h') as MeshPhysicalMaterial;
    expect(material.userData.holographic).toBe(true);
    expect(material.customProgramCacheKey()).toBe('galbe-holo');
  });
});

/** A minimal GLB: one triangle, 2 units wide, buffer in the BIN chunk. */
function triangleGlb(): Uint8Array {
  const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1.5, 0]);
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [-1, 0, 0],
        max: [1, 1.5, 0],
      },
    ],
  });
  let jsonBytes = new TextEncoder().encode(json);
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = new TextEncoder().encode(json + ' '.repeat(pad));
  const bin = new Uint8Array(positions.buffer);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const o = 20 + jsonBytes.length;
  view.setUint32(o, bin.length, true);
  view.setUint32(o + 4, 0x004e4942, true);
  out.set(bin, o + 8);
  return out;
}

describe('SceneController v0.2 nodes', () => {
  it('renders primitives, shapes and models, normalising model size', async () => {
    const gltf = triangleGlb();
    const source = {
      ...diskAssetSource,
      async fetchBytes(uri: string) {
        if (uri.startsWith('asset:')) return gltf.buffer.slice(0) as ArrayBuffer;
        return diskAssetSource.fetchBytes(uri as never);
      },
    };
    const material = createMaterial('gold');
    const red = createMaterial('glossy-plastic');
    const sphere = createPrimitiveNode({ kind: 'torus', materialId: material.id });
    const shape = createShapeNode({
      materialId: material.id,
      viewBox: [0, 0, 100, 100],
      paths: [
        { id: 'a', d: 'M0 0L100 0L100 100Z', materialId: red.id },
        { id: 'b', d: 'M0 0L50 0L50 50Z' },
      ],
    });
    const model = createModelNode({
      materialId: material.id,
      source: 'asset:0123456789abcdef0123456789abcdef',
      format: 'glb',
      fitSize: 3,
      pivot: 'bottom',
      overrideMaterial: true,
    });
    let doc: GalbeDocument = produce(createStarterDocument(), (draft) => {
      draft.environment.hdri = null;
      addNode(draft, sphere, { materials: [material, red] });
      addNode(draft, shape);
      addNode(draft, model);
    });
    const controller = new SceneController({ assets: source });
    controller.attach(new Scene());
    controller.sync(doc);
    await controller.whenReady();
    controller.sync(doc);

    const meshes = (id: string) => {
      const out: Mesh[] = [];
      controller.objectOf(id)!.traverse((o) => o instanceof Mesh && out.push(o));
      return out;
    };
    expect(meshes(sphere.id)).toHaveLength(1);
    const parts = meshes(shape.id);
    expect(parts).toHaveLength(2);
    expect(parts[0]!.material).toBe(controller.materials.get(red.id));
    expect(parts[1]!.material).toBe(controller.materials.get(material.id));

    const modelBounds = controller.bounds(model.id)!;
    const size = modelBounds.getSize(modelBounds.min.clone());
    expect(size.x).toBeCloseTo(3);
    expect(modelBounds.min.y).toBeCloseTo(0);
    expect(meshes(model.id)[0]!.material).toBe(controller.materials.get(material.id));
    expect(controller.status.errors.size).toBe(0);

    // Changing only a path material keeps the geometry.
    const geometry = parts[0]!.geometry;
    doc = produce(doc, (draft) => {
      const node = draft.nodes.find((n) => n.id === shape.id);
      if (node?.type === 'shape') node.paths[0]!.materialId = material.id;
    });
    controller.sync(doc);
    expect(meshes(shape.id)[0]!.geometry).toBe(geometry);
    expect(meshes(shape.id)[0]!.material).toBe(controller.materials.get(material.id));
  });
});

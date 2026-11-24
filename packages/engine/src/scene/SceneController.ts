import {
  type GalbeDocument,
  isEffectivelyVisible,
  type ModelNode,
  type PrimitiveNode,
  type SceneNode,
  type ShapeNode,
  type TextNode,
} from '@galbe/core';
import {
  Box3,
  BufferGeometry,
  Group,
  type Material,
  Mesh,
  type Object3D,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { AssetSource } from '../assets/AssetSource.ts';
import { LutLibrary } from '../effects/luts.ts';
import {
  EnvironmentController,
  type HdriVariantResolver,
} from '../environment/EnvironmentController.ts';
import { FontLibrary } from '../fonts/FontLibrary.ts';
import { buildPrimitiveGeometry, primitiveBuildKey } from '../geometry/primitives.ts';
import { ReflectiveGround } from '../ground/ReflectiveGround.ts';
import { MaterialLibrary } from '../materials/MaterialLibrary.ts';
import { TextureLibrary } from '../materials/TextureLibrary.ts';
import { cloneModel, ModelLibrary } from '../models/ModelLibrary.ts';
import { CONTACT_SHADOW_LAYER, ContactShadows } from '../shadows/ContactShadows.ts';
import { buildShapeSoups, shapeBuildKey } from '../shapes/buildShapeGeometry.ts';
import { buildTextSoup, soupToGeometry, textBuildKey } from '../text/buildTextGeometry.ts';
import { LightsController } from './LightsController.ts';

const DEG = Math.PI / 180;

interface NodeEntry {
  node: SceneNode;
  object: Group;
  /** Text and primitives: the node's mesh. */
  mesh?: Mesh;
  /** Shapes: one mesh per path, by path id. */
  parts?: Map<string, Mesh>;
  /** Models: the normalised clone of the model template. */
  model?: {
    uri: string;
    inner: Group;
    clone: Object3D;
    original: Map<Mesh, Material | Material[]>;
  };
  buildKey?: string;
}

export interface SceneControllerOptions {
  assets: AssetSource;
  fonts?: FontLibrary;
  /** Called when something changed asynchronously (a font or HDRI finished loading). */
  onChange?: () => void;
  /** Provides 2K/4K versions of builtin HDRIs (see `Environment.resolution`). */
  hdriVariants?: HdriVariantResolver;
}

export interface SceneStatus {
  /** Fonts or environment maps still loading. */
  loading: number;
  /** Nodes whose geometry could not be built, with the reason. */
  errors: Map<string, string>;
}

/**
 * Keeps a three.js scene in sync with a Galbe document. Hosts call `sync(doc)` whenever
 * the document changes and `prepareFrame(renderer)` before each render.
 */
export class SceneController {
  /** Node objects. Each node is a Group (transform) holding its mesh. */
  readonly content = new Group();
  readonly contactShadows = new ContactShadows();
  readonly reflection = new ReflectiveGround();
  readonly lights = new LightsController();
  readonly textures: TextureLibrary;
  readonly materials: MaterialLibrary;
  readonly models: ModelLibrary;
  readonly luts: LutLibrary;
  readonly fonts: FontLibrary;
  readonly environment: EnvironmentController;
  readonly status: SceneStatus = { loading: 0, errors: new Map() };

  private readonly entries = new Map<string, NodeEntry>();
  private scene: Scene | null = null;
  private doc: GalbeDocument | null = null;
  private pending = new Set<Promise<unknown>>();
  private readonly onChange: () => void;

  constructor(options: SceneControllerOptions) {
    this.fonts = options.fonts ?? new FontLibrary(options.assets);
    this.onChange = options.onChange ?? (() => {});
    this.textures = new TextureLibrary(options.assets, () => {
      if (this.doc) this.materials.sync(this.doc.materials, true);
      this.status.loading = this.loadingCount();
      this.onChange();
    });
    this.materials = new MaterialLibrary(this.textures);
    this.models = new ModelLibrary(options.assets);
    this.luts = new LutLibrary(options.assets, () => this.onChange());
    this.environment = new EnvironmentController(
      options.assets,
      () => {
        this.resync();
        this.onChange();
      },
      options.hdriVariants,
    );
    this.content.name = 'GalbeContent';
  }

  /**
   * Adds the controller's objects to a scene. Hosts that mount `content` themselves (e.g.
   * React Three Fiber's `<primitive>`, to get pointer events) pass `{ content: false }`.
   */
  attach(scene: Scene, { content = true }: { content?: boolean } = {}): void {
    this.scene = scene;
    if (content) scene.add(this.content);
    scene.add(this.contactShadows.object, this.reflection.object, this.lights.object);
    if (this.doc) this.resync();
  }

  detach(): void {
    this.scene?.remove(
      this.content,
      this.contactShadows.object,
      this.reflection.object,
      this.lights.object,
    );
    this.scene = null;
  }

  get document(): GalbeDocument | null {
    return this.doc;
  }

  sync(doc: GalbeDocument): void {
    const previous = this.doc;
    this.doc = doc;
    this.materials.sync(doc.materials);

    let contentChanged =
      previous === null || previous.nodes !== doc.nodes || previous.materials !== doc.materials;
    const alive = new Set<string>();
    for (const node of doc.nodes) {
      alive.add(node.id);
      let entry = this.entries.get(node.id);
      if (!entry) {
        const object = new Group();
        object.userData.nodeId = node.id;
        entry = { node, object };
        this.entries.set(node.id, entry);
        contentChanged = true;
      }
      if (entry.node.type !== node.type) {
        this.clearEntry(entry);
        contentChanged = true;
      }
      entry.node = node;
      this.applyBase(entry, doc);
      if (node.type === 'text') this.updateText(entry, node);
      else if (node.type === 'primitive') this.updatePrimitive(entry, node);
      else if (node.type === 'shape') this.updateShape(entry, node);
      else if (node.type === 'model') this.updateModel(entry, node);
    }
    for (const [id, entry] of this.entries) {
      if (alive.has(id)) continue;
      entry.object.removeFromParent();
      this.clearEntry(entry);
      this.entries.delete(id);
      this.status.errors.delete(id);
      contentChanged = true;
    }
    for (const entry of this.entries.values()) {
      const parent = entry.node.parentId
        ? this.entries.get(entry.node.parentId)?.object
        : this.content;
      const target = parent ?? this.content;
      if (entry.object.parent !== target) target.add(entry.object);
    }

    if (this.scene) this.environment.apply(this.scene, doc.environment, doc.background);
    this.lights.sync(doc.lights);
    // Start loading LUTs now so exports never render a frame without them.
    for (const effect of doc.effects)
      if (effect.enabled && effect.type === 'lut' && typeof effect.params.lut === 'string')
        this.luts.get(effect.params.lut);
    if (contentChanged || previous?.ground !== doc.ground) {
      this.content.updateMatrixWorld(true);
      const bounds = this.bounds();
      this.contactShadows.update(
        doc.ground.contactShadow,
        bounds,
        doc.ground.offset,
        doc.ground.scale,
      );
      this.reflection.update(doc.ground, bounds);
    }
    this.status.loading = this.loadingCount();
  }

  private loadingCount(): number {
    return (
      this.pending.size +
      (this.environment.pending ? 1 : 0) +
      this.textures.pending +
      this.luts.pending
    );
  }

  /** Re-applies the last document (after an async load). */
  resync(): void {
    if (this.doc) {
      const doc = this.doc;
      this.doc = null;
      this.sync(doc);
    }
  }

  prepareFrame(renderer: WebGLRenderer): void {
    if (this.scene) this.contactShadows.render(renderer, this.scene);
  }

  /** Resolves when every font and HDRI requested so far has loaded (or failed). */
  async whenReady(): Promise<void> {
    while (
      this.pending.size ||
      this.environment.pending ||
      this.textures.pending ||
      this.luts.pending
    ) {
      await Promise.allSettled([...this.pending]);
      await this.textures.whenReady();
      await this.luts.whenReady();
      if (this.doc) await this.environment.ready(this.doc.environment);
    }
  }

  objectOf(nodeId: string): Group | undefined {
    return this.entries.get(nodeId)?.object;
  }

  /** The node an intersected object belongs to (walks up the hierarchy). */
  nodeIdOf(object: Object3D | null): string | undefined {
    for (let current = object; current; current = current.parent) {
      if (typeof current.userData.nodeId === 'string') return current.userData.nodeId;
    }
    return undefined;
  }

  /** World-space bounds of visible content (or one node), or null when empty. */
  bounds(nodeId?: string): Box3 | null {
    const box = new Box3();
    const root = nodeId ? this.objectOf(nodeId) : this.content;
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (object instanceof Mesh && object.geometry.boundingBox) {
        box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
    return box.isEmpty() ? null : box;
  }

  private applyBase(entry: NodeEntry, doc: GalbeDocument): void {
    const { node, object } = entry;
    object.name = node.name;
    object.position.set(...node.transform.position);
    object.rotation.set(
      node.transform.rotation[0] * DEG,
      node.transform.rotation[1] * DEG,
      node.transform.rotation[2] * DEG,
    );
    object.scale.set(...node.transform.scale);
    object.visible = node.visible && isEffectivelyVisible(doc, node.id);
  }

  private updateText(entry: NodeEntry, node: TextNode): void {
    const face = this.fonts.get(node.font);
    if (!face) {
      if (!this.fonts.failed(node.font)) this.track(this.fonts.load(node.font));
      else this.status.errors.set(node.id, `Font "${node.font.family}" could not be loaded.`);
      if (!entry.mesh) this.ensureMesh(entry);
    } else {
      const key = textBuildKey(face, node);
      if (key !== entry.buildKey) {
        entry.buildKey = key;
        const mesh = this.ensureMesh(entry);
        try {
          const { soup } = buildTextSoup(face, node);
          mesh.geometry.dispose();
          mesh.geometry = soupToGeometry(soup);
          this.status.errors.delete(node.id);
        } catch (error) {
          this.status.errors.set(node.id, error instanceof Error ? error.message : String(error));
          console.warn('[galbe] text build failed', error);
        }
      }
    }
    this.applyMeshLook(this.ensureMesh(entry), node.materialId, node.castShadow);
  }

  private updatePrimitive(entry: NodeEntry, node: PrimitiveNode): void {
    const key = primitiveBuildKey(node);
    const mesh = this.ensureMesh(entry);
    if (key !== entry.buildKey) {
      entry.buildKey = key;
      try {
        mesh.geometry.dispose();
        mesh.geometry = buildPrimitiveGeometry(node);
        this.status.errors.delete(node.id);
      } catch (error) {
        this.status.errors.set(node.id, error instanceof Error ? error.message : String(error));
      }
    }
    this.applyMeshLook(mesh, node.materialId, node.castShadow);
  }

  private updateShape(entry: NodeEntry, node: ShapeNode): void {
    const key = shapeBuildKey(node);
    entry.parts ??= new Map();
    if (key !== entry.buildKey) {
      entry.buildKey = key;
      for (const mesh of entry.parts.values()) {
        mesh.geometry.dispose();
        mesh.removeFromParent();
      }
      entry.parts.clear();
      try {
        for (const { pathId, soup } of buildShapeSoups(node)) {
          const mesh = new Mesh(soupToGeometry(soup), this.materials.fallback);
          mesh.userData.nodeId = node.id;
          mesh.userData.pathId = pathId;
          entry.object.add(mesh);
          entry.parts.set(pathId, mesh);
        }
        this.status.errors.delete(node.id);
      } catch (error) {
        this.status.errors.set(node.id, error instanceof Error ? error.message : String(error));
        console.warn('[galbe] shape build failed', error);
      }
    }
    const byId = new Map(node.paths.map((path) => [path.id, path]));
    for (const [pathId, mesh] of entry.parts) {
      const path = byId.get(pathId);
      this.applyMeshLook(mesh, path?.materialId ?? node.materialId, node.castShadow);
    }
  }

  private updateModel(entry: NodeEntry, node: ModelNode): void {
    const model = this.models.get(node.source);
    if (model === undefined) {
      this.track(this.models.load(node.source, node.format));
      return;
    }
    if (model === null) {
      this.status.errors.set(
        node.id,
        this.models.error(node.source) ?? 'Model could not be loaded.',
      );
      return;
    }
    this.status.errors.delete(node.id);
    if (entry.model?.uri !== node.source) {
      if (entry.model) entry.object.remove(entry.model.inner);
      const inner = new Group();
      const clone = cloneModel(model.scene);
      const original = new Map<Mesh, Material | Material[]>();
      clone.traverse((object) => {
        if (object instanceof Mesh) {
          object.userData.nodeId = node.id;
          original.set(object, object.material);
        }
      });
      inner.add(clone);
      entry.object.add(inner);
      entry.model = { uri: node.source, inner, clone, original };
    }
    // Normalise scale and pivot from the template bounds.
    const { inner, original } = entry.model;
    const size = model.bounds.getSize(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const scale = node.fitSize > 0 && longest > 0 ? node.fitSize / longest : 1;
    const center = model.bounds.getCenter(new Vector3());
    const pivot =
      node.pivot === 'original'
        ? new Vector3()
        : node.pivot === 'bottom'
          ? new Vector3(center.x, model.bounds.min.y, center.z)
          : center;
    inner.scale.setScalar(scale);
    inner.position.copy(pivot).multiplyScalar(-scale);
    for (const [mesh, material] of original) {
      mesh.material = node.overrideMaterial ? this.materials.get(node.materialId) : material;
      mesh.castShadow = node.castShadow;
      if (node.castShadow) mesh.layers.enable(CONTACT_SHADOW_LAYER);
      else mesh.layers.disable(CONTACT_SHADOW_LAYER);
    }
  }

  private applyMeshLook(mesh: Mesh, materialId: string, castShadow: boolean): void {
    mesh.material = this.materials.get(materialId);
    mesh.castShadow = castShadow;
    if (castShadow) mesh.layers.enable(CONTACT_SHADOW_LAYER);
    else mesh.layers.disable(CONTACT_SHADOW_LAYER);
  }

  private clearEntry(entry: NodeEntry): void {
    if (entry.mesh) {
      entry.mesh.geometry.dispose();
      entry.mesh.removeFromParent();
      entry.mesh = undefined;
    }
    if (entry.parts) {
      for (const mesh of entry.parts.values()) {
        mesh.geometry.dispose();
        mesh.removeFromParent();
      }
      entry.parts = undefined;
    }
    if (entry.model) {
      entry.model.inner.removeFromParent();
      entry.model = undefined;
    }
    entry.buildKey = undefined;
  }

  private ensureMesh(entry: NodeEntry): Mesh {
    if (!entry.mesh) {
      entry.mesh = new Mesh(new BufferGeometry(), this.materials.fallback);
      entry.mesh.userData.nodeId = entry.node.id;
      entry.object.add(entry.mesh);
    }
    return entry.mesh;
  }

  private track(promise: Promise<unknown>): void {
    if (this.pending.has(promise)) return;
    this.pending.add(promise);
    const done = () => {
      this.pending.delete(promise);
      this.resync();
      this.onChange();
    };
    promise.then(done, done);
  }

  dispose(): void {
    this.detach();
    for (const entry of this.entries.values()) this.clearEntry(entry);
    this.entries.clear();
    this.materials.dispose();
    this.textures.dispose();
    this.models.dispose();
    this.luts.dispose();
    this.contactShadows.dispose();
    this.reflection.dispose();
    this.environment.dispose();
    this.lights.dispose();
  }
}

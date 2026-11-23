import {
  type GalbeDocument,
  isEffectivelyVisible,
  type SceneNode,
  type TextNode,
} from '@galbe/core';
import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { AssetSource } from '../assets/AssetSource.ts';
import { EnvironmentController } from '../environment/EnvironmentController.ts';
import { FontLibrary } from '../fonts/FontLibrary.ts';
import { MaterialLibrary } from '../materials/MaterialLibrary.ts';
import { CONTACT_SHADOW_LAYER, ContactShadows } from '../shadows/ContactShadows.ts';
import { buildTextSoup, soupToGeometry, textBuildKey } from '../text/buildTextGeometry.ts';
import { LightsController } from './LightsController.ts';

const DEG = Math.PI / 180;

interface NodeEntry {
  node: SceneNode;
  object: Group;
  mesh?: Mesh;
  buildKey?: string;
}

export interface SceneControllerOptions {
  assets: AssetSource;
  fonts?: FontLibrary;
  /** Called when something changed asynchronously (a font or HDRI finished loading). */
  onChange?: () => void;
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
  readonly lights = new LightsController();
  readonly materials = new MaterialLibrary();
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
    this.environment = new EnvironmentController(options.assets, () => {
      this.resync();
      this.onChange();
    });
    this.content.name = 'GalbeContent';
  }

  /**
   * Adds the controller's objects to a scene. Hosts that mount `content` themselves (e.g.
   * React Three Fiber's `<primitive>`, to get pointer events) pass `{ content: false }`.
   */
  attach(scene: Scene, { content = true }: { content?: boolean } = {}): void {
    this.scene = scene;
    if (content) scene.add(this.content);
    scene.add(this.contactShadows.object, this.lights.object);
    if (this.doc) this.resync();
  }

  detach(): void {
    this.scene?.remove(this.content, this.contactShadows.object, this.lights.object);
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
      entry.node = node;
      this.applyBase(entry, doc);
      if (node.type === 'text') this.updateText(entry, node);
    }
    for (const [id, entry] of this.entries) {
      if (alive.has(id)) continue;
      entry.object.removeFromParent();
      entry.mesh?.geometry.dispose();
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
    if (contentChanged || previous?.ground !== doc.ground) {
      this.content.updateMatrixWorld(true);
      this.contactShadows.update(
        doc.ground.contactShadow,
        this.bounds(),
        doc.ground.offset,
        doc.ground.scale,
      );
    }
    this.status.loading = this.pending.size + (this.environment.pending ? 1 : 0);
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
    while (this.pending.size || this.environment.pending) {
      await Promise.allSettled([...this.pending]);
      if (this.doc) await this.environment.ready(this.doc.environment.hdri);
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
    const mesh = this.ensureMesh(entry);
    mesh.material = this.materials.get(node.materialId);
    mesh.castShadow = node.castShadow;
    if (node.castShadow) mesh.layers.enable(CONTACT_SHADOW_LAYER);
    else mesh.layers.disable(CONTACT_SHADOW_LAYER);
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
    for (const entry of this.entries.values()) entry.mesh?.geometry.dispose();
    this.entries.clear();
    this.materials.dispose();
    this.contactShadows.dispose();
    this.environment.dispose();
    this.lights.dispose();
  }
}

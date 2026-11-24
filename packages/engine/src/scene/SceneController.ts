import {
  type EvaluatedScene,
  evaluateScene,
  type GalbeDocument,
  isAnimated,
  isEffectivelyVisible,
  type ModelNode,
  type PartMotion,
  type PrimitiveNode,
  partTransform,
  type SceneNode,
  type ShapeNode,
  type TextNode,
} from '@galbe/core';
import {
  Box3,
  type BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  type Scene,
  type Texture,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { AssetSource } from '../assets/AssetSource.ts';
import { BackgroundLayer } from '../background/BackgroundLayer.ts';
import { LutLibrary } from '../effects/luts.ts';
import {
  EnvironmentController,
  type HdriVariantResolver,
} from '../environment/EnvironmentController.ts';
import { FontLibrary, fontRefKey } from '../fonts/FontLibrary.ts';
import { buildPrimitiveGeometry, primitiveBuildKey } from '../geometry/primitives.ts';
import { ReflectiveGround } from '../ground/ReflectiveGround.ts';
import { MaterialLibrary } from '../materials/MaterialLibrary.ts';
import { TextureLibrary } from '../materials/TextureLibrary.ts';
import { VideoLibrary } from '../media/VideoLibrary.ts';
import { cloneModel, ModelLibrary } from '../models/ModelLibrary.ts';
import { CONTACT_SHADOW_LAYER, ContactShadows } from '../shadows/ContactShadows.ts';
import { buildShapeSoups, shapeBuildKey } from '../shapes/buildShapeGeometry.ts';
import { buildTextSoup, soupToGeometry, textBuildKey } from '../text/buildTextGeometry.ts';
import type { GeometryWorkerClient } from '../worker/GeometryWorkerClient.ts';
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
  /** Text: the built (rest) vertex data, for per-letter motion. */
  rest?: { position: Float32Array; normal: Float32Array; centers: Float32Array; count: number };
  /** Per-part motion currently applied (so it can be undone). */
  partsApplied?: boolean;
}

const DEG_TO_RAD = Math.PI / 180;
const partMatrix = new Matrix4();
const partQuaternion = new Quaternion();
const partEuler = new Euler();
const partScale = new Vector3();
const partOffset = new Vector3();
const partCenter = new Vector3();
const shiftMatrix = new Matrix4();
const vertex = new Vector3();

export interface SceneControllerOptions {
  assets: AssetSource;
  fonts?: FontLibrary;
  /** Called when something changed asynchronously (a font or HDRI finished loading). */
  onChange?: () => void;
  /** Provides 2K/4K versions of builtin HDRIs (see `Environment.resolution`). */
  hdriVariants?: HdriVariantResolver;
  /** Builds text and shape geometry off the main thread (falls back when it fails). */
  geometry?: GeometryWorkerClient;
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
  /** Gradient, image and video backgrounds (Cover). */
  readonly background = new BackgroundLayer();
  readonly videos: VideoLibrary;
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
  private videoUris = new Set<string>();
  /** Base document whose (un-animated) content placed the ground. */
  private groundSource: { nodes: unknown; ground: unknown; materials: unknown } | null = null;
  private lastEvaluated: EvaluatedScene | null = null;
  /** Last `syncAt` call, so async loads re-apply animation too. */
  private lastFrame: { doc: GalbeDocument; time: number } | null = null;
  private readonly geometry: GeometryWorkerClient | null;

  constructor(options: SceneControllerOptions) {
    this.fonts = options.fonts ?? new FontLibrary(options.assets);
    this.onChange = options.onChange ?? (() => {});
    this.geometry = options.geometry ?? null;
    this.textures = new TextureLibrary(options.assets, () => {
      if (this.doc) {
        this.materials.sync(this.doc.materials, true);
        this.syncBackground(this.doc);
      }
      this.status.loading = this.loadingCount();
      this.onChange();
    });
    this.videos = new VideoLibrary(options.assets, () => {
      this.background.updateMediaTransform();
      this.status.loading = this.loadingCount();
      this.onChange();
    });
    this.textures.external = (uri) =>
      this.videoUris.has(uri) ? this.videos.texture(uri) : undefined;
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
    scene.add(
      this.background.mesh,
      this.contactShadows.object,
      this.reflection.object,
      this.lights.object,
    );
    if (this.doc) this.resync();
  }

  detach(): void {
    this.scene?.remove(
      this.background.mesh,
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

  /**
   * Shows the document at timeline time `t` (seconds): evaluates keyframes and motions,
   * syncs the result, applies per-letter motion and moves video clips. Deterministic.
   */
  syncAt(doc: GalbeDocument, t: number): EvaluatedScene {
    this.lastFrame = { doc, time: t };
    if (!isAnimated(doc)) {
      this.groundSource = null;
      this.sync(doc, { frame: true });
      this.applyParts({});
      this.videos.setTime(t);
      this.lastEvaluated = { doc, parts: {}, time: t };
      return this.lastEvaluated;
    }
    const evaluated = evaluateScene(doc, t);
    // The ground stays where the un-animated content puts it, so a floating object's
    // shadow softens instead of following it.
    const source = this.groundSource;
    if (
      !source ||
      source.nodes !== doc.nodes ||
      source.ground !== doc.ground ||
      source.materials !== doc.materials
    ) {
      this.sync(doc, { frame: true });
      this.groundSource = { nodes: doc.nodes, ground: doc.ground, materials: doc.materials };
    }
    this.sync(evaluated.doc, { placeGround: false, frame: true });
    this.applyParts(evaluated.parts);
    this.contactShadows.invalidate();
    this.videos.setTime(t);
    this.lastEvaluated = evaluated;
    return evaluated;
  }

  /** The last evaluated frame (see `syncAt`). */
  get evaluated(): EvaluatedScene | null {
    return this.lastEvaluated;
  }

  /** Free-running video playback while the host plays the timeline. */
  setPlaying(playing: boolean): void {
    this.videos.setPlaying(playing);
  }

  sync(
    doc: GalbeDocument,
    { placeGround = true, frame = false }: { placeGround?: boolean; frame?: boolean } = {},
  ): void {
    if (!frame) this.lastFrame = null;
    const previous = this.doc;
    this.doc = doc;
    this.videoUris = new Set(
      Object.values(doc.assets)
        .filter((asset) => asset.kind === 'video')
        .map((asset) => `asset:${asset.id}`),
    );
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
    this.syncBackground(doc);
    this.lights.sync(doc.lights);
    // Start loading LUTs now so exports never render a frame without them.
    for (const effect of doc.effects)
      if (effect.enabled && effect.type === 'lut' && typeof effect.params.lut === 'string')
        this.luts.get(effect.params.lut);
    if (placeGround && (contentChanged || previous?.ground !== doc.ground)) {
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

  private syncBackground(doc: GalbeDocument): void {
    const background = doc.background;
    let media: Texture | null = null;
    const active: string[] = [];
    if (background.type === 'image' && background.image)
      media = this.textures.get(background.image);
    else if (background.type === 'video' && background.video) {
      media = this.videos.texture(background.video, background);
      active.push(background.video);
    }
    for (const material of Object.values(doc.materials)) {
      if (material.type !== 'physical') continue;
      for (const uri of Object.values(material.textures))
        if (uri && this.videoUris.has(uri)) active.push(uri);
    }
    this.videos.setActive(active);
    this.background.sync(background, doc.frame, media);
  }

  /** Per-letter (text) and per-path (shape) motion, relative to each part's centre. */
  private applyParts(parts: Record<string, PartMotion[]>): void {
    for (const entry of this.entries.values()) {
      const motions = parts[entry.node.id];
      if (!motions?.length) {
        if (entry.partsApplied) this.resetParts(entry);
        continue;
      }
      entry.partsApplied = true;
      if (entry.node.type === 'text' && entry.mesh && entry.rest) {
        const { position, normal, centers, count } = entry.rest;
        const geometry = entry.mesh.geometry;
        const positionAttribute = geometry.getAttribute('position') as BufferAttribute;
        const normalAttribute = geometry.getAttribute('normal') as BufferAttribute;
        const part = geometry.getAttribute('part') as BufferAttribute | undefined;
        if (!part || positionAttribute.count * 3 !== position.length) continue;
        const outPosition = positionAttribute.array as Float32Array;
        const outNormal = normalAttribute.array as Float32Array;
        const matrices: Matrix4[] = [];
        const rotations: Quaternion[] = [];
        for (let g = 0; g < count; g++) {
          const transform = partTransform(motions, g, count);
          partEuler.set(
            transform.rotation[0] * DEG_TO_RAD,
            transform.rotation[1] * DEG_TO_RAD,
            transform.rotation[2] * DEG_TO_RAD,
          );
          partQuaternion.setFromEuler(partEuler);
          partCenter.set(centers[g * 3]!, centers[g * 3 + 1]!, centers[g * 3 + 2]!);
          partOffset.set(...transform.offset).add(partCenter);
          // Scale 0 collapses the glyph to a point: its triangles have no area and never draw.
          partScale.setScalar(Math.max(transform.scale, 0));
          const matrix = new Matrix4().compose(partOffset, partQuaternion, partScale);
          matrix.multiply(shiftMatrix.makeTranslation(-partCenter.x, -partCenter.y, -partCenter.z));
          matrices.push(matrix);
          rotations.push(partQuaternion.clone());
        }
        const partArray = part.array as Float32Array;
        for (let v = 0; v < partArray.length; v++) {
          const g = partArray[v]!;
          const matrix = matrices[g];
          if (!matrix) continue;
          vertex
            .fromArray(position, v * 3)
            .applyMatrix4(matrix)
            .toArray(outPosition, v * 3);
          vertex
            .fromArray(normal, v * 3)
            .applyQuaternion(rotations[g]!)
            .toArray(outNormal, v * 3);
        }
        positionAttribute.needsUpdate = true;
        normalAttribute.needsUpdate = true;
        // Bounds stay those of the rest pose, so the ground and framing do not jitter.
        entry.mesh.frustumCulled = false;
      } else if (entry.node.type === 'shape' && entry.parts) {
        const meshes = [...entry.parts.values()];
        const count = meshes.length;
        meshes.forEach((mesh, index) => {
          const transform = partTransform(motions, index, count);
          const box = mesh.geometry.boundingBox;
          if (!box) return;
          box.getCenter(partCenter);
          partEuler.set(
            transform.rotation[0] * DEG_TO_RAD,
            transform.rotation[1] * DEG_TO_RAD,
            transform.rotation[2] * DEG_TO_RAD,
          );
          partQuaternion.setFromEuler(partEuler);
          partOffset.set(...transform.offset).add(partCenter);
          // A fully hidden path is not drawn (a zero-scale matrix has no normal matrix).
          mesh.visible = transform.scale > 1e-4;
          partScale.setScalar(Math.max(transform.scale, 1e-4));
          partMatrix.compose(partOffset, partQuaternion, partScale);
          partMatrix.multiply(
            shiftMatrix.makeTranslation(-partCenter.x, -partCenter.y, -partCenter.z),
          );
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(partMatrix);
          mesh.matrixWorldNeedsUpdate = true;
        });
      }
    }
  }

  private resetParts(entry: NodeEntry): void {
    entry.partsApplied = false;
    if (entry.mesh && entry.rest) {
      const geometry = entry.mesh.geometry;
      const positionAttribute = geometry.getAttribute('position') as BufferAttribute | undefined;
      const normalAttribute = geometry.getAttribute('normal') as BufferAttribute | undefined;
      if (positionAttribute && positionAttribute.array.length === entry.rest.position.length) {
        (positionAttribute.array as Float32Array).set(entry.rest.position);
        (normalAttribute!.array as Float32Array).set(entry.rest.normal);
        positionAttribute.needsUpdate = true;
        normalAttribute!.needsUpdate = true;
      }
      entry.mesh.frustumCulled = true;
    }
    for (const mesh of entry.parts?.values() ?? []) {
      mesh.visible = true;
      mesh.matrixAutoUpdate = true;
      mesh.matrix.identity();
      mesh.updateMatrix();
    }
  }

  private loadingCount(): number {
    return (
      this.videos.pending +
      this.pending.size +
      (this.environment.pending ? 1 : 0) +
      this.textures.pending +
      this.luts.pending
    );
  }

  /** Re-applies the last document (after an async load). */
  resync(): void {
    if (this.lastFrame) {
      const { doc, time } = this.lastFrame;
      this.doc = null;
      this.groundSource = null;
      this.syncAt(doc, time);
    } else if (this.doc) {
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
      this.luts.pending ||
      this.videos.pending
    ) {
      await Promise.allSettled([...this.pending]);
      await this.videos.whenReady();
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

  private get worker(): GeometryWorkerClient | null {
    return this.geometry && !this.geometry.broken ? this.geometry : null;
  }

  /** Text built in the worker: the previous geometry stays until the new one arrives. */
  private updateTextAsync(entry: NodeEntry, node: TextNode, worker: GeometryWorkerClient): void {
    const key = textBuildKey({ key: fontRefKey(node.font), fonts: [] }, node);
    this.ensureMesh(entry);
    if (key === entry.buildKey) return;
    entry.buildKey = key;
    const {
      text,
      font,
      size,
      depth,
      curveSegments,
      bevel,
      letterSpacing,
      lineHeight,
      align,
      deform,
    } = node;
    this.track(
      worker
        .buildText({
          text,
          font,
          size,
          depth,
          curveSegments,
          bevel,
          letterSpacing,
          lineHeight,
          align,
          deform,
        })
        .then(
          ({ soup, glyphCount }) => {
            if (entry.buildKey !== key || !entry.mesh) return;
            entry.mesh.geometry.dispose();
            entry.mesh.geometry = soupToGeometry(soup);
            entry.rest = restPose(soup.position, soup.normal, soup.part, glyphCount);
            entry.partsApplied = false;
            this.status.errors.delete(node.id);
          },
          (error: unknown) => {
            if (entry.buildKey !== key) return;
            // Retry on the main thread if the worker itself died.
            if (worker.broken) entry.buildKey = undefined;
            else
              this.status.errors.set(
                node.id,
                error instanceof Error ? error.message : String(error),
              );
          },
        ),
    );
  }

  private updateText(entry: NodeEntry, node: TextNode): void {
    const worker = this.worker;
    if (worker) {
      this.updateTextAsync(entry, node, worker);
      this.applyMeshLook(this.ensureMesh(entry), node.materialId, node.castShadow);
      return;
    }
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
          const { soup, glyphCount } = buildTextSoup(face, node);
          mesh.geometry.dispose();
          mesh.geometry = soupToGeometry(soup);
          entry.rest = restPose(soup.position, soup.normal, soup.part, glyphCount);
          entry.partsApplied = false;
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

  private replaceShapeParts(
    entry: NodeEntry,
    node: ShapeNode,
    parts: { pathId: string; soup: import('../geometry/soup.ts').TriangleSoup }[],
  ): void {
    entry.parts ??= new Map();
    for (const mesh of entry.parts.values()) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    entry.parts.clear();
    entry.partsApplied = false;
    for (const { pathId, soup } of parts) {
      const mesh = new Mesh(soupToGeometry(soup), this.materials.fallback);
      mesh.userData.nodeId = node.id;
      mesh.userData.pathId = pathId;
      entry.object.add(mesh);
      entry.parts.set(pathId, mesh);
    }
  }

  private updateShape(entry: NodeEntry, node: ShapeNode): void {
    const key = shapeBuildKey(node);
    entry.parts ??= new Map();
    const worker = this.worker;
    if (worker && key !== entry.buildKey) {
      entry.buildKey = key;
      const { paths, viewBox, size, depth, curveSegments, bevel, layerSpacing, deform } = node;
      this.track(
        worker
          .buildShape({ paths, viewBox, size, depth, curveSegments, bevel, layerSpacing, deform })
          .then(
            (parts) => {
              if (entry.buildKey !== key) return;
              this.replaceShapeParts(entry, node, parts);
              this.status.errors.delete(node.id);
            },
            (error: unknown) => {
              if (entry.buildKey !== key) return;
              if (worker.broken) entry.buildKey = undefined;
              else
                this.status.errors.set(
                  node.id,
                  error instanceof Error ? error.message : String(error),
                );
            },
          ),
      );
    } else if (key !== entry.buildKey) {
      entry.buildKey = key;
      try {
        this.replaceShapeParts(entry, node, buildShapeSoups(node));
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
    this.background.dispose();
    this.videos.dispose();
  }
}

/** Copies a mesh's rest pose and the centre of each part (glyph). */
function restPose(
  position: Float32Array,
  normal: Float32Array,
  part: Float32Array,
  count: number,
): NonNullable<NodeEntry['rest']> {
  const min = new Float32Array(count * 3).fill(Infinity);
  const max = new Float32Array(count * 3).fill(-Infinity);
  for (let v = 0; v < part.length; v++) {
    const g = part[v]!;
    if (g >= count) continue;
    for (let a = 0; a < 3; a++) {
      const value = position[v * 3 + a]!;
      if (value < min[g * 3 + a]!) min[g * 3 + a] = value;
      if (value > max[g * 3 + a]!) max[g * 3 + a] = value;
    }
  }
  const centers = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++)
    centers[i] = Number.isFinite(min[i]!) ? (min[i]! + max[i]!) / 2 : 0;
  return { position: position.slice(), normal: normal.slice(), centers, count };
}

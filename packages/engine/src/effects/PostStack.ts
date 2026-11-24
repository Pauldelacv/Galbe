import {
  type EffectSpec,
  type EffectStage,
  getEffectDefinition,
  type RenderSettings,
  resolveEffectParams,
} from '@galbe/core';
import {
  BloomEffect,
  DepthOfFieldEffect,
  type Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import {
  type Camera,
  type Data3DTexture,
  HalfFloatType,
  NoToneMapping,
  PerspectiveCamera,
  type Scene,
  Vector2,
  type WebGLRenderer,
} from 'three';
import {
  createAdjustEffect,
  createAsciiEffect,
  createChromaticAberrationEffect,
  createDitherEffect,
  createGlitchEffect,
  createGrainEffect,
  createHalftoneEffect,
  createLutEffect,
  createPixelEffect,
  createVignetteEffect,
  type FrameInfo,
  type GalbeEffect,
} from './customEffects.ts';

export type EffectParams = Record<string, number | boolean | string>;

export interface EffectContext {
  /** Camera distance to its target, for auto focus. */
  focusDistance: number;
  /** Resolves a LUT asset URI to a 3D texture (async; null while loading). */
  lut: (uri: string) => Data3DTexture | null;
}

/**
 * An effect implementation. `create` builds the postprocessing effect, `update` applies
 * params each sync (cheap: uniforms only). Register more with `registerEffect`.
 */
export interface EffectImplementation {
  create(camera: Camera): Effect;
  update(effect: Effect, params: EffectParams, frame: FrameInfo, context: EffectContext): void;
}

const registry = new Map<string, EffectImplementation>();

export function registerEffect(type: string, implementation: EffectImplementation): void {
  registry.set(type, implementation);
}

export function hasEffectImplementation(type: string): boolean {
  return registry.has(type);
}

const SELECT_VALUES: Record<string, Record<string, number>> = {
  mode: { mono: 0, cmyk: 1, color: 2 },
  shape: { dot: 0, line: 1, square: 2 },
  pattern: { bayer2: 2, bayer4: 4, bayer8: 8 },
  palette: { color: 0, mono: 1, duotone: 2 },
  colorMode: { original: 0, mono: 1 },
};

/** Copies params onto a GalbeEffect's uniforms (selects mapped to numbers). */
function galbe(
  factory: () => GalbeEffect,
  rename: Record<string, string> = {},
): EffectImplementation {
  return {
    create: factory,
    update(effect, params, frame) {
      const target = effect as GalbeEffect;
      target.setFrame(frame);
      for (const [key, value] of Object.entries(params)) {
        const mapped = typeof value === 'string' && SELECT_VALUES[key]?.[value];
        target.set(rename[key] ?? key, mapped !== undefined && mapped !== false ? mapped : value);
      }
    },
  };
}

registerEffect('bloom', {
  create: () => new BloomEffect({ mipmapBlur: true, levels: 8 }),
  update(effect, p) {
    const bloom = effect as BloomEffect;
    bloom.intensity = Number(p.intensity);
    bloom.luminanceMaterial.threshold = Number(p.threshold);
    bloom.luminanceMaterial.smoothing = Number(p.smoothing);
    bloom.mipmapBlurPass.radius = Number(p.radius);
  },
});

registerEffect('dof', {
  create: (camera) => new DepthOfFieldEffect(camera, { resolutionScale: 0.5 }),
  update(effect, p, frame, context) {
    const dof = effect as DepthOfFieldEffect;
    const cocMaterial = dof.cocMaterial;
    cocMaterial.focusDistance = p.autoFocus ? context.focusDistance : Number(p.focusDistance);
    cocMaterial.focusRange = Number(p.focusRange);
    // Bokeh is defined in document pixels; the blur kernel works at half resolution.
    dof.bokehScale = (Number(p.bokeh) * frame.pxScale) / 4;
  },
});

registerEffect('adjust', galbe(createAdjustEffect));
registerEffect('chromaticAberration', galbe(createChromaticAberrationEffect));
registerEffect('vignette', galbe(createVignetteEffect));
registerEffect('grain', galbe(createGrainEffect));
registerEffect('pixel', galbe(createPixelEffect));
registerEffect('halftone', galbe(createHalftoneEffect, { mix: 'mix_' }));
registerEffect('dither', galbe(createDitherEffect));
registerEffect('ascii', galbe(createAsciiEffect));
registerEffect('glitch', galbe(createGlitchEffect));
registerEffect('lut', {
  create: () => createLutEffect(null),
  update(effect, p, frame, context) {
    const lut = effect as GalbeEffect;
    lut.setFrame(frame);
    const texture = context.lut(String(p.lut));
    lut.set('lut', texture);
    lut.set('lutSize', texture?.image.width ?? 2);
    lut.set('intensity', texture ? Number(p.intensity) : 0);
  },
});

const TONE_MODES: Record<RenderSettings['toneMapping'], number> = {
  neutral: ToneMappingMode.NEUTRAL,
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  none: ToneMappingMode.LINEAR,
};

interface Slot {
  spec: EffectSpec;
  effect: Effect;
  implementation: EffectImplementation;
  stage: EffectStage;
}

export interface PostRenderView {
  fullWidth: number;
  fullHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * The post-processing stack: scene → HDR effects (bloom, DOF) → tone mapping → display
 * effects, each display effect in its own pass so they can sample their neighbours. When
 * no effect is enabled, `active` is false and hosts render directly (zero overhead).
 */
export class PostStack {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  private slots: Slot[] = [];
  private passes: (EffectPass | RenderPass)[] = [];
  private signature = '';
  private effects: EffectSpec[] = [];
  private frameHeight = 1080;
  private context: EffectContext = { focusDistance: 7, lut: () => null };
  private readonly size = new Vector2();
  private pixelRatio = 0;
  private scene: Scene | null = null;
  private camera: Camera | null = null;

  constructor(private readonly renderer: WebGLRenderer) {}

  get active(): boolean {
    return this.effects.some(
      (effect) => effect.enabled && registry.has(effect.type) && getEffectDefinition(effect.type),
    );
  }

  /** Spatial support of the stack in document pixels (for export tile padding). */
  get support(): number {
    let support = 0;
    for (const effect of this.effects) {
      if (!effect.enabled) continue;
      const p = resolveEffectParams(effect);
      if (effect.type === 'bloom') support = Math.max(support, 160);
      if (effect.type === 'dof') support = Math.max(support, Number(p.bokeh) * 4);
      for (const key of ['size', 'cell', 'block', 'amount', 'split', 'pixelSize'])
        if (typeof p[key] === 'number' && key !== 'amount')
          support = Math.max(support, Number(p[key]));
      if (effect.type === 'chromaticAberration') support = Math.max(support, Number(p.amount));
    }
    return support;
  }

  sync(
    effects: readonly EffectSpec[],
    options: { frameHeight: number; render: RenderSettings; context: EffectContext },
  ): void {
    this.effects = [...effects];
    this.frameHeight = options.frameHeight;
    this.context = options.context;
    this.toneMapping.mode = TONE_MODES[options.render.toneMapping];
  }

  private ensure(scene: Scene, camera: Camera): EffectComposer {
    if (!this.composer) {
      this.composer = new EffectComposer(this.renderer, {
        frameBufferType: HalfFloatType,
        multisampling: Math.min(4, this.renderer.capabilities.maxSamples),
      });
    }
    const enabled = this.effects.filter(
      (effect) => effect.enabled && registry.has(effect.type) && getEffectDefinition(effect.type),
    );
    const ordered = [
      ...enabled.filter((e) => getEffectDefinition(e.type)!.stage === 'hdr'),
      ...enabled.filter((e) => getEffectDefinition(e.type)!.stage === 'display'),
    ];
    const signature = ordered.map((effect) => `${effect.id}:${effect.type}`).join('|');
    if (signature !== this.signature || scene !== this.scene || camera !== this.camera) {
      this.rebuild(ordered, scene, camera);
      this.signature = signature;
      this.scene = scene;
      this.camera = camera;
    } else {
      const byId = new Map(ordered.map((spec) => [spec.id, spec]));
      for (const slot of this.slots) slot.spec = byId.get(slot.spec.id) ?? slot.spec;
    }
    return this.composer;
  }

  private rebuild(ordered: EffectSpec[], scene: Scene, camera: Camera): void {
    const composer = this.composer!;
    composer.removeAllPasses();
    for (const pass of this.passes) pass.dispose();
    for (const slot of this.slots) slot.effect.dispose();
    this.slots = [];
    this.renderPass = new RenderPass(scene, camera);
    composer.addPass(this.renderPass);
    this.passes = [this.renderPass];
    for (const spec of ordered) {
      const implementation = registry.get(spec.type)!;
      const effect = implementation.create(camera);
      const stage = getEffectDefinition(spec.type)!.stage;
      this.slots.push({ spec, effect, implementation, stage });
    }
    const passes: EffectPass[] = [];
    for (const slot of this.slots.filter((s) => s.stage === 'hdr'))
      passes.push(new EffectPass(camera, slot.effect));
    passes.push(new EffectPass(camera, this.toneMapping));
    for (const slot of this.slots.filter((s) => s.stage === 'display'))
      passes.push(new EffectPass(camera, slot.effect));
    for (const pass of passes) composer.addPass(pass);
    this.passes.push(...passes);
    this.pixelRatio = 0; // force a resize
  }

  /**
   * Renders the scene through the stack into the renderer's canvas. `view` describes the
   * tile being rendered when exporting in tiles; it defaults to the whole canvas.
   */
  render(scene: Scene, camera: Camera, view?: PostRenderView): void {
    const composer = this.ensure(scene, camera);
    const size = this.renderer.getSize(new Vector2());
    const pixelRatio = this.renderer.getPixelRatio();
    if (!size.equals(this.size) || pixelRatio !== this.pixelRatio) {
      this.size.copy(size);
      this.pixelRatio = pixelRatio;
      composer.setSize(size.x, size.y, false);
    }
    const buffer = this.renderer.getDrawingBufferSize(new Vector2());
    const fullWidth = view?.fullWidth ?? buffer.x;
    const fullHeight = view?.fullHeight ?? buffer.y;
    const frame: FrameInfo = {
      fullWidth,
      fullHeight,
      offsetX: view?.offsetX ?? 0,
      offsetY: view?.offsetY ?? 0,
      width: buffer.x,
      height: buffer.y,
      pxScale: fullHeight / Math.max(this.frameHeight, 1),
    };
    for (const slot of this.slots) {
      slot.implementation.update(slot.effect, resolveEffectParams(slot.spec), frame, this.context);
    }
    if (camera instanceof PerspectiveCamera) {
      for (const slot of this.slots) {
        if (slot.effect instanceof DepthOfFieldEffect) slot.effect.mainCamera = camera;
      }
    }
    const toneMapping = this.renderer.toneMapping;
    this.renderer.toneMapping = NoToneMapping;
    try {
      composer.render();
    } finally {
      this.renderer.toneMapping = toneMapping;
    }
  }

  dispose(): void {
    for (const pass of this.passes) pass.dispose();
    this.passes = [];
    for (const slot of this.slots) slot.effect.dispose();
    this.slots = [];
    this.toneMapping.dispose();
    this.composer?.dispose();
    this.composer = null;
    this.signature = '';
  }
}

import {
  type Background,
  type Frame,
  MAX_GRADIENT_STOPS,
  MAX_MESH_POINTS,
  type MediaFit,
} from '@galbe/core';
import {
  BufferGeometry,
  type Camera,
  Float32BufferAttribute,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  type Texture,
  Uniform,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from 'three';

/**
 * GLSL shared by the in-scene background mesh and the post-processing composite:
 * `galbeBackground(p)` returns the *linear* background colour at frame point `p`
 * (0,0 = top-left, 1,1 = bottom-right). Gradients are defined and blended in sRGB like
 * CSS, then decoded.
 */
export const BACKGROUND_GLSL = /* glsl */ `
uniform int uBgKind;
uniform vec3 uBgColors[${MAX_GRADIENT_STOPS}];
uniform float uBgStops[${MAX_GRADIENT_STOPS}];
uniform int uBgCount;
uniform float uBgAngle;
uniform vec2 uBgCenter;
uniform float uBgRadius;
uniform vec2 uBgPoints[${MAX_MESH_POINTS}];
uniform float uBgSoftness;
uniform float uBgNoise;
uniform float uBgAspect;
uniform vec2 uBgFramePx;
uniform sampler2D uBgMap;
uniform bool uBgHasMap;
uniform vec4 uBgMapTransform;
uniform vec3 uBgFill;
uniform float uBgBrightness;

vec3 bgToLinear(const in vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
float bgHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 bgRamp(float t) {
  vec3 color = uBgColors[0];
  for (int i = 1; i < ${MAX_GRADIENT_STOPS}; i++) {
    if (i >= uBgCount) break;
    float a = uBgStops[i - 1];
    float b = uBgStops[i];
    float f = b > a ? clamp((t - a) / (b - a), 0.0, 1.0) : step(b, t);
    color = mix(color, uBgColors[i], f);
  }
  return color;
}
vec3 galbeBackground(vec2 p) {
  vec2 q = vec2(p.x * uBgAspect, p.y);
  vec3 srgb = vec3(0.0);
  if (uBgKind == 4) {
    if (!uBgHasMap) return bgToLinear(uBgFill);
    vec2 uv = (p - 0.5) * uBgMapTransform.xy + 0.5 - uBgMapTransform.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return bgToLinear(uBgFill);
    return texture2D(uBgMap, vec2(uv.x, 1.0 - uv.y)).rgb * uBgBrightness;
  }
  if (uBgKind == 1) {
    float a = radians(uBgAngle);
    vec2 dir = vec2(sin(a), -cos(a));
    float len = abs(uBgAspect * sin(a)) + abs(cos(a));
    float t = dot(q - vec2(uBgAspect * 0.5, 0.5), dir) / max(len, 1e-4) + 0.5;
    srgb = bgRamp(t);
  } else if (uBgKind == 2) {
    float halfDiagonal = 0.5 * sqrt(uBgAspect * uBgAspect + 1.0);
    vec2 c = vec2(uBgCenter.x * uBgAspect, uBgCenter.y);
    float t = length(q - c) / max(uBgRadius * halfDiagonal, 1e-4);
    srgb = bgRamp(t);
  } else if (uBgKind == 3) {
    vec3 sum = vec3(0.0);
    float weights = 0.0;
    for (int i = 0; i < ${MAX_MESH_POINTS}; i++) {
      if (i >= uBgCount) break;
      vec2 c = vec2(uBgPoints[i].x * uBgAspect, uBgPoints[i].y);
      float d = max(length(q - c), 1e-3);
      float w = pow(d, -2.5 / uBgSoftness);
      sum += uBgColors[i] * w;
      weights += w;
    }
    srgb = sum / max(weights, 1e-6);
  }
  // Dither in display space: hides banding on 8-bit outputs and video encoders.
  srgb += (bgHash(floor(p * uBgFramePx)) - 0.5) * uBgNoise * 0.1;
  return bgToLinear(clamp(srgb, 0.0, 1.0));
}
`;

const KIND = { gradient: { linear: 1, radial: 2, mesh: 3 }, media: 4 } as const;

export type BackgroundUniforms = Record<string, Uniform<unknown>>;

/** Fit of a `mediaAspect` image in a `frameAspect` frame, as UV scale (see the GLSL). */
export function mediaUvScale(
  fit: MediaFit,
  frameAspect: number,
  mediaAspect: number,
  zoom = 1,
): [number, number] {
  let sx = 1;
  let sy = 1;
  if (fit === 'cover') {
    sx = Math.min(1, frameAspect / mediaAspect);
    sy = Math.min(1, mediaAspect / frameAspect);
  } else if (fit === 'contain') {
    sx = Math.max(1, frameAspect / mediaAspect);
    sy = Math.max(1, mediaAspect / frameAspect);
  }
  return [sx / zoom, sy / zoom];
}

const hexToSrgb = (hex: string, into: Vector3): Vector3 => {
  const n = Number.parseInt(hex.slice(1), 16);
  return into.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

function mediaSize(texture: Texture | null): { width: number; height: number } | null {
  const image = texture?.image as
    | { videoWidth?: number; videoHeight?: number; width?: number; height?: number }
    | undefined;
  if (!image) return null;
  const width = image.videoWidth || image.width || 0;
  const height = image.videoHeight || image.height || 0;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * Gradient, image and video backgrounds. Drawn by a full-screen mesh at the back of the
 * scene (so glass refracts it and shadows fall on it), or composited by the effect stack
 * after tone mapping; both evaluate the same GLSL in full-frame coordinates, so exports
 * rendered in tiles have no seams.
 */
export class BackgroundLayer {
  readonly uniforms: BackgroundUniforms = {
    uBgKind: new Uniform(0),
    uBgColors: new Uniform(Array.from({ length: MAX_GRADIENT_STOPS }, () => new Vector3())),
    uBgStops: new Uniform(new Array<number>(MAX_GRADIENT_STOPS).fill(0)),
    uBgCount: new Uniform(0),
    uBgAngle: new Uniform(180),
    uBgCenter: new Uniform(new Vector2(0.5, 0.5)),
    uBgRadius: new Uniform(1),
    uBgPoints: new Uniform(Array.from({ length: MAX_MESH_POINTS }, () => new Vector2())),
    uBgSoftness: new Uniform(1),
    uBgNoise: new Uniform(0),
    uBgAspect: new Uniform(1),
    uBgFramePx: new Uniform(new Vector2(1080, 1080)),
    uBgMap: new Uniform<Texture | null>(null),
    uBgHasMap: new Uniform(false),
    uBgMapTransform: new Uniform(new Vector4(1, 1, 0, 0)),
    uBgFill: new Uniform(new Vector3()),
    uBgBrightness: new Uniform(1),
    uBgTarget: new Uniform(new Vector2(1, 1)),
    uBgView: new Uniform(new Vector4(0, 0, 1, 1)),
  };
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private spec: Background | null = null;
  private frame: Frame | null = null;
  private texture: Texture | null = null;
  private readonly size = new Vector2();

  constructor() {
    const geometry = new BufferGeometry();
    // One triangle covering the viewport.
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    const material = new ShaderMaterial({
      name: 'GalbeBackground',
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uBgTarget;
        uniform vec4 uBgView;
        ${BACKGROUND_GLSL}
        void main() {
          vec2 f = gl_FragCoord.xy / uBgTarget;
          vec2 p = vec2(uBgView.x + f.x * uBgView.z, uBgView.y + (1.0 - f.y) * uBgView.w);
          gl_FragColor = vec4(galbeBackground(p), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'GalbeBackgroundLayer';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10_000;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = (renderer, _scene, camera) => this.updateView(renderer, camera);
  }

  /** True when the background is a gradient, image or video. */
  get active(): boolean {
    return this.uniforms.uBgKind!.value !== 0;
  }

  /** Waits for nothing itself; media textures are owned by the caller. */
  sync(background: Background, frame: Frame, media: Texture | null): void {
    this.spec = background;
    this.frame = frame;
    this.texture = media;
    const u = this.uniforms;
    u.uBgAspect!.value = frame.width / frame.height;
    (u.uBgFramePx!.value as Vector2).set(frame.width, frame.height);
    u.uBgBrightness!.value = 1;
    if (background.type === 'gradient') {
      u.uBgKind!.value = KIND.gradient[background.kind];
      const colors = u.uBgColors!.value as Vector3[];
      const stops = u.uBgStops!.value as number[];
      if (background.kind === 'mesh') {
        const points = u.uBgPoints!.value as Vector2[];
        background.points.forEach((point, i) => {
          hexToSrgb(point.color, colors[i]!);
          points[i]!.set(point.position[0], point.position[1]);
        });
        u.uBgCount!.value = background.points.length;
      } else {
        const sorted = [...background.stops].sort((a, b) => a.position - b.position);
        sorted.forEach((stop, i) => {
          hexToSrgb(stop.color, colors[i]!);
          stops[i] = stop.position;
        });
        u.uBgCount!.value = sorted.length;
      }
      u.uBgAngle!.value = background.angle;
      (u.uBgCenter!.value as Vector2).set(background.center[0], background.center[1]);
      u.uBgRadius!.value = background.radius;
      u.uBgSoftness!.value = background.softness;
      u.uBgNoise!.value = background.noise;
      u.uBgMap!.value = null;
      u.uBgHasMap!.value = false;
    } else if (background.type === 'image' || background.type === 'video') {
      u.uBgKind!.value = KIND.media;
      u.uBgNoise!.value = 0;
      hexToSrgb(background.color, u.uBgFill!.value as Vector3);
      u.uBgBrightness!.value = background.brightness;
      u.uBgMap!.value = media;
      this.updateMediaTransform();
    } else {
      u.uBgKind!.value = 0;
      u.uBgMap!.value = null;
    }
    this.mesh.visible = this.active;
  }

  /** Recomputes the fit once the media knows its size (images load, videos get metadata). */
  updateMediaTransform(): void {
    const background = this.spec;
    const frame = this.frame;
    if (!background || !frame || (background.type !== 'image' && background.type !== 'video'))
      return;
    const size = mediaSize(this.texture);
    this.uniforms.uBgHasMap!.value = !!size;
    if (!size) return;
    const [sx, sy] = mediaUvScale(
      background.fit,
      frame.width / frame.height,
      size.width / size.height,
      background.scale,
    );
    (this.uniforms.uBgMapTransform!.value as Vector4).set(
      sx,
      sy,
      background.offset[0],
      background.offset[1],
    );
  }

  /** Maps gl_FragCoord to frame coordinates for the target being drawn (tiles included). */
  private updateView(renderer: WebGLRenderer, camera: Camera): void {
    const target = renderer.getRenderTarget();
    if (target) this.size.set(target.width, target.height);
    else renderer.getDrawingBufferSize(this.size);
    (this.uniforms.uBgTarget!.value as Vector2).copy(this.size);
    const view = this.uniforms.uBgView!.value as Vector4;
    const tile = camera instanceof PerspectiveCamera && camera.view?.enabled ? camera.view : null;
    if (tile)
      view.set(
        tile.offsetX / tile.fullWidth,
        tile.offsetY / tile.fullHeight,
        tile.width / tile.fullWidth,
        tile.height / tile.fullHeight,
      );
    else view.set(0, 0, 1, 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

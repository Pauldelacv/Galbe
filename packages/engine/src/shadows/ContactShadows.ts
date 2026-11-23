import {
  type Box3,
  Color,
  Group,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Layer that objects must enable to cast a contact shadow (keeps gizmos/helpers out). */
export const CONTACT_SHADOW_LAYER = 30;

export interface ContactShadowParams {
  enabled: boolean;
  opacity: number;
  blur: number;
  far: number;
  color: string;
  resolution: number;
}

const depthMaterial = () =>
  new ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      void main() {
        // Orthographic depth is linear: 0 on the ground, 1 at "far".
        float d = 1.0 - gl_FragCoord.z;
        d = d * d * (3.0 - 2.0 * d);
        gl_FragColor = vec4(d);
      }`,
  });

const blurMaterial = () =>
  new ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDirection: { value: new Vector2() } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uDirection;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270;
        sum += texture2D(tDiffuse, vUv + uDirection * 1.0) * 0.1945946;
        sum += texture2D(tDiffuse, vUv - uDirection * 1.0) * 0.1945946;
        sum += texture2D(tDiffuse, vUv + uDirection * 2.0) * 0.1216216;
        sum += texture2D(tDiffuse, vUv - uDirection * 2.0) * 0.1216216;
        sum += texture2D(tDiffuse, vUv + uDirection * 3.0) * 0.0540540;
        sum += texture2D(tDiffuse, vUv - uDirection * 3.0) * 0.0540540;
        sum += texture2D(tDiffuse, vUv + uDirection * 4.0) * 0.0162162;
        sum += texture2D(tDiffuse, vUv - uDirection * 4.0) * 0.0162162;
        gl_FragColor = sum;
      }`,
    depthTest: false,
    depthWrite: false,
  });

/**
 * Soft contact shadows: an orthographic depth pass looking up from the ground, blurred
 * twice, displayed on a transparent plane. The result does not depend on the viewing
 * camera, so it only re-renders when the content changes.
 */
export class ContactShadows {
  readonly object = new Group();
  private readonly plane: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly depth = depthMaterial();
  private readonly blur = blurMaterial();
  private readonly quad = new FullScreenQuad(this.blur);
  private targetA: WebGLRenderTarget;
  private targetB: WebGLRenderTarget;
  private params: ContactShadowParams = {
    enabled: true,
    opacity: 0.5,
    blur: 2.5,
    far: 1,
    color: '#000000',
    resolution: 512,
  };
  private dirty = true;
  private readonly clearColor = new Color();

  constructor() {
    this.object.name = 'ContactShadows';
    this.targetA = this.createTarget(512);
    this.targetB = this.createTarget(512);
    this.plane = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        alphaMap: this.targetA.texture,
      }),
    );
    this.plane.rotation.x = -Math.PI / 2;
    // The depth camera looks up, so its image is mirrored along Z relative to the plane UVs.
    this.plane.scale.y = -1;
    this.plane.renderOrder = -1;
    this.plane.raycast = () => {};
    this.object.add(this.plane);
    this.camera.rotation.x = Math.PI / 2;
    this.object.add(this.camera);
  }

  private createTarget(size: number): WebGLRenderTarget {
    const target = new WebGLRenderTarget(size, size, { type: HalfFloatType, depthBuffer: true });
    target.texture.generateMipmaps = false;
    target.texture.minFilter = LinearFilter;
    target.texture.magFilter = LinearFilter;
    return target;
  }

  /** Places the shadow under `bounds` (content bounding box) and applies parameters. */
  update(params: ContactShadowParams, bounds: Box3 | null, offset: number, scale: number): void {
    const previous = this.params;
    this.params = params;
    this.object.visible = params.enabled && !!bounds && !bounds.isEmpty();
    if (!this.object.visible || !bounds) return;

    if (params.resolution !== previous.resolution) {
      this.targetA.dispose();
      this.targetB.dispose();
      this.targetA = this.createTarget(params.resolution);
      this.targetB = this.createTarget(params.resolution);
      this.plane.material.alphaMap = this.targetA.texture;
      this.plane.material.needsUpdate = true;
    }
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeZ = bounds.max.z - bounds.min.z;
    const extent = Math.max(sizeX, sizeZ, 0.5) * scale;
    this.object.position.set(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.min.y - offset,
      (bounds.min.z + bounds.max.z) / 2,
    );
    this.plane.scale.set(extent, -extent, 1);
    this.camera.left = -extent / 2;
    this.camera.right = extent / 2;
    this.camera.top = extent / 2;
    this.camera.bottom = -extent / 2;
    this.camera.near = 0;
    this.camera.far = params.far;
    this.camera.updateProjectionMatrix();
    this.plane.material.color.set(params.color);
    this.plane.material.opacity = params.opacity;
    this.camera.layers.set(CONTACT_SHADOW_LAYER);
    this.dirty = true;
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** Re-renders the shadow texture if needed. Call before rendering the frame. */
  render(renderer: WebGLRenderer, scene: Scene): void {
    if (!this.dirty || !this.object.visible) return;
    this.dirty = false;

    const previousTarget = renderer.getRenderTarget();
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    const previousBackground = scene.background;
    const previousOverride = scene.overrideMaterial;
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr.enabled;

    this.object.updateMatrixWorld(true);
    scene.background = null;
    scene.overrideMaterial = this.depth;
    renderer.xr.enabled = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.targetA);
    renderer.clear();
    renderer.render(scene, this.camera);
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;

    const texel = 1 / this.params.resolution;
    this.blurPass(renderer, this.params.blur * texel);
    this.blurPass(renderer, this.params.blur * texel * 0.4);

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(this.clearColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
    renderer.xr.enabled = previousXr;
  }

  private blurPass(renderer: WebGLRenderer, amount: number): void {
    this.blur.uniforms.tDiffuse!.value = this.targetA.texture;
    (this.blur.uniforms.uDirection!.value as Vector2).set(amount, 0);
    renderer.setRenderTarget(this.targetB);
    this.quad.render(renderer);
    this.blur.uniforms.tDiffuse!.value = this.targetB.texture;
    (this.blur.uniforms.uDirection!.value as Vector2).set(0, amount);
    renderer.setRenderTarget(this.targetA);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.targetA.dispose();
    this.targetB.dispose();
    this.depth.dispose();
    this.blur.dispose();
    this.quad.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
  }
}

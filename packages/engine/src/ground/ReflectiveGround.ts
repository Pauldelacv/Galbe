import type { Ground } from '@galbe/core';
import {
  type Box3,
  Color,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  Vector2,
  type WebGLRenderer,
} from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const shader = {
  name: 'GalbeReflectiveGround',
  uniforms: {
    color: { value: new Color() },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uStrength: { value: 0.5 },
    uBlur: { value: 0.35 },
    uEdge: { value: 0.3 },
    uFloorColor: { value: new Color() },
    uFloorOpacity: { value: 0 },
    uTexel: { value: new Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflectUv;
    varying vec2 vPlaneUv;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vReflectUv = textureMatrix * vec4(position, 1.0);
      vPlaneUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform float uBlur;
    uniform float uEdge;
    uniform vec3 uFloorColor;
    uniform float uFloorOpacity;
    uniform vec2 uTexel;
    varying vec4 vReflectUv;
    varying vec2 vPlaneUv;
    #include <common>
    #include <logdepthbuf_pars_fragment>

    vec4 sampleBlurred(vec2 uv) {
      float lod = uBlur * 7.0;
      vec2 r = uTexel * exp2(lod) * 1.5;
      // 9-tap tent on top of the mip chain: smooth and cheap.
      vec4 sum = textureLod(tDiffuse, uv, lod) * 4.0;
      sum += textureLod(tDiffuse, uv + vec2(r.x, 0.0), lod) * 2.0;
      sum += textureLod(tDiffuse, uv - vec2(r.x, 0.0), lod) * 2.0;
      sum += textureLod(tDiffuse, uv + vec2(0.0, r.y), lod) * 2.0;
      sum += textureLod(tDiffuse, uv - vec2(0.0, r.y), lod) * 2.0;
      sum += textureLod(tDiffuse, uv + r, lod);
      sum += textureLod(tDiffuse, uv - r, lod);
      sum += textureLod(tDiffuse, uv + vec2(r.x, -r.y), lod);
      sum += textureLod(tDiffuse, uv + vec2(-r.x, r.y), lod);
      return sum / 16.0;
    }

    void main() {
      #include <logdepthbuf_fragment>
      vec2 uv = vReflectUv.xy / vReflectUv.w;
      vec4 reflection = sampleBlurred(uv);
      // Soft circular falloff towards the floor's edges.
      float d = length(vPlaneUv - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(1.0 - uEdge, 1.0, d);
      float r = uStrength * edge;
      float floorAlpha = uFloorOpacity * edge;
      vec3 rgb = uFloorColor * floorAlpha * (1.0 - r) + reflection.rgb * r;
      float alpha = clamp(floorAlpha + r * reflection.a * (1.0 - floorAlpha), 0.0, 1.0);
      gl_FragColor = vec4(rgb / max(alpha, 1e-4), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/**
 * A glossy floor under the content: a planar mirror (three's `Reflector`, which also
 * handles export tiles via the camera's view offset) blurred through its mip chain.
 */
export class ReflectiveGround {
  readonly object: Reflector;
  private readonly size = new Vector2();
  private blur = 0.35;

  constructor() {
    this.object = new Reflector(new PlaneGeometry(1, 1), {
      textureWidth: 512,
      textureHeight: 512,
      clipBias: 0.001,
      multisample: 4,
      shader,
    });
    this.object.name = 'ReflectiveGround';
    this.object.rotation.x = -Math.PI / 2;
    this.object.renderOrder = -2;
    this.object.raycast = () => {};
    const material = this.object.material as unknown as {
      transparent: boolean;
      depthWrite: boolean;
    };
    material.transparent = true;
    material.depthWrite = false;
    const target = this.object.getRenderTarget();
    target.texture.generateMipmaps = true;
    target.texture.minFilter = LinearMipmapLinearFilter;
    this.object.visible = false;

    // Match the mirror resolution to the canvas (half size when blurred).
    const render = this.object.onBeforeRender.bind(this.object);
    this.object.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
      const buffer = (renderer as WebGLRenderer).getDrawingBufferSize(this.size);
      const factor = this.blur > 0.05 ? 0.5 : 1;
      const w = Math.max(16, Math.round(buffer.x * factor));
      const h = Math.max(16, Math.round(buffer.y * factor));
      const rt = this.object.getRenderTarget();
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      this.uniforms.uTexel.value.set(1 / w, 1 / h);
      render(renderer, scene, camera, geometry, material, group);
    };
  }

  private get uniforms() {
    return (this.object.material as unknown as { uniforms: typeof shader.uniforms }).uniforms as {
      uStrength: { value: number };
      uBlur: { value: number };
      uEdge: { value: number };
      uFloorColor: { value: Color };
      uFloorOpacity: { value: number };
      uTexel: { value: Vector2 };
    };
  }

  update(ground: Ground, bounds: Box3 | null): void {
    const { reflection } = ground;
    this.object.visible = reflection.enabled && !!bounds && !bounds.isEmpty();
    if (!this.object.visible || !bounds) return;
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeZ = bounds.max.z - bounds.min.z;
    const extent = Math.max(sizeX, sizeZ, 0.5) * Math.max(ground.scale, 1) * 2;
    this.object.position.set(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.min.y - ground.offset - 1e-3,
      (bounds.min.z + bounds.max.z) / 2,
    );
    this.object.scale.set(extent, extent, 1);
    this.blur = reflection.blur;
    const u = this.uniforms;
    u.uStrength.value = reflection.strength;
    u.uBlur.value = reflection.blur;
    u.uEdge.value = Math.min(1, Math.max(0.01, reflection.fade / 5));
    u.uFloorColor.value.set(reflection.color);
    u.uFloorOpacity.value = reflection.floorOpacity;
  }

  dispose(): void {
    this.object.dispose();
  }
}

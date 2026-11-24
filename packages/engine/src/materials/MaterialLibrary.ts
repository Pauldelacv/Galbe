import {
  type MatcapMaterial,
  type MaterialSpec,
  type PhysicalMaterial,
  TEXTURE_SLOTS,
  type TextureSlot,
} from '@galbe/core';
import {
  FrontSide,
  type Material,
  MeshMatcapMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { TextureLibrary } from './TextureLibrary.ts';

const DEG = Math.PI / 180;

/** Slots whose texture holds colour (sRGB); the others hold data (linear). */
const COLOR_SLOTS = new Set<TextureSlot>(['map', 'emissiveMap']);

export interface HolographicUniforms {
  uHoloStrength: { value: number };
  uHoloBands: { value: number };
  uHoloShift: { value: number };
  uHoloFresnel: { value: number };
  uHoloLines: { value: number };
}

/**
 * Thin-film-like rainbow modulating the outgoing light by view angle, with fine
 * diffraction lines. Injected into MeshPhysicalMaterial so lights, HDRI and every other
 * physical parameter keep working underneath.
 */
function installHolographic(material: MeshPhysicalMaterial): HolographicUniforms {
  const uniforms: HolographicUniforms = {
    uHoloStrength: { value: 0 },
    uHoloBands: { value: 2.5 },
    uHoloShift: { value: 0 },
    uHoloFresnel: { value: 1.5 },
    uHoloLines: { value: 0.3 },
  };
  material.onBeforeCompile = (shader) => {
    if (!material.userData.holographic) return;
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `uniform float uHoloStrength;
uniform float uHoloBands;
uniform float uHoloShift;
uniform float uHoloFresnel;
uniform float uHoloLines;
void main() {`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
  vec3 holoView = normalize(vViewPosition);
  float holoNv = clamp(abs(dot(normalize(normal), holoView)), 0.0, 1.0);
  float holoEdge = pow(1.0 - holoNv, uHoloFresnel);
  float holoWeight = uHoloFresnel > 0.0 ? mix(0.35, 1.0, holoEdge) : 1.0;
  float holoLines = uHoloLines * sin(dot(normal, vec3(37.0, 91.0, 13.0)) * 6.0);
  float holoPhase = (1.0 - holoNv) * uHoloBands + uHoloShift / 360.0 + holoLines * 0.15;
  vec3 holoRainbow = 0.5 + 0.5 * cos(6.2831853 * (holoPhase + vec3(0.0, 0.33, 0.67)));
  float holoAmount = clamp(uHoloStrength * holoWeight, 0.0, 4.0);
  outgoingLight = mix(outgoingLight, outgoingLight * holoRainbow * 1.8, min(holoAmount, 1.0));
  outgoingLight += holoRainbow * max(holoAmount - 1.0, 0.0) * 0.25;
}
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => (material.userData.holographic ? 'galbe-holo' : '');
  return uniforms;
}

interface Entry {
  spec: MaterialSpec;
  material: MeshPhysicalMaterial | MeshMatcapMaterial;
  holo?: HolographicUniforms;
  /** Per-material texture clones (each material has its own UV transform). */
  textures: Map<string, Texture>;
}

/**
 * Keeps one three.js material per document material and patches it in place, so slider
 * drags never trigger shader recompiles unless a feature actually toggles.
 */
export class MaterialLibrary {
  private readonly entries = new Map<string, Entry>();
  /** Shown when a node references a material that does not exist (should not happen). */
  readonly fallback = new MeshPhysicalMaterial({ color: 0xff00ff, roughness: 0.5 });

  constructor(private readonly textures?: TextureLibrary) {}

  sync(specs: Readonly<Record<string, MaterialSpec>>, force = false): void {
    for (const [id, entry] of this.entries) {
      if (!(id in specs)) this.disposeEntry(id, entry);
    }
    for (const [id, spec] of Object.entries(specs)) {
      let entry = this.entries.get(id);
      if (entry && entry.spec.type !== spec.type) {
        this.disposeEntry(id, entry);
        entry = undefined;
      }
      if (!entry) {
        entry = this.create(spec);
        this.entries.set(id, entry);
        this.apply(entry, spec);
      } else if (force || entry.spec !== spec) {
        this.apply(entry, spec);
      }
    }
  }

  get(id: string): Material {
    return this.entries.get(id)?.material ?? this.fallback;
  }

  private create(spec: MaterialSpec): Entry {
    if (spec.type === 'matcap') {
      return { spec, material: new MeshMatcapMaterial(), textures: new Map() };
    }
    const material = new MeshPhysicalMaterial({ side: FrontSide });
    return { spec, material, holo: installHolographic(material), textures: new Map() };
  }

  private apply(entry: Entry, spec: MaterialSpec): void {
    entry.spec = spec;
    if (spec.type === 'matcap' && entry.material instanceof MeshMatcapMaterial) {
      applyMatcapSpec(
        entry.material,
        spec,
        this.textures?.get(spec.matcap, SRGBColorSpace) ?? null,
      );
    } else if (spec.type === 'physical' && entry.material instanceof MeshPhysicalMaterial) {
      applyPhysicalSpec(entry.material, spec);
      this.applyTextures(entry, entry.material, spec);
      const holo = spec.holographic;
      const enabled = holo.enabled && holo.strength > 0;
      if (Boolean(entry.material.userData.holographic) !== enabled) {
        entry.material.userData.holographic = enabled;
        entry.material.needsUpdate = true;
      }
      if (entry.holo) {
        entry.holo.uHoloStrength.value = holo.strength;
        entry.holo.uHoloBands.value = holo.bands;
        entry.holo.uHoloShift.value = holo.shift;
        entry.holo.uHoloFresnel.value = holo.fresnel;
        entry.holo.uHoloLines.value = holo.lines;
      }
    }
  }

  private applyTextures(
    entry: Entry,
    material: MeshPhysicalMaterial,
    spec: PhysicalMaterial,
  ): void {
    const { repeat, offset, rotation } = spec.uv;
    for (const slot of TEXTURE_SLOTS) {
      const uri = spec.textures[slot];
      let texture: Texture | null = null;
      if (uri && this.textures) {
        const colorSpace = COLOR_SLOTS.has(slot) ? SRGBColorSpace : NoColorSpace;
        const base = this.textures.get(uri, colorSpace);
        if (base) {
          const key = `${slot}|${uri}`;
          texture = entry.textures.get(key) ?? null;
          if (!texture || texture.source !== base.source) {
            texture?.dispose();
            texture = base.clone();
            texture.wrapS = texture.wrapT = RepeatWrapping;
            texture.needsUpdate = true;
            entry.textures.set(key, texture);
          }
          texture.repeat.set(repeat[0], repeat[1]);
          texture.offset.set(offset[0], offset[1]);
          texture.center.set(0.5, 0.5);
          texture.rotation = rotation * DEG;
        }
      }
      for (const [key, clone] of entry.textures) {
        if (key.startsWith(`${slot}|`) && clone !== texture) {
          clone.dispose();
          entry.textures.delete(key);
        }
      }
      if (material[slot] !== texture) {
        // Adding or removing a map changes the shader defines.
        if (!material[slot] !== !texture) material.needsUpdate = true;
        material[slot] = texture;
      }
    }
    material.normalScale.set(spec.normalScale, spec.normalScale);
    material.aoMapIntensity = spec.aoIntensity;
    if (spec.textures.alphaMap && !material.transparent) {
      material.transparent = true;
      material.needsUpdate = true;
    }
    if (spec.textures.emissiveMap && spec.emissiveIntensity > 0 && spec.emissive === '#000000') {
      // An emissive map with a black emissive colour would show nothing: use white.
      material.emissive.set('#ffffff');
    }
  }

  private disposeEntry(id: string, entry: Entry): void {
    entry.material.dispose();
    for (const texture of entry.textures.values()) texture.dispose();
    this.entries.delete(id);
  }

  dispose(): void {
    for (const [id, entry] of this.entries) this.disposeEntry(id, entry);
    this.fallback.dispose();
  }
}

/** Copies a physical spec onto a three.js material, in place (textures excluded). */
export function applyPhysicalSpec(material: MeshPhysicalMaterial, spec: PhysicalMaterial): void {
  material.name = spec.name;
  material.color.set(spec.color);
  material.metalness = spec.metalness;
  material.roughness = spec.roughness;
  material.opacity = spec.opacity;
  const transparent = spec.opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.depthWrite = !transparent || spec.transmission > 0;

  material.transmission = spec.transmission;
  material.ior = spec.ior;
  material.thickness = spec.thickness;
  material.dispersion = spec.dispersion;
  material.attenuationColor.set(spec.attenuationColor);
  material.attenuationDistance =
    spec.attenuationDistance > 0 ? spec.attenuationDistance : Number.POSITIVE_INFINITY;

  material.clearcoat = spec.clearcoat;
  material.clearcoatRoughness = spec.clearcoatRoughness;
  material.sheen = spec.sheen;
  material.sheenColor.set(spec.sheenColor);
  material.sheenRoughness = spec.sheenRoughness;
  material.iridescence = spec.iridescence;
  material.iridescenceIOR = spec.iridescenceIOR;
  material.iridescenceThicknessMinimum = spec.iridescenceThickness[0];
  material.iridescenceThicknessMaximum = spec.iridescenceThickness[1];

  material.specularIntensity = spec.specularIntensity;
  material.specularColor.set(spec.specularColor);
  material.anisotropy = spec.anisotropy;
  material.anisotropyRotation = spec.anisotropyRotation * DEG;

  material.emissive.set(spec.emissive);
  material.emissiveIntensity = spec.emissiveIntensity;
  material.envMapIntensity = spec.envMapIntensity;
  if (material.flatShading !== spec.flatShading) {
    material.flatShading = spec.flatShading;
    material.needsUpdate = true;
  }
}

export function applyMatcapSpec(
  material: MeshMatcapMaterial,
  spec: MatcapMaterial,
  matcap: Texture | null,
): void {
  material.name = spec.name;
  material.color.set(spec.color);
  material.opacity = spec.opacity;
  const transparent = spec.opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  if (material.flatShading !== spec.flatShading) {
    material.flatShading = spec.flatShading;
    material.needsUpdate = true;
  }
  if (material.matcap !== matcap) {
    if (!material.matcap !== !matcap) material.needsUpdate = true;
    material.matcap = matcap;
  }
}

/** A standalone three.js material for a spec (no textures). Mostly for tests and tools. */
export function createThreeMaterial(spec: MaterialSpec): MeshPhysicalMaterial | MeshMatcapMaterial {
  if (spec.type === 'matcap') {
    const material = new MeshMatcapMaterial();
    applyMatcapSpec(material, spec, null);
    return material;
  }
  const material = new MeshPhysicalMaterial({ side: FrontSide });
  applyPhysicalSpec(material, spec);
  return material;
}

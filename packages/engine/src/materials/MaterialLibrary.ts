import type { MaterialSpec, PhysicalMaterial } from '@galbe/core';
import { FrontSide, MeshPhysicalMaterial } from 'three';

const DEG = Math.PI / 180;

/** Copies a physical spec onto a three.js material, in place. */
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

export function createThreeMaterial(spec: MaterialSpec): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ side: FrontSide });
  applyPhysicalSpec(material, spec);
  return material;
}

/**
 * Keeps one three.js material per document material and patches it in place, so slider
 * drags never trigger shader recompiles unless a feature actually toggles.
 */
export class MaterialLibrary {
  private readonly entries = new Map<
    string,
    { spec: MaterialSpec; material: MeshPhysicalMaterial }
  >();
  /** Shown when a node references a material that does not exist (should not happen). */
  readonly fallback = new MeshPhysicalMaterial({ color: 0xff00ff, roughness: 0.5 });

  sync(specs: Readonly<Record<string, MaterialSpec>>): void {
    for (const [id, entry] of this.entries) {
      if (!(id in specs)) {
        entry.material.dispose();
        this.entries.delete(id);
      }
    }
    for (const [id, spec] of Object.entries(specs)) {
      const entry = this.entries.get(id);
      if (!entry) this.entries.set(id, { spec, material: createThreeMaterial(spec) });
      else if (entry.spec !== spec) {
        applyPhysicalSpec(entry.material, spec);
        entry.spec = spec;
      }
    }
  }

  get(id: string): MeshPhysicalMaterial {
    return this.entries.get(id)?.material ?? this.fallback;
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.material.dispose();
    this.entries.clear();
    this.fallback.dispose();
  }
}

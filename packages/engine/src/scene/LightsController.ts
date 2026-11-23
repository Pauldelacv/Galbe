import type { Light } from '@galbe/core';
import { DirectionalLight, Group, PointLight, SpotLight, type Light as ThreeLight } from 'three';

const DEG = Math.PI / 180;

/** Additional lights on top of the HDRI. */
export class LightsController {
  readonly object = new Group();
  private readonly lights = new Map<string, { type: Light['type']; light: ThreeLight }>();

  constructor() {
    this.object.name = 'Lights';
  }

  sync(specs: readonly Light[]): void {
    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.id);
      let entry = this.lights.get(spec.id);
      if (entry && entry.type !== spec.type) {
        this.remove(spec.id);
        entry = undefined;
      }
      if (!entry) {
        const light =
          spec.type === 'directional'
            ? new DirectionalLight()
            : spec.type === 'point'
              ? new PointLight()
              : new SpotLight();
        entry = { type: spec.type, light };
        this.lights.set(spec.id, entry);
        this.object.add(light);
        if (light instanceof DirectionalLight || light instanceof SpotLight)
          this.object.add(light.target);
      }
      const { light } = entry;
      light.name = spec.name;
      light.visible = spec.visible;
      light.color.set(spec.color);
      light.intensity = spec.intensity;
      light.position.set(...spec.position);
      if (
        spec.type !== 'point' &&
        (light instanceof DirectionalLight || light instanceof SpotLight)
      ) {
        light.target.position.set(...spec.target);
      }
      if (spec.type === 'point' && light instanceof PointLight) light.distance = spec.distance;
      if (spec.type === 'spot' && light instanceof SpotLight) {
        light.angle = spec.angle * DEG;
        light.penumbra = spec.penumbra;
        light.distance = spec.distance;
      }
    }
    for (const id of [...this.lights.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: string): void {
    const entry = this.lights.get(id);
    if (!entry) return;
    this.object.remove(entry.light);
    if (entry.light instanceof DirectionalLight || entry.light instanceof SpotLight)
      this.object.remove(entry.light.target);
    entry.light.dispose();
    this.lights.delete(id);
  }

  dispose(): void {
    for (const id of [...this.lights.keys()]) this.remove(id);
  }
}

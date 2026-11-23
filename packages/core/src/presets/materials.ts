import type { PhysicalMaterial } from '../schema/material.ts';

export type MaterialPresetCategory = 'metal' | 'glass' | 'solid' | 'special';

/** Material parameters a preset may set; everything else takes schema defaults. */
export type MaterialPresetSpec = Partial<Omit<PhysicalMaterial, 'id' | 'type' | 'preset'>>;

export interface MaterialPreset {
  id: string;
  name: string;
  category: MaterialPresetCategory;
  /** Short description shown in the picker tooltip. */
  description: string;
  spec: MaterialPresetSpec;
  /** CSS background used for the swatch until a rendered thumbnail is available. */
  swatch: string;
}

/**
 * Built-in material presets. Tuned for Galbe's bundled HDRIs; applying a preset copies
 * the values into the document, so changing a preset never alters existing projects.
 */
export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    category: 'metal',
    description: 'Mirror-polished metal. Reflects the environment almost perfectly.',
    spec: { name: 'Chrome', color: '#f4f4f6', metalness: 1, roughness: 0.04 },
    swatch: 'linear-gradient(160deg,#fdfdfd 0%,#8b8d93 38%,#1b1c20 52%,#c9ccd2 70%,#ffffff 100%)',
  },
  {
    id: 'gold',
    name: 'Polished gold',
    category: 'metal',
    description: 'Warm, slightly soft reflective gold.',
    spec: { name: 'Gold', color: '#f6cf7c', metalness: 1, roughness: 0.16 },
    swatch: 'linear-gradient(160deg,#fff3c4 0%,#d9a441 40%,#5a3b0c 55%,#f1c867 75%,#fff1b8 100%)',
  },
  {
    id: 'brushed-steel',
    name: 'Brushed steel',
    category: 'metal',
    description: 'Satin metal with directional, anisotropic highlights.',
    spec: {
      name: 'Brushed steel',
      color: '#c9ccd1',
      metalness: 1,
      roughness: 0.32,
      anisotropy: 0.85,
    },
    swatch:
      'repeating-linear-gradient(90deg,#b7bbc1 0 2px,#a3a7ae 2px 4px),linear-gradient(#ccc,#777)',
  },
  {
    id: 'glass',
    name: 'Clear glass',
    category: 'glass',
    description: 'Transparent, refractive glass with a touch of dispersion.',
    spec: {
      name: 'Glass',
      color: '#ffffff',
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      ior: 1.5,
      thickness: 0.8,
      dispersion: 1.5,
      specularIntensity: 1,
    },
    swatch:
      'linear-gradient(160deg,rgba(255,255,255,.55),rgba(180,205,230,.15) 45%,rgba(255,255,255,.6) 70%,rgba(150,170,200,.2))',
  },
  {
    id: 'frosted-glass',
    name: 'Frosted glass',
    category: 'glass',
    description: 'Diffuse, satin-finished glass.',
    spec: {
      name: 'Frosted glass',
      color: '#f3f6fb',
      metalness: 0,
      roughness: 0.38,
      transmission: 1,
      ior: 1.45,
      thickness: 1.2,
    },
    swatch:
      'radial-gradient(circle at 35% 30%,rgba(255,255,255,.9),rgba(205,215,230,.5) 60%,rgba(170,180,200,.4))',
  },
  {
    id: 'tinted-glass',
    name: 'Tinted glass',
    category: 'glass',
    description: 'Coloured glass whose tint deepens with thickness.',
    spec: {
      name: 'Tinted glass',
      color: '#ffffff',
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      ior: 1.52,
      thickness: 1,
      attenuationColor: '#3d7bff',
      attenuationDistance: 0.6,
    },
    swatch:
      'linear-gradient(160deg,rgba(130,170,255,.7),rgba(40,80,220,.55) 55%,rgba(170,200,255,.8))',
  },
  {
    id: 'glossy-plastic',
    name: 'Glossy plastic',
    category: 'solid',
    description: 'Saturated toy-like plastic under a clear coat.',
    spec: {
      name: 'Plastic',
      color: '#ff4b2b',
      metalness: 0,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    },
    swatch: 'radial-gradient(circle at 30% 25%,#ffd2c6 0 8%,#ff5a3a 30%,#a3200b 100%)',
  },
  {
    id: 'ceramic',
    name: 'Glazed ceramic',
    category: 'solid',
    description: 'Soft off-white body under a smooth glaze.',
    spec: {
      name: 'Ceramic',
      color: '#efebe4',
      metalness: 0,
      roughness: 0.55,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
    },
    swatch: 'radial-gradient(circle at 30% 25%,#ffffff 0 10%,#ece7df 40%,#a9a39a 100%)',
  },
  {
    id: 'clay',
    name: 'Matte clay',
    category: 'solid',
    description: 'Flat, chalky finish. Great for clean product shots.',
    spec: { name: 'Clay', color: '#d9d4cc', metalness: 0, roughness: 0.92, specularIntensity: 0.4 },
    swatch: 'radial-gradient(circle at 30% 25%,#f2eee8,#cfc9c0 50%,#8f8a83)',
  },
  {
    id: 'rubber',
    name: 'Soft rubber',
    category: 'solid',
    description: 'Dark, velvety rubber with a faint sheen.',
    spec: {
      name: 'Rubber',
      color: '#232327',
      metalness: 0,
      roughness: 0.78,
      sheen: 0.5,
      sheenColor: '#8a8a99',
      sheenRoughness: 0.6,
    },
    swatch: 'radial-gradient(circle at 30% 25%,#55555d,#26262a 55%,#0d0d0f)',
  },
  {
    id: 'pearl',
    name: 'Pearlescent',
    category: 'special',
    description: 'Iridescent thin-film coating that shifts hue with the angle.',
    spec: {
      name: 'Pearl',
      color: '#f1eefa',
      metalness: 0.15,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.6,
      iridescenceThickness: [180, 820],
    },
    swatch: 'linear-gradient(135deg,#f9d7ff,#c7e8ff 30%,#d9ffe9 55%,#fff2c9 80%,#f4d3ff)',
  },
  {
    id: 'neon',
    name: 'Neon glow',
    category: 'special',
    description: 'Emissive tube colour; pairs with bloom (v0.2).',
    spec: {
      name: 'Neon',
      color: '#ff3df2',
      metalness: 0,
      roughness: 0.4,
      emissive: '#ff3df2',
      emissiveIntensity: 2.2,
    },
    swatch: 'radial-gradient(circle,#ffffff 0 10%,#ff7af6 30%,#ff1fe9 60%,#5c0055)',
  },
];

export const DEFAULT_MATERIAL_PRESET_ID = 'chrome';

export function getMaterialPreset(id: string): MaterialPreset | undefined {
  return MATERIAL_PRESETS.find((preset) => preset.id === id);
}

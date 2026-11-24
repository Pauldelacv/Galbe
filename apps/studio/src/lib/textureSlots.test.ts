import { describe, expect, it } from 'vitest';
import { textureSlotFromName } from './textureSlots.ts';

describe('textureSlotFromName', () => {
  it.each([
    ['Bricks076C_1K-PNG_Color.png', 'map'],
    ['Bricks076C_1K-PNG_NormalGL.png', 'normalMap'],
    ['Bricks076C_1K-PNG_NormalDX.png', 'normalMap'],
    ['Bricks076C_1K-PNG_Roughness.png', 'roughnessMap'],
    ['Metal_Metalness.jpg', 'metalnessMap'],
    ['Bricks076C_1K-PNG_AmbientOcclusion.png', 'aoMap'],
    ['rock_wall_diff_2k.jpg', 'map'],
    ['rock_wall_nor_gl_2k.jpg', 'normalMap'],
    ['rock_wall_rough_2k.jpg', 'roughnessMap'],
    ['rock_wall_ao_2k.jpg', 'aoMap'],
    ['Panel_Emission.png', 'emissiveMap'],
    ['leaf_opacity.png', 'alphaMap'],
    ['Bricks076C_1K-PNG_Displacement.png', null],
    ['photo.jpg', null],
  ])('%s → %s', (name, slot) => expect(textureSlotFromName(name)).toBe(slot));
});

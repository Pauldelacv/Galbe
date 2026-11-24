import type { PrimitiveNode } from '@galbe/core';
import {
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise3D } from './noise.ts';

const DEG = Math.PI / 180;

/** Segment counts per detail level (1 … 4). */
const RADIAL = [24, 48, 72, 112];
const BLOB = [12, 24, 40, 64];

export type PrimitiveGeometryParams = Pick<PrimitiveNode, 'kind' | 'params' | 'smooth'>;

/** Builds the geometry of a parametric primitive, centred on the origin. */
export function buildPrimitiveGeometry({
  kind,
  params: p,
  smooth,
}: PrimitiveGeometryParams): BufferGeometry {
  const level = Math.max(1, Math.min(4, p.detail)) - 1;
  const radial = RADIAL[level]!;
  const arc = Math.min(360, Math.max(1, p.arc)) * DEG;
  let geometry: BufferGeometry;
  switch (kind) {
    case 'sphere':
      geometry = new SphereGeometry(p.radius, radial, Math.round(radial / 2), 0, arc);
      break;
    case 'roundedBox': {
      const [w, h, d] = p.size;
      const radius = Math.min(p.cornerRadius, Math.min(w, h, d) / 2 - 1e-4);
      geometry = new RoundedBoxGeometry(w, h, d, Math.max(2, level * 2 + 2), Math.max(0, radius));
      break;
    }
    case 'torus':
      geometry = new TorusGeometry(
        p.radius,
        Math.min(p.tube, p.radius * 2),
        Math.round(radial / 2),
        radial,
        arc,
      );
      break;
    case 'capsule':
      geometry = new CapsuleGeometry(p.radius, p.height, Math.round(radial / 6), radial, 1);
      break;
    case 'cylinder':
      geometry = new CylinderGeometry(
        p.radius * p.taper,
        p.radius,
        p.height,
        radial,
        1,
        false,
        0,
        arc,
      );
      break;
    case 'cone':
      geometry = new CylinderGeometry(0, p.radius, p.height, radial, 1, false, 0, arc);
      break;
    case 'ring': {
      const outer = p.radius;
      const inner = outer * p.innerRatio;
      const shape = new Shape().absarc(0, 0, outer, 0, Math.PI * 2, false);
      if (inner > 1e-4) shape.holes.push(new Path().absarc(0, 0, inner, 0, Math.PI * 2, true));
      const bevel = Math.min(p.bevel, (outer - inner) / 2 - 1e-4, p.height / 2);
      const depth = Math.max(p.height - bevel * 2, 1e-4);
      geometry = new ExtrudeGeometry(shape, {
        depth,
        curveSegments: radial,
        bevelEnabled: bevel > 0,
        bevelSize: Math.max(bevel, 0),
        bevelThickness: Math.max(bevel, 0),
        bevelOffset: -Math.max(bevel, 0),
        bevelSegments: 2 + level * 2,
      });
      geometry.translate(0, 0, -depth / 2);
      geometry.clearGroups();
      break;
    }
    case 'blob': {
      const base = new IcosahedronGeometry(p.radius, BLOB[level]!);
      base.deleteAttribute('normal');
      base.deleteAttribute('uv');
      geometry = mergeVertices(base);
      base.dispose();
      displaceBlob(geometry, p.radius, p.noise);
      break;
    }
  }
  if (!smooth) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.computeVertexNormals();
    geometry = flat;
  } else if (kind === 'blob') {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function displaceBlob(
  geometry: BufferGeometry,
  radius: number,
  noise: PrimitiveNode['params']['noise'],
): void {
  const sample = createNoise3D(noise.seed);
  const position = geometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const dir = v.clone().normalize();
    let amplitude = 1;
    let frequency = noise.frequency / Math.max(radius, 1e-3);
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < noise.octaves; o++) {
      sum += amplitude * sample(v.x * frequency, v.y * frequency, v.z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    const r = radius * (1 + (noise.amplitude * sum) / norm);
    position.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
  }
  position.needsUpdate = true;
}

export const primitiveBuildKey = (p: PrimitiveGeometryParams): string =>
  JSON.stringify([p.kind, p.params, p.smooth]);

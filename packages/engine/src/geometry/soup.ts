/**
 * Non-indexed triangle soup with the attributes Galbe's procedural meshes carry.
 * Plain typed arrays keep geometry code independent from BufferGeometry and easy to test.
 */
export interface TriangleSoup {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** Per-vertex glyph (or part) index, for per-letter animation. */
  part: Float32Array;
}

export const vertexCount = (soup: TriangleSoup): number => soup.position.length / 3;

export function emptySoup(): TriangleSoup {
  return {
    position: new Float32Array(),
    normal: new Float32Array(),
    uv: new Float32Array(),
    part: new Float32Array(),
  };
}

/** Concatenates soups, translating each by its offset. */
export function mergeSoups(
  items: { soup: TriangleSoup; offset: [number, number, number]; part?: number }[],
): TriangleSoup {
  const total = items.reduce((sum, item) => sum + vertexCount(item.soup), 0);
  const out: TriangleSoup = {
    position: new Float32Array(total * 3),
    normal: new Float32Array(total * 3),
    uv: new Float32Array(total * 2),
    part: new Float32Array(total),
  };
  let v = 0;
  for (const { soup, offset, part } of items) {
    const n = vertexCount(soup);
    for (let i = 0; i < n; i++) {
      out.position[(v + i) * 3] = soup.position[i * 3]! + offset[0];
      out.position[(v + i) * 3 + 1] = soup.position[i * 3 + 1]! + offset[1];
      out.position[(v + i) * 3 + 2] = soup.position[i * 3 + 2]! + offset[2];
    }
    out.normal.set(soup.normal, v * 3);
    out.uv.set(soup.uv, v * 2);
    if (part === undefined) out.part.set(soup.part, v);
    else out.part.fill(part, v, v + n);
    v += n;
  }
  return out;
}

export function soupBounds(soup: TriangleSoup): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < soup.position.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const value = soup.position[i + a]!;
      if (value < min[a]!) min[a] = value;
      if (value > max[a]!) max[a] = value;
    }
  }
  return { min, max };
}

export function translateSoup(soup: TriangleSoup, dx: number, dy: number, dz: number): void {
  for (let i = 0; i < soup.position.length; i += 3) {
    soup.position[i]! += dx;
    soup.position[i + 1]! += dy;
    soup.position[i + 2]! += dz;
  }
}

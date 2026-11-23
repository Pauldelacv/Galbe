/**
 * Minimal OpenType GPOS kerning reader.
 *
 * opentype.js 2.x does not resolve GPOS Extension lookups (type 9), which many fonts
 * (Inter, Playfair Display, DM Serif Display…) use to store their kerning. This reader
 * walks the raw table for the `kern` feature and resolves Pair Adjustment lookups
 * (type 2, formats 1 and 2), directly or wrapped in extensions, returning the X advance
 * adjustment of the first glyph in font units.
 *
 * Spec: https://learn.microsoft.com/typography/opentype/spec/gpos
 */

export type Kerner = (left: number, right: number) => number;

class Reader {
  constructor(private readonly view: DataView) {}
  u16(offset: number): number {
    return this.view.getUint16(offset);
  }
  i16(offset: number): number {
    return this.view.getInt16(offset);
  }
  u32(offset: number): number {
    return this.view.getUint32(offset);
  }
  tag(offset: number): string {
    return String.fromCharCode(
      this.view.getUint8(offset),
      this.view.getUint8(offset + 1),
      this.view.getUint8(offset + 2),
      this.view.getUint8(offset + 3),
    );
  }
}

/** Number of int16 fields in a ValueRecord with the given format. */
const valueRecordSize = (format: number): number => {
  let count = 0;
  for (let bit = format; bit; bit >>= 1) count += bit & 1;
  return count * 2;
};

/** Offset (in bytes, within the record) of XAdvance, or -1 when absent. */
const xAdvanceOffset = (format: number): number => {
  if (!(format & 0x4)) return -1;
  return ((format & 0x1 ? 1 : 0) + (format & 0x2 ? 1 : 0)) * 2;
};

function coverageIndex(r: Reader, offset: number, glyph: number): number {
  const format = r.u16(offset);
  if (format === 1) {
    const count = r.u16(offset + 2);
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = r.u16(offset + 4 + mid * 2);
      if (value === glyph) return mid;
      if (value < glyph) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }
  if (format === 2) {
    const count = r.u16(offset + 2);
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const record = offset + 4 + mid * 6;
      const start = r.u16(record);
      const end = r.u16(record + 2);
      if (glyph < start) hi = mid - 1;
      else if (glyph > end) lo = mid + 1;
      else return r.u16(record + 4) + glyph - start;
    }
  }
  return -1;
}

function classOf(r: Reader, offset: number, glyph: number): number {
  const format = r.u16(offset);
  if (format === 1) {
    const start = r.u16(offset + 2);
    const count = r.u16(offset + 4);
    const index = glyph - start;
    return index >= 0 && index < count ? r.u16(offset + 6 + index * 2) : 0;
  }
  if (format === 2) {
    const count = r.u16(offset + 2);
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const record = offset + 4 + mid * 6;
      const start = r.u16(record);
      const end = r.u16(record + 2);
      if (glyph < start) hi = mid - 1;
      else if (glyph > end) lo = mid + 1;
      else return r.u16(record + 4);
    }
  }
  return 0;
}

/** Returns the adjustment, or `null` when this subtable does not handle the pair. */
function pairPos(r: Reader, offset: number, left: number, right: number): number | null {
  const format = r.u16(offset);
  const coverage = coverageIndex(r, offset + r.u16(offset + 2), left);
  if (coverage === -1) return null;
  const valueFormat1 = r.u16(offset + 4);
  const valueFormat2 = r.u16(offset + 6);
  const size1 = valueRecordSize(valueFormat1);
  const size2 = valueRecordSize(valueFormat2);
  const xAdv = xAdvanceOffset(valueFormat1);

  if (format === 1) {
    const pairSetCount = r.u16(offset + 8);
    if (coverage >= pairSetCount) return null;
    const pairSet = offset + r.u16(offset + 10 + coverage * 2);
    const count = r.u16(pairSet);
    const recordSize = 2 + size1 + size2;
    let lo = 0;
    let hi = count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const record = pairSet + 2 + mid * recordSize;
      const second = r.u16(record);
      if (second === right) return xAdv === -1 ? 0 : r.i16(record + 2 + xAdv);
      if (second < right) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }
  if (format === 2) {
    const classDef1 = offset + r.u16(offset + 8);
    const classDef2 = offset + r.u16(offset + 10);
    const class1Count = r.u16(offset + 12);
    const class2Count = r.u16(offset + 14);
    const c1 = classOf(r, classDef1, left);
    const c2 = classOf(r, classDef2, right);
    if (c1 >= class1Count || c2 >= class2Count) return null;
    const record = offset + 16 + (c1 * class2Count + c2) * (size1 + size2);
    return xAdv === -1 ? 0 : r.i16(record + xAdv);
  }
  return null;
}

/** Locates a table in an sfnt (TrueType/CFF) font. WOFF is not handled here. */
function findTable(r: Reader, byteLength: number, tag: string): number {
  if (byteLength < 12) return -1;
  const numTables = r.u16(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (record + 16 > byteLength) return -1;
    if (r.tag(record) === tag) return r.u32(record + 8);
  }
  return -1;
}

/**
 * Builds a kerning function for a font file, or `null` if the file has no usable GPOS
 * `kern` feature (callers then fall back to opentype.js / the legacy `kern` table).
 */
export function createGposKerner(bytes: ArrayBuffer): Kerner | null {
  try {
    const view = new DataView(bytes);
    const r = new Reader(view);
    const signature = r.u32(0);
    // TrueType (0x00010000, 'true') or CFF ('OTTO') sfnt only.
    if (signature !== 0x00010000 && signature !== 0x74727565 && signature !== 0x4f54544f)
      return null;
    const gpos = findTable(r, bytes.byteLength, 'GPOS');
    if (gpos === -1) return null;

    const featureList = gpos + r.u16(gpos + 6);
    const lookupList = gpos + r.u16(gpos + 8);
    const lookupIndices = new Set<number>();
    const featureCount = r.u16(featureList);
    for (let i = 0; i < featureCount; i++) {
      const record = featureList + 2 + i * 6;
      if (r.tag(record) !== 'kern') continue;
      const feature = featureList + r.u16(record + 4);
      const count = r.u16(feature + 2);
      for (let k = 0; k < count; k++) lookupIndices.add(r.u16(feature + 4 + k * 2));
    }
    if (!lookupIndices.size) return null;

    // Resolve each kern lookup to its list of PairPos subtable offsets.
    const lookups: number[][] = [];
    for (const index of [...lookupIndices].sort((a, b) => a - b)) {
      const lookup = lookupList + r.u16(lookupList + 2 + index * 2);
      const type = r.u16(lookup);
      const subtableCount = r.u16(lookup + 4);
      const subtables: number[] = [];
      for (let s = 0; s < subtableCount; s++) {
        let subtable = lookup + r.u16(lookup + 6 + s * 2);
        let subtableType = type;
        if (type === 9) {
          subtableType = r.u16(subtable + 2);
          subtable += r.u32(subtable + 4);
        }
        if (subtableType === 2) subtables.push(subtable);
      }
      if (subtables.length) lookups.push(subtables);
    }
    if (!lookups.length) return null;

    const cache = new Map<number, number>();
    return (left, right) => {
      const key = left * 65536 + right;
      let value = cache.get(key);
      if (value === undefined) {
        value = 0;
        for (const subtables of lookups) {
          for (const subtable of subtables) {
            const adjustment = pairPos(r, subtable, left, right);
            if (adjustment !== null) {
              value += adjustment;
              break;
            }
          }
        }
        cache.set(key, value);
      }
      return value;
    };
  } catch {
    return null;
  }
}

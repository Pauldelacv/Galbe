// Minimal typings for the parts of opentype.js 2.x that Galbe uses.
// (The DefinitelyTyped package targets 1.x and is not maintained alongside 2.x.)
declare module 'opentype.js' {
  export type PathCommand =
    | { type: 'M' | 'L'; x: number; y: number }
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }
    | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { type: 'Z' };

  export interface Path {
    commands: PathCommand[];
  }

  export interface Glyph {
    index: number;
    name: string | null;
    unicode: number | undefined;
    advanceWidth: number | undefined;
    path: Path;
  }

  export interface KerningLookups {
    readonly __brand?: 'KerningLookups';
  }

  export interface Position {
    getDefaultScriptName(): string;
    getKerningTables(script?: string, language?: string): KerningLookups | undefined;
    getKerningValue(lookups: KerningLookups, leftIndex: number, rightIndex: number): number;
  }

  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    names: Record<string, Record<string, string> | undefined>;
    tables: Record<string, Record<string, unknown> | undefined>;
    position: Position;
    hasChar(char: string): boolean;
    charToGlyphIndex(char: string): number;
    charToGlyph(char: string): Glyph;
    stringToGlyphs(text: string, options?: Record<string, unknown>): Glyph[];
    getKerningValue(left: Glyph | number, right: Glyph | number): number;
  }

  export function parse(buffer: ArrayBuffer, options?: Record<string, unknown>): Font;
}

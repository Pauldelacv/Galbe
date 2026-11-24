export interface BuiltinFontFace {
  weight: number;
  style: 'normal' | 'italic';
  /** Builtin ids (without `builtin:`), one per subset, in fallback order. */
  files: string[];
}

export interface BuiltinFontFamily {
  id: string;
  family: string;
  category: string;
  description: string;
  license: string;
  licenseFile: string;
  source: string;
  faces: BuiltinFontFace[];
}

export interface BuiltinHdri {
  /** Builtin id (without `builtin:`), e.g. `hdri/studio-small-09`. */
  id: string;
  name: string;
  description: string;
  /** Path relative to the builtin base URL. */
  file: string;
  preview: string;
  license: string;
  credit: { title: string; authors: string[]; url: string };
}

export interface BuiltinMatcap {
  /** Builtin id (without `builtin:`), e.g. `matcaps/clay-soft`. */
  id: string;
  name: string;
  /** Path relative to the builtin base URL. */
  file: string;
  license: string;
}

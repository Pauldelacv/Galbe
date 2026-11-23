export type FileKind = 'galbe' | 'font' | 'woff2' | 'hdri' | 'svg' | 'model' | 'unknown';

const BY_EXTENSION: Record<string, FileKind> = {
  galbe: 'galbe',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'woff2',
  hdr: 'hdri',
  svg: 'svg',
  glb: 'model',
  gltf: 'model',
  fbx: 'model',
  obj: 'model',
};

/** Identifies a file from its signature (magic bytes), for files without a useful name. */
export function sniffBytes(bytes: Uint8Array): FileKind {
  const ascii = String.fromCharCode(...bytes.subarray(0, 4));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
    return 'galbe';
  if (ascii === 'wOFF' || ascii === 'OTTO' || ascii === 'true') return 'font';
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00)
    return 'font';
  if (ascii === 'wOF2') return 'woff2';
  if (ascii.startsWith('#?')) return 'hdri';
  if (ascii === 'glTF') return 'model';
  return 'unknown';
}

/** Extension first, then content sniffing. */
export async function detectFileKind(file: File): Promise<FileKind> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
  const byName = BY_EXTENSION[ext];
  if (byName) return byName;
  return sniffBytes(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
}

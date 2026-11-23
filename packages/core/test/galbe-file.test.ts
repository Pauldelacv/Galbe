import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  collectAssetUris,
  createStarterDocument,
  GalbeDocumentError,
  hashBytes,
  looksLikeZip,
  packGalbe,
  parseAssetUri,
  projectAssetUri,
  unpackGalbe,
} from '../src/index.ts';

async function docWithFontAsset() {
  const doc = structuredClone(createStarterDocument());
  const bytes = strToU8('pretend this is a font file');
  const id = await hashBytes(bytes);
  doc.assets[id] = {
    id,
    kind: 'font',
    name: 'Pretend.ttf',
    mime: 'font/ttf',
    size: bytes.length,
    meta: {},
  };
  const node = doc.nodes[0]!;
  if (node.type === 'text')
    node.font = { family: 'Pretend', weight: 400, style: 'normal', files: [projectAssetUri(id)] };
  return { doc, id, bytes };
}

describe('asset URIs', () => {
  it('parses builtin and project URIs', () => {
    expect(parseAssetUri('builtin:hdri/studio-small-09')).toEqual({
      scheme: 'builtin',
      id: 'hdri/studio-small-09',
    });
    expect(parseAssetUri(`asset:${'a'.repeat(32)}`)).toEqual({
      scheme: 'asset',
      id: 'a'.repeat(32),
    });
    expect(parseAssetUri('https://example.com')).toBeNull();
    expect(parseAssetUri('asset:short')).toBeNull();
  });

  it('collects every URI in a document', () => {
    const uris = collectAssetUris(createStarterDocument());
    expect(uris.has('builtin:hdri/studio-small-09')).toBe(true);
    expect([...uris].some((uri) => uri.startsWith('builtin:fonts/'))).toBe(true);
  });

  it('hashes content to 32 hex chars', async () => {
    const hash = await hashBytes(strToU8('galbe'));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(await hashBytes(strToU8('galbe'))).toBe(hash);
  });
});

describe('.galbe files', () => {
  it('round-trips document and assets', async () => {
    const { doc, id, bytes } = await docWithFontAsset();
    const thumbnail = new Uint8Array([1, 2, 3]);
    const packed = await packGalbe({ document: doc, getAsset: () => bytes, thumbnail });
    expect(looksLikeZip(packed)).toBe(true);
    const unpacked = await unpackGalbe(packed);
    expect(unpacked.document).toEqual(doc);
    expect(unpacked.assets.get(id)?.bytes).toEqual(bytes);
    expect(unpacked.thumbnail).toEqual(thumbnail);
    expect(unpacked.warnings).toEqual([]);
  });

  it('drops assets that are no longer referenced', async () => {
    const { doc, bytes } = await docWithFontAsset();
    const orphan = 'f'.repeat(32);
    doc.assets[orphan] = {
      id: orphan,
      kind: 'image',
      name: 'old.png',
      mime: 'image/png',
      size: 1,
      meta: {},
    };
    const unpacked = await unpackGalbe(await packGalbe({ document: doc, getAsset: () => bytes }));
    expect(Object.keys(unpacked.document.assets)).toHaveLength(1);
  });

  it('fails clearly when an asset is missing', async () => {
    const { doc } = await docWithFontAsset();
    await expect(packGalbe({ document: doc, getAsset: () => undefined })).rejects.toThrow(
      /is missing/,
    );
  });

  it('warns on checksum mismatch', async () => {
    const { doc, id } = await docWithFontAsset();
    const packed = await packGalbe({ document: doc, getAsset: () => strToU8('tampered') });
    const unpacked = await unpackGalbe(packed);
    expect(unpacked.assets.has(id)).toBe(true);
    expect(unpacked.warnings[0]).toMatch(/checksum/);
  });

  it('rejects non-zip and incomplete archives', async () => {
    await expect(unpackGalbe(strToU8('hello'))).rejects.toThrow(GalbeDocumentError);
    await expect(unpackGalbe(zipSync({ 'readme.txt': strToU8('x') }))).rejects.toThrow(
      /no scene.json/,
    );
    await expect(unpackGalbe(zipSync({ 'scene.json': strToU8('{oops') }))).rejects.toThrow(
      /not valid JSON/,
    );
  });
});

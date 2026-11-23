/**
 * Loads fonts into `document.fonts` under unique names so the picker can show each
 * family in its own face. Loads are lazy and cached.
 */
const loaded = new Map<string, Promise<string | null>>();

export function previewFamily(
  key: string,
  url: string,
  descriptors: FontFaceDescriptors = {},
): Promise<string | null> {
  let promise = loaded.get(key);
  if (!promise) {
    const name = `galbe-preview-${key.replace(/[^a-z0-9-]/gi, '-')}`;
    const face = new FontFace(name, `url(${JSON.stringify(url)})`, descriptors);
    promise = face
      .load()
      .then((ready) => {
        document.fonts.add(ready);
        return name;
      })
      .catch(() => null);
    loaded.set(key, promise);
  }
  return promise;
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Short random id (base62, 12 chars ≈ 71 bits). Uses Web Crypto, available in browsers
 * and Node ≥ 19. Rejection sampling keeps the distribution uniform.
 */
export function createId(length = 12): string {
  let id = '';
  const bytes = new Uint8Array(length * 2);
  while (id.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      // 248 = 62 * 4: discard bytes that would bias the modulo.
      if (byte < 248) id += ALPHABET[byte % 62];
      if (id.length === length) break;
    }
  }
  return id;
}

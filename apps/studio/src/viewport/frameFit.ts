/** Largest rectangle with the frame's aspect that fits in the available area. */
export function fitFrame(
  available: { width: number; height: number },
  frame: { width: number; height: number },
  padding = 32,
): { width: number; height: number } {
  const width = Math.max(1, available.width - padding * 2);
  const height = Math.max(1, available.height - padding * 2);
  const aspect = frame.width / frame.height;
  return width / height > aspect
    ? { width: Math.round(height * aspect), height: Math.round(height) }
    : { width: Math.round(width), height: Math.round(width / aspect) };
}

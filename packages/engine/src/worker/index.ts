// Worker-safe entry point: geometry only (no three.js renderer, no DOM).

export { createUrlAssetSource } from '../assets/AssetSource.ts';
export * from './protocol.ts';
export * from './serveGeometry.ts';

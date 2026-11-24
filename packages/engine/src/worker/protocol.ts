import type { ShapeNode, TextNode } from '@galbe/core';
import type { TriangleSoup } from '../geometry/soup.ts';

export type TextBuildInput = Pick<
  TextNode,
  | 'text'
  | 'font'
  | 'size'
  | 'depth'
  | 'curveSegments'
  | 'bevel'
  | 'letterSpacing'
  | 'lineHeight'
  | 'align'
  | 'deform'
>;

export type ShapeBuildInput = Pick<
  ShapeNode,
  'paths' | 'viewBox' | 'size' | 'depth' | 'curveSegments' | 'bevel' | 'layerSpacing' | 'deform'
>;

export type GeometryRequest =
  | { id: number; kind: 'init'; builtinBaseUrl: string }
  | { id: number; kind: 'text'; input: TextBuildInput }
  | { id: number; kind: 'shape'; input: ShapeBuildInput };

export type GeometryResponse =
  | { id: number; ok: true; kind: 'init' }
  | { id: number; ok: true; kind: 'text'; soup: TriangleSoup; glyphCount: number }
  | { id: number; ok: true; kind: 'shape'; parts: { pathId: string; soup: TriangleSoup }[] }
  | { id: number; ok: false; error: string };

/** The subset of `Worker` the client uses (lets tests run a worker in-process). */
export interface WorkerLike {
  postMessage(message: GeometryRequest, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: GeometryResponse }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  terminate?(): void;
}

/** The subset of a worker's global scope the server uses. */
export interface WorkerScopeLike {
  postMessage(message: GeometryResponse, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: GeometryRequest }) => void): void;
}

export const soupBuffers = (soup: TriangleSoup): Transferable[] =>
  [soup.position.buffer, soup.normal.buffer, soup.uv.buffer, soup.part.buffer] as ArrayBuffer[];

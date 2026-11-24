/**
 * Property paths address one value in a document: dot-separated segments from the root,
 * where an array of objects with an `id` is indexed by that id and any other array by its
 * index (`nodes.<id>.transform.rotation.1`, `materials.<id>.color`).
 */

type Container = Record<string, unknown> | unknown[];

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const splitPath = (path: string): string[] => path.split('.');
export const joinPath = (segments: readonly (string | number)[]): string => segments.join('.');

/** Index of `segment` inside `array`: by `id` for arrays of identified objects, else numeric. */
function arrayIndex(array: unknown[], segment: string): number {
  const first = array[0];
  if (isObject(first) && typeof first.id === 'string')
    return array.findIndex((item) => isObject(item) && item.id === segment);
  if (!/^\d+$/.test(segment)) return -1;
  const index = Number(segment);
  return index < array.length ? index : -1;
}

function child(container: unknown, segment: string): unknown {
  if (Array.isArray(container)) {
    const index = arrayIndex(container, segment);
    return index < 0 ? undefined : container[index];
  }
  if (isObject(container))
    return Object.hasOwn(container, segment) ? container[segment] : undefined;
  return undefined;
}

/** The value at `path`, or undefined when the path does not resolve. */
export function getPath(root: unknown, path: string | readonly string[]): unknown {
  const segments = typeof path === 'string' ? splitPath(path) : path;
  let current = root;
  for (const segment of segments) {
    current = child(current, segment);
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Sets a value on a mutable tree (an Immer draft, a fresh clone). Returns false when the
 * path does not resolve to an existing value (nothing is created).
 */
export function setPath(root: unknown, path: string | readonly string[], value: unknown): boolean {
  const segments = typeof path === 'string' ? splitPath(path) : path;
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    current = child(current, segments[i]!);
    if (current === undefined || current === null || typeof current !== 'object') return false;
  }
  const last = segments.at(-1)!;
  if (Array.isArray(current)) {
    const index = arrayIndex(current, last);
    if (index < 0) return false;
    current[index] = value;
    return true;
  }
  if (isObject(current) && Object.hasOwn(current, last)) {
    current[last] = value;
    return true;
  }
  return false;
}

/**
 * Copy-on-write writer over an immutable tree: each container on a written path is
 * shallow-copied once, everything else is shared with the source (cheap per frame).
 */
export class PathWriter<T> {
  private readonly copies = new WeakSet<object>();
  private root: T;

  constructor(source: T) {
    this.root = source;
  }

  get value(): T {
    return this.root;
  }

  private own<C extends Container>(container: C): C {
    if (this.copies.has(container)) return container;
    const copy = (Array.isArray(container) ? [...container] : { ...container }) as C;
    this.copies.add(copy);
    return copy;
  }

  /** Returns false (and writes nothing) when the path does not resolve. */
  set(path: string | readonly string[], value: unknown): boolean {
    const segments = typeof path === 'string' ? splitPath(path) : path;
    if (getPath(this.root, segments) === undefined) return false;
    const rootCopy = this.own(this.root as unknown as Container);
    this.root = rootCopy as unknown as T;
    let current: Container = rootCopy;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const key = Array.isArray(current) ? arrayIndex(current, segment) : segment;
      const isLast = i === segments.length - 1;
      const target = current as Record<string | number, unknown>;
      if (isLast) {
        target[key] = value;
        break;
      }
      const next = this.own(target[key] as Container);
      target[key] = next;
      current = next;
    }
    return true;
  }

  /** Reads through pending writes. */
  get(path: string | readonly string[]): unknown {
    return getPath(this.root, path);
  }
}

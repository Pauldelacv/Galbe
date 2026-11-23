import { ZodError } from 'zod';
import { type GalbeDocument, GalbeDocumentSchema } from './schema/document.ts';
import { CURRENT_SCHEMA_VERSION } from './version.ts';

/** Upgrades a raw document of version `n` to version `n + 1`. Must not throw on valid input. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Registered migrations, keyed by the version they upgrade FROM. Empty while the schema
 * is at version 1; add an entry here whenever `CURRENT_SCHEMA_VERSION` is bumped.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class GalbeDocumentError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(issues.length ? `${message}\n- ${issues.join('\n- ')}` : message);
    this.name = 'GalbeDocumentError';
  }
}

export interface LoadOptions {
  migrations?: Readonly<Record<number, Migration>>;
  targetVersion?: number;
}

/** Applies migrations up to the target version, without validating the result. */
export function migrateRaw(input: unknown, options: LoadOptions = {}): Record<string, unknown> {
  const migrations = options.migrations ?? MIGRATIONS;
  const target = options.targetVersion ?? CURRENT_SCHEMA_VERSION;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new GalbeDocumentError('Not a Galbe document: expected a JSON object.');
  }
  let raw = input as Record<string, unknown>;
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new GalbeDocumentError('Not a Galbe document: missing or invalid "schemaVersion".');
  }
  if (version > target) {
    throw new GalbeDocumentError(
      `This file was made with a newer version of Galbe (schema v${version}; this build reads up to v${target}). Please update Galbe.`,
    );
  }
  for (let v = version; v < target; v++) {
    const migrate = migrations[v];
    if (!migrate)
      throw new GalbeDocumentError(`No migration registered from schema v${v} to v${v + 1}.`);
    raw = { ...migrate(raw), schemaVersion: v + 1 };
  }
  return raw;
}

/** Parses any supported document version into a validated, current `GalbeDocument`. */
export function loadDocument(input: unknown, options: LoadOptions = {}): GalbeDocument {
  const raw = migrateRaw(input, options);
  try {
    return GalbeDocumentSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new GalbeDocumentError(
        'Invalid Galbe document.',
        error.issues
          .slice(0, 20)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      );
    }
    throw error;
  }
}

export function safeLoadDocument(
  input: unknown,
  options: LoadOptions = {},
): { ok: true; document: GalbeDocument } | { ok: false; error: GalbeDocumentError } {
  try {
    return { ok: true, document: loadDocument(input, options) };
  } catch (error) {
    if (error instanceof GalbeDocumentError) return { ok: false, error };
    throw error;
  }
}

/**
 * Version of the document schema. Bump only for breaking changes and register a
 * migration in `migrations.ts`. Additive changes rely on Zod defaults instead.
 */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/** Version of the `.galbe` container layout (zip structure), independent of the schema. */
export const GALBE_FILE_VERSION = 1 as const;

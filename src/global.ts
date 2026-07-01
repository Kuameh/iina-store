/**
 * Plugin global entry point.
 *
 * Intentionally minimal: this plugin has no global-entry responsibilities
 * in v1 (all logic lives in the main entry, src/index.ts). This file exists
 * only because package.json's `globalEntry`/`targets.global.source` still
 * reference it and it must be present as valid TypeScript for Parcel to
 * build that target.
 */

export {};

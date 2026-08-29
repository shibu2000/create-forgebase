/**
 * Schema barrel.
 *
 * Every table is re-exported here so `drizzle()` gets the full type map from
 * one import and `drizzle-kit` has a single entry point to diff against. The
 * CLI adds a line per module it installs.
 */

export * from './models/action.model.js';
export * from './models/auth.model.js';
// forgebase:region:master-data start
export * from './models/master-data.model.js';
// forgebase:region:master-data end
export * from './models/role.model.js';
export * from './models/user.model.js';

// forgebase:drizzle-schema — scaffolded modules re-export their tables here

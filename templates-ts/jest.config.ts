import { existsSync } from 'node:fs';

import type { Config } from 'jest';

/**
 * Jest, for a native-ESM project.
 *
 * This file is deliberately written to survive type-stripping unchanged: the
 * JavaScript variant of this scaffold is generated from the TypeScript one,
 * so anything TypeScript-only is decided at runtime rather than hardcoded.
 * `tsconfig.json` is only present in the TypeScript variant, which makes it a
 * reliable signal for which transform is needed.
 */
const isTypeScriptProject = existsSync(new URL('tsconfig.json', import.meta.url));
const extension = isTypeScriptProject ? 'ts' : 'js';

const config: Config = {
  testEnvironment: 'node',

  // Every test lives under tests/, one file per module, so `npm run test:user`
  // runs exactly the user module's unit and integration tests.
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.?([cm])[jt]s'],

  // ESM requires `.js` extensions on relative imports even when the file on
  // disk is `.ts`. This maps them back for the resolver.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  // Without this Jest transpiles to CommonJS and every `import.meta.url` in
  // the source breaks. Harmless in the JavaScript variant, which has no `.ts`.
  extensionsToTreatAsEsm: ['.ts'],

  // Plain ESM JavaScript needs no transform at all; only TypeScript does.
  transform: isTypeScriptProject ? { '^.+\\.ts$': ['ts-jest', { useESM: true }] } : {},

  // One PostgreSQL container is started for the whole run, not per file.
  //
  // These are resolved by Jest itself, not by the module loader, so
  // `moduleNameMapper` does not apply and the extension has to be the real one
  // on disk — unlike the `.js` specifiers used *inside* the test files.
  globalSetup: `<rootDir>/tests/setup/global-setup.${extension}`,
  globalTeardown: `<rootDir>/tests/setup/global-teardown.${extension}`,

  // Starting a container and pulling its image on a cold cache is slow.
  testTimeout: 60_000,

  // Integration tests share one database, so they must not interleave.
  maxWorkers: 1,

  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/db/migrations/**'],

  clearMocks: true,
  restoreMocks: true,
};

export default config;

import { existsSync } from 'node:fs';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

/**
 * ESLint, for either language variant of this scaffold.
 *
 * Like `jest.config`, this file is deliberately written to survive
 * type-stripping unchanged: the JavaScript variant is generated from the
 * TypeScript one, so anything TypeScript-only is decided at runtime rather
 * than hardcoded. `tsconfig.json` is only present in the TypeScript variant,
 * which makes it a reliable signal.
 */
const isTypeScriptProject = existsSync(new URL('tsconfig.json', import.meta.url));

/**
 * Loaded dynamically, and only when it is needed.
 *
 * A static import would make `typescript-eslint` — and, through its peer
 * dependency, `typescript` itself — mandatory in a JavaScript project that
 * has no other use for either. The top-level `await` resolves before ESLint
 * receives this module, so the rest of the file can treat it as a plain
 * value.
 */
const tseslint = isTypeScriptProject ? (await import('typescript-eslint')).default : null;

/**
 * The modules this project ships. Used to generate the cross-module
 * boundary rules below — add a module here when you add one to `src/modules`.
 */
const MODULES = ['user', 'role', 'action', 'auth', 'master-data'];

/**
 * Source globs cover both extensions in either variant.
 *
 * A single glob avoids a second runtime branch, and costs nothing: the
 * extension that is not in use simply matches no files.
 */
const SOURCES = '**/*.{ts,js}';

/**
 * The ORM restriction, shared by every scope that is not `src/db`.
 *
 * This is the constraint the whole repository pattern exists to protect, so
 * it is enforced rather than documented.
 */
const ORM_IMPORT_PATHS = [
  {
    name: 'sequelize',
    message: 'Only src/db may import an ORM. Depend on a repository interface instead.',
  },
  {
    name: 'drizzle-orm',
    message: 'Only src/db may import an ORM. Depend on a repository interface instead.',
  },
  {
    name: 'pg',
    message: 'Only src/db may talk to the driver. Depend on a repository interface instead.',
  },
];

const ORM_IMPORT_PATTERNS = [
  {
    group: ['drizzle-orm/*', 'sequelize/*', 'pg/*'],
    message: 'Only src/db may import an ORM. Depend on a repository interface instead.',
  },
];

/**
 * Builds a `no-restricted-imports` setting.
 *
 * ESLint replaces rather than merges rule options in an override, so every
 * scope has to restate the ORM rules. This keeps that from drifting.
 *
 * Matching is on the import specifier, not the resolved file. That is
 * deliberate: resolving `./x.js` to `x.ts` needs a TypeScript resolver, and a
 * boundary rule that silently stops firing when a resolver is missing is
 * worse than no rule at all.
 */
function restrictImports(extraPatterns = []) {
  return [
    'error',
    { paths: ORM_IMPORT_PATHS, patterns: [...ORM_IMPORT_PATTERNS, ...extraPatterns] },
  ];
}

/**
 * One override per module, forbidding imports from every sibling.
 *
 * Modules communicate through interfaces they declare themselves (see
 * `RoleLookup` in the user module) and are wired together in `routes`.
 * Without a rule, that discipline erodes the first time someone needs "just
 * one type" from a neighbour.
 */
const moduleBoundaryConfigs = MODULES.map((module) => ({
  files: [`src/modules/${module}/${SOURCES}`],
  ignores: ['**/*.test.{ts,js}'],
  rules: {
    'no-restricted-imports': restrictImports([
      {
        group: MODULES.filter((other) => other !== module).flatMap((other) => [
          `../${other}`,
          `../${other}/*`,
        ]),
        message:
          `This module must not import from a sibling module. Declare the narrow ` +
          'interface you need in your own module and let routes.js wire it up.',
      },
    ]),
  },
}));

/**
 * Everything that only makes sense with a type checker behind it.
 *
 * In the JavaScript variant this is an empty array, so no `@typescript-eslint`
 * rule is ever referenced — referencing one from an uninstalled plugin is a
 * hard ESLint error, not a warning.
 */
const typeAwareConfigs = tseslint
  ? [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      {
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
          },
        },
        rules: {
          // A forgotten `await` on a repository call is the single most common
          // way to get a silently empty result, so it is an error.
          '@typescript-eslint/no-floating-promises': 'error',
          '@typescript-eslint/no-misused-promises': 'error',
          '@typescript-eslint/await-thenable': 'error',

          /**
           * Off deliberately. Implementing a Promise-returning interface
           * without awaiting anything is legitimate and common here — the
           * log-only email provider, in-memory repository fakes, a readiness
           * check that only inspects a flag. The signature is dictated by the
           * contract, not by whether this particular body happens to need
           * `await`.
           */
          '@typescript-eslint/require-await': 'off',

          '@typescript-eslint/no-unused-vars': [
            'error',
            { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
          ],

          '@typescript-eslint/consistent-type-imports': [
            'error',
            { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
          ],
        },
      },
    ]
  : [
      {
        // The stock rule, which `typescript-eslint` would otherwise replace.
        rules: {
          'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
      },
    ];

/**
 * Type-aware rules cannot run on files outside the tsconfig, which is where
 * the config files themselves sit. Only relevant in the TypeScript variant.
 */
const configFileConfigs = tseslint
  ? [
      {
        files: ['*.config.js', '*.config.ts', 'eslint.config.js', 'jest.config.ts'],
        ...tseslint.configs.disableTypeChecked,
      },
    ]
  : [];

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/db/migrations/**'],
  },

  js.configs.recommended,

  ...typeAwareConfigs,

  {
    languageOptions: {
      globals: { ...globals.node },
    },

    plugins: {
      'import-x': importX,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      // ---------------------------------------------------- architecture
      /**
       * Only `src/db` may import an ORM. This is the constraint the whole
       * repository pattern exists to protect, so it is enforced rather than
       * documented.
       */
      'no-restricted-imports': restrictImports(),

      // --------------------------------------------------------- imports
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Node builtins, then packages, then this project, then styles.
            ['^node:'],
            ['^@?\\w'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
      'import-x/no-duplicates': 'error',

      // ------------------------------------------------------ correctness
      // `console` is how secrets end up in logs unredacted. env is the one
      // exception, since it reports before the logger exists.
      'no-console': 'error',
    },
  },

  ...moduleBoundaryConfigs,

  {
    /**
     * core is the foundation every module and adapter builds on, so it must
     * not depend on either — that would be a cycle in the architecture even
     * where TypeScript permits it.
     */
    files: [`src/core/${SOURCES}`],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: ['**/modules/*', '**/modules/*/*', '**/db/*', '**/db/*/*'],
          message:
            'core must not depend on a module or on the database layer. Invert the ' +
            'dependency: declare the contract in core and let the other side implement it.',
        },
      ]),
    },
  },

  {
    /**
     * The process entry point is the composition root for boot, and the one
     * place in `core` allowed to reach the database layer: registering the
     * connection is exactly what it exists to do, and the CLI splices that
     * registration in here. The module restriction still applies — wiring the
     * database is not licence to import a module.
     *
     * Nothing inside `core` imports this file, so the dependency it takes on
     * `src/db` cannot become a cycle.
     */
    files: ['src/core/server.ts', 'src/core/server.js'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: ['**/modules/*', '**/modules/*/*'],
          message:
            'The entry point may wire the database, but not a module. Modules are ' +
            'mounted through the API router, not imported here.',
        },
      ]),
    },
  },

  {
    // The database layer is the one place allowed to import an ORM.
    files: [`src/db/${SOURCES}`],
    rules: { 'no-restricted-imports': 'off' },
  },

  {
    // env reports invalid configuration before the logger can exist.
    files: ['src/core/env.ts', 'src/core/env.js'],
    rules: { 'no-console': 'off' },
  },

  {
    // Tests reach into the database directly and print their own output.
    files: [`tests/${SOURCES}`],

    /**
     * `describe`, `it` and `expect` are injected by the test runner rather
     * than imported. In the TypeScript variant `@types/jest` declares them
     * and `no-undef` is switched off anyway; the JavaScript variant has
     * neither, so without this every assertion is an error.
     */
    languageOptions: { globals: { ...globals.jest } },

    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
      ...(tseslint
        ? {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
          }
        : {}),
    },
  },

  ...configFileConfigs,

  // Must come last: switches off every rule Prettier already handles.
  prettier,
];

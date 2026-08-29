import simpleImportSort from 'eslint-plugin-simple-import-sort';

/**
 * The one rule the generator has to reapply to its own output.
 *
 * Stripping types deletes whole `import type` statements, and Babel's printer
 * does not preserve the blank line that separated the package imports from
 * the relative ones. `simple-import-sort` treats that blank line as the group
 * boundary, so the generated JavaScript fails the very lint rule the
 * generated project's CI runs — on a file nobody is allowed to hand-edit.
 *
 * The `groups` setting is copied verbatim from `templates-ts/eslint.config.js`.
 * If that changes, this must change with it, or the generator will "fix" files
 * into a shape the generated project then rejects.
 */
export default [
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            ['^node:'],
            ['^@?\\w'],
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'error',
    },
  },
];

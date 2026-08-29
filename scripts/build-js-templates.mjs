#!/usr/bin/env node
/**
 * Generates `templates-js/` from `templates-ts/`.
 *
 * The TypeScript templates are the single source of truth; the JavaScript
 * ones are build output and must never be hand-edited. This script is the
 * only thing that writes into `templates-js/`, and it clears the directory
 * first so a deleted or renamed source file cannot leave a stale copy behind.
 *
 * Type stripping is done with Babel rather than `tsc`, because Babel removes
 * types without type-checking or rewriting anything else — the emitted
 * JavaScript is the original file minus its annotations, which is what makes
 * the output reviewable.
 */
import { transformAsync } from '@babel/core';
import presetTypeScript from '@babel/preset-typescript';
import { ESLint } from 'eslint';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, 'templates-ts');
const TARGET = join(ROOT, 'templates-js');

/**
 * Files that exist only to serve the TypeScript toolchain.
 *
 * A JavaScript project has no compile step, so a tsconfig would be dead
 * weight that also makes `jest.config.js` believe it is in a TypeScript
 * project — see the `existsSync` check in that file.
 */
const TYPESCRIPT_ONLY = new Set(['tsconfig.json', 'tsconfig.build.json']);

const stats = { transformed: 0, copied: 0, skippedTypeOnly: 0, skippedToolchain: 0 };
const typeOnlyFiles = [];

/**
 * True when stripping types left nothing behind.
 *
 * Files such as `user.types.ts` and `*.repository.interface.ts` are pure type
 * declarations. Emitting an empty module for them would litter the generated
 * project with files that do nothing — and nothing imports them at runtime,
 * because every consumer uses `import type`, which Babel removes.
 */
function isEffectivelyEmpty(code) {
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, '')
    .trim();

  return withoutComments.length === 0;
}

async function transformFile(sourcePath, targetPath) {
  const source = readFileSync(sourcePath, 'utf8');

  const result = await transformAsync(source, {
    filename: sourcePath,
    babelrc: false,
    configFile: false,
    // Keeps blank lines and comment placement close to the original, so a
    // reader can diff the JavaScript against the TypeScript and recognise it.
    retainLines: false,
    comments: true,
    // `allowDeclareFields` was removed in Babel 8 — it is always on now.
    // `onlyRemoveTypeImports: false` is kept deliberately: it lets Babel elide
    // an import whose bindings are only used in type positions even without the
    // `type` keyword, which is what stops the dropped type-only modules from
    // leaving dangling imports behind.
    presets: [[presetTypeScript, { onlyRemoveTypeImports: false }]],
  });

  const stripped = result?.code ?? '';

  if (isEffectivelyEmpty(stripped)) {
    stats.skippedTypeOnly += 1;
    typeOnlyFiles.push(relative(SOURCE, sourcePath));
    return;
  }

  // Babel's output collapses the formatting Prettier gave the source, so it
  // is reformatted with the same config the templates use. The generated
  // JavaScript then passes the same `format:check` the TypeScript does.
  const formatted = await prettier.format(stripped, {
    ...(await prettier.resolveConfig(join(SOURCE, '.prettierrc.json'))),
    parser: 'babel',
  });

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, formatted);
  stats.transformed += 1;
}

async function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const sourcePath = join(directory, entry.name);
    const relativePath = relative(SOURCE, sourcePath);

    if (entry.isDirectory()) {
      await walk(sourcePath);
      continue;
    }

    if (TYPESCRIPT_ONLY.has(entry.name)) {
      stats.skippedToolchain += 1;
      continue;
    }

    if (extname(entry.name) === '.ts') {
      // `x.ts` becomes `x.js`; the `.js` import specifiers already written
      // throughout the source then resolve without any rewriting.
      const targetPath = join(TARGET, relativePath.replace(/\.ts$/, '.js'));
      await transformFile(sourcePath, targetPath);
      continue;
    }

    const targetPath = join(TARGET, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
    stats.copied += 1;
  }
}

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

await walk(SOURCE);

/**
 * Restores the import grouping the type strip destroyed.
 *
 * Deleting an `import type` statement takes the blank line that separated the
 * package imports from the relative ones with it, and `simple-import-sort`
 * reads that blank line as the group boundary. Without this pass the
 * generated project fails its own `npm run lint` — on files it forbids anyone
 * to hand-edit, which makes it unfixable by the person who hits it.
 *
 * The linter here is pinned to the same versions the templates enforce, so the
 * ordering it writes is the ordering the generated project's ESLint expects.
 */
async function sortImports() {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: join(ROOT, 'scripts', 'import-sort.config.mjs'),
    fix: true,
    errorOnUnmatchedPattern: false,
  });

  const results = await eslint.lintFiles([join(TARGET, '**/*.js')]);
  const fixed = results.filter((result) => result.output !== undefined);

  await ESLint.outputFixes(results);

  // Sorting can leave a line the formatter would have written differently, so
  // the touched files go back through Prettier rather than being trusted.
  const prettierConfig = await prettier.resolveConfig(join(SOURCE, '.prettierrc.json'));
  for (const result of fixed) {
    const code = readFileSync(result.filePath, 'utf8');
    writeFileSync(result.filePath, await prettier.format(code, { ...prettierConfig, parser: 'babel' }));
  }

  const unfixable = results.flatMap((result) =>
    result.messages.filter((message) => message.severity === 2 && !message.fix),
  );

  if (unfixable.length > 0) {
    console.error('\nImport sorting left errors that autofix could not resolve:');
    for (const message of unfixable.slice(0, 10)) console.error(`  ${message.ruleId}: ${message.message}`);
    process.exit(1);
  }

  return fixed.length;
}

stats.importsSorted = await sortImports();

writeFileSync(
  join(TARGET, 'GENERATED.md'),
  [
    '# Generated output — do not edit',
    '',
    'Every file in this directory is produced from `templates-ts/` by',
    '`npm run build:js`. Edits here are erased on the next run; change the',
    'TypeScript source instead.',
    '',
  ].join('\n'),
);

console.log('templates-js generated');
console.log(`  transformed:        ${stats.transformed}`);
console.log(`  copied verbatim:    ${stats.copied}`);
console.log(`  skipped (toolchain): ${stats.skippedToolchain}`);
console.log(`  skipped (type-only): ${stats.skippedTypeOnly}`);
console.log(`  import order restored: ${stats.importsSorted}`);

if (typeOnlyFiles.length > 0) {
  console.log('\n  type-only sources, which emit no JavaScript:');
  for (const file of typeOnlyFiles.sort()) console.log(`    ${file}`);
}

if (!existsSync(join(TARGET, 'core', 'server.js'))) {
  console.error('\nExpected core/server.js in the output — the build is wrong.');
  process.exit(1);
}

// A sanity check that costs nothing and catches a broken strip immediately.
const serverSource = readFileSync(join(TARGET, 'core', 'server.js'), 'utf8');
if (/:\s*(Promise<|string|number|void)\b/.test(serverSource)) {
  console.error('\nType annotations survived into the output — the strip failed.');
  process.exit(1);
}

void statSync(TARGET);

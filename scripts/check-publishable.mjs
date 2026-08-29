#!/usr/bin/env node
/**
 * Refuses to publish a package that is not ready.
 *
 * `npm publish` is irreversible in the way that matters: a version number can
 * be deprecated but never reused, and an unpublish window is 72 hours at best.
 * Everything checked here is something that is trivial to fix beforehand and
 * permanent afterwards.
 *
 * Runs from `prepublishOnly`, so it cannot be forgotten.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];
const fail = (message) => problems.push(message);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// ---------------------------------------------------------- placeholders
const serialised = JSON.stringify(pkg);
if (serialised.includes('FORGEBASE_PLACEHOLDER')) {
  const fields = Object.entries(pkg)
    .filter(([, value]) => JSON.stringify(value).includes('FORGEBASE_PLACEHOLDER'))
    .map(([key]) => key);

  fail(
    `package.json still has placeholder values in: ${fields.join(', ')}.\n` +
      '    Fill in the author, repository and homepage before publishing.',
  );
}

const license = join(ROOT, 'LICENSE');
if (!existsSync(license)) {
  fail('No LICENSE file, but package.json declares a license.');
} else if (readFileSync(license, 'utf8').includes('FORGEBASE_PLACEHOLDER')) {
  fail('LICENSE still names a placeholder copyright holder.');
}

// ------------------------------------------------------------- metadata
if (!pkg.private) {
  for (const field of ['name', 'version', 'description', 'license', 'bin', 'files', 'engines']) {
    if (!pkg[field]) fail(`package.json is missing "${field}".`);
  }
} else {
  fail('package.json still has "private": true, so `npm publish` will refuse.');
}

if (!existsSync(join(ROOT, 'README.md'))) {
  fail('No README.md — it is the package page on npm.');
}

// ------------------------------------------------------------ the binary
for (const [command, relative] of Object.entries(pkg.bin ?? {})) {
  const target = join(ROOT, relative);

  if (!existsSync(target)) {
    fail(`bin "${command}" points at ${relative}, which does not exist.`);
    continue;
  }

  const source = readFileSync(target, 'utf8');
  if (!source.startsWith('#!')) {
    fail(`bin "${command}" has no shebang, so it cannot be executed directly.`);
  }

  // npm sets the executable bit on publish, but a missing one locally usually
  // means the file was rewritten by a tool that dropped the mode.
  if ((statSync(target).mode & 0o111) === 0) {
    fail(`bin "${command}" is not executable (chmod +x ${relative}).`);
  }
}

// --------------------------------------------------------- build output
/**
 * `templates-js` is generated from `templates-ts`. Shipping a stale copy would
 * mean the JavaScript variant silently differs from the TypeScript one it is
 * supposed to mirror — the exact failure the single-source rule exists to
 * prevent.
 */
/** Newest modification time anywhere under a directory. */
function newestMtime(directory) {
  let latest = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }

  return latest;
}

const generated = join(ROOT, 'templates-js');

if (!existsSync(generated)) {
  fail('templates-js is missing. Run `npm run build:js`.');
} else if (newestMtime(join(ROOT, 'templates-ts')) > newestMtime(generated)) {
  fail('templates-js is older than templates-ts. Run `npm run build:js`.');
}

// ------------------------------------------------------- what ships
/**
 * `npm pack --dry-run` is the only authoritative answer to "what will be
 * published"; `files` is easy to get subtly wrong, and a missing template
 * directory would not fail until someone ran the published CLI.
 */
let packed;
try {
  // `--ignore-scripts` because `prepare` also builds the templates and prints
  // as it goes, and that output would be interleaved with the JSON. The build
  // has already run by the time this check does.
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  packed = JSON.parse(output)[0];
} catch (error) {
  fail(`could not determine package contents: ${error.message}`);
}

if (packed) {
  const names = new Set(packed.files.map((file) => file.path));
  const has = (prefix) => [...names].some((name) => name === prefix || name.startsWith(`${prefix}/`));

  for (const required of ['bin', 'src', 'manifests', 'templates-ts', 'templates-js']) {
    if (!has(required)) fail(`the published package would not contain ${required}/.`);
  }

  for (const forbidden of ['node_modules', '.env', 'scratchpad']) {
    if (has(forbidden)) fail(`the published package would contain ${forbidden}/.`);
  }

  /**
   * Every file the manifests point at must survive into the tarball.
   *
   * npm quietly drops a file named `.gitignore` when packing, which is why the
   * templates ship it dotless and rename it on the way out. Nothing about that
   * is visible when running the CLI from a checkout — it only appears once the
   * package has been published and installed, by which point the scaffolds it
   * produced are missing the file that keeps `.env` out of git.
   *
   * So rather than remembering this one case, every referenced path is checked
   * against what would actually ship.
   */
  const manifestDirectory = join(ROOT, 'manifests');
  const missing = [];

  for (const entry of readdirSync(manifestDirectory)) {
    if (!entry.endsWith('.json')) continue;
    const manifest = JSON.parse(readFileSync(join(manifestDirectory, entry), 'utf8'));

    const mappings = [
      ...Object.keys(manifest.files ?? {}),
      ...Object.values(manifest.variants ?? {}).flatMap((variant) => [
        ...Object.keys(variant.files ?? {}),
        ...Object.keys(variant.migrations ?? {}),
      ]),
    ];

    for (const mapping of mappings) {
      for (const language of ['ts', 'js']) {
        const path = mapping.replaceAll('<lang>', language).replaceAll('<ext>', language);
        if (manifest.js?.files?.[mapping] === null && language === 'js') continue;

        // Directories appear in the pack listing only through their contents.
        const shipped = [...names].some((name) => name === path || name.startsWith(`${path}/`));
        if (!shipped) missing.push(`${manifest.name}: ${path}`);
      }
    }
  }

  for (const entry of missing) {
    fail(`referenced by a manifest but not in the published package — ${entry}`);
  }

  const megabytes = packed.unpackedSize / 1024 / 1024;
  console.log(`  ${packed.files.length} files, ${megabytes.toFixed(1)} MB unpacked`);
}

// --------------------------------------------------------------- report
if (problems.length > 0) {
  console.error(`\nNot ready to publish — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(`\n${pkg.name}@${pkg.version} is ready to publish.`);

#!/usr/bin/env node
/**
 * Verifies that the templates and manifests actually compose into a coherent
 * project, for every language and ORM combination the CLI can produce.
 *
 * The templates on disk are a *staging* layout, not a project layout:
 * `templates-<lang>/db`, `templates-<lang>/drizzle/db` and
 * `templates-<lang>/modules/*` are all merged into `src/` by the manifests,
 * and `tests/` reaches back into `src/` from the project root. So a relative
 * import in a template is unresolvable where it sits and only becomes
 * meaningful after composition — which means naive linting of the template
 * directory reports dozens of false failures, and a genuinely broken import
 * hides among them.
 *
 * This script composes each combination in memory and checks the result,
 * which is the only place the question "does this import resolve?" has an
 * answer.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFESTS = join(ROOT, 'manifests');

const LANGUAGES = ['ts', 'js'];
const ORMS = ['sequelize', 'drizzle'];

const problems = [];
const report = (combo, kind, message) => problems.push({ combo, kind, message });

function loadManifests() {
  const manifests = new Map();
  for (const entry of readdirSync(MANIFESTS)) {
    if (!entry.endsWith('.json')) continue;
    const manifest = JSON.parse(readFileSync(join(MANIFESTS, entry), 'utf8'));
    manifests.set(manifest.name, manifest);
  }
  return manifests;
}

/** `templates-<lang>/seed.<ext>` → `templates-js/seed.js`. */
function substitute(path, language) {
  return path.replaceAll('<lang>', language).replaceAll('<ext>', language);
}

/**
 * Applies the per-language override block.
 *
 * A `null` value removes the inherited entry — that is how the JavaScript
 * variant drops `build`, `typecheck` and every `@types/*` package without
 * each manifest having to restate the entries it keeps.
 */
function applyOverrides(base, override) {
  if (!override) return { ...base };
  const merged = { ...base, ...override };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null) delete merged[key];
  }
  return merged;
}

/**
 * Every file mapping a manifest contributes, including its ORM variant and
 * its per-language overrides. A `null` destination removes the mapping — that
 * is how the TypeScript-only `tsconfig.json` is kept out of a JavaScript
 * project, whose template directory does not even contain one.
 */
function fileMappings(manifest, orm, language) {
  const variant = manifest.variants?.[orm] ?? {};
  const overrides = language === 'js' ? (manifest.js?.files ?? {}) : {};
  return applyOverrides({ ...manifest.files, ...variant.files, ...variant.migrations }, overrides);
}

/**
 * Builds the project a full install would produce: destination path →
 * absolute source path. Later manifests win, which is what makes
 * `templates-<lang>/db` and `templates-<lang>/<orm>/db` merge into one
 * `src/db` rather than conflict.
 */
function compose(manifests, language, orm, combo) {
  const composed = new Map();

  for (const manifest of manifests.values()) {
    // A full install takes one ORM, so the other ORM's manifest is not part
    // of this combination.
    if (manifest.orm && manifest.orm !== orm) continue;

    for (const [rawSource, rawDestination] of Object.entries(fileMappings(manifest, orm, language))) {
      const source = join(ROOT, substitute(rawSource, language));
      const destination = substitute(rawDestination, language);

      if (!existsSync(source)) {
        report(combo, 'missing-source', `${manifest.name}: ${substitute(rawSource, language)}`);
        continue;
      }

      if (statSync(source).isDirectory()) {
        for (const file of walk(source)) {
          composed.set(posix.join(destination, relative(source, file).split('\\').join('/')), file);
        }
      } else {
        composed.set(destination, source);
      }
    }
  }

  return composed;
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/**
 * Resolves a relative import against the composed project.
 *
 * Native ESM requires the `.js` extension on relative imports even when the
 * file on disk is `.ts`, so `./user.controller.js` legitimately means
 * `user.controller.ts` in the TypeScript variant.
 */
function resolves(composed, fromDestination, specifier) {
  const base = posix.join(posix.dirname(fromDestination), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}/index.js`, `${base}/index.ts`];
  return candidates.some((candidate) => composed.has(candidate));
}

const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g;

function checkImports(composed, combo) {
  for (const [destination, source] of composed) {
    if (!/\.(ts|js)$/.test(destination)) continue;
    const code = readFileSync(source, 'utf8');
    for (const [, specifier] of code.matchAll(IMPORT_PATTERN)) {
      if (!resolves(composed, destination, specifier)) {
        report(combo, 'dangling-import', `${destination} → ${specifier}`);
      }
    }
  }
}

/** Type syntax that Babel should have removed. Cheap, and catches a broken strip. */
const TYPE_SYNTAX = [
  [/^\s*(?:export\s+)?interface\s+\w/m, 'interface declaration'],
  [/^\s*(?:export\s+)?type\s+\w+\s*=/m, 'type alias'],
  [/\bimport\s+type\b/, 'import type'],
  [/\)\s*:\s*(?:Promise<|void\b|string\b|number\b|boolean\b)/, 'return type annotation'],
];

function checkJavaScriptIsTypeFree(composed, combo) {
  for (const [destination, source] of composed) {
    if (!destination.endsWith('.js')) continue;
    const code = readFileSync(source, 'utf8');
    for (const [pattern, label] of TYPE_SYNTAX) {
      if (pattern.test(code)) report(combo, 'type-syntax-survived', `${destination}: ${label}`);
    }
  }
}

/** A JavaScript project must not be handed a TypeScript toolchain. */
function checkJavaScriptHasNoTypeScript(manifests, composed, orm, combo) {
  for (const destination of composed.keys()) {
    if (/(^|\/)tsconfig[^/]*\.json$/.test(destination)) {
      report(combo, 'typescript-leaked', `tsconfig shipped to a JavaScript project: ${destination}`);
    }
  }

  for (const manifest of manifests.values()) {
    if (manifest.orm && manifest.orm !== orm) continue;

    const scripts = applyOverrides(manifest.scripts, manifest.js?.scripts);
    for (const [name, command] of Object.entries(scripts)) {
      if (/\.ts\b/.test(command) || /\b(tsx|tsc)\b/.test(command)) {
        report(combo, 'typescript-leaked', `${manifest.name} script "${name}": ${command}`);
      }
    }

    const devDependencies = applyOverrides(manifest.devDependencies, manifest.js?.devDependencies);
    for (const name of Object.keys(devDependencies)) {
      if (name.startsWith('@types/') || ['typescript', 'tsx', 'ts-jest', 'typescript-eslint'].includes(name)) {
        report(combo, 'typescript-leaked', `${manifest.name} devDependency: ${name}`);
      }
    }
  }
}

/** Every script the manifests declare must reference a file that exists. */
function checkScriptTargets(manifests, composed, language, orm, combo) {
  for (const manifest of manifests.values()) {
    if (manifest.orm && manifest.orm !== orm) continue;

    const scripts = applyOverrides(
      manifest.scripts,
      language === 'js' ? manifest.js?.scripts : undefined,
    );

    for (const [name, command] of Object.entries(scripts)) {
      const targets = [
        // Source and test files: `tsx src/seed.ts`, `jest tests/unit/x.test.ts`.
        ...command.matchAll(/(?:^|\s)((?:src|tests)\/[\w./-]+\.(?:ts|js))/g),
        // Config files a tool is pointed at: `tsc -p tsconfig.build.json`.
        ...command.matchAll(/-{1,2}(?:p|project|config)\s+([\w./-]+\.(?:json|ts|js))/g),
      ];

      for (const [, path] of targets) {
        if (!composed.has(path)) {
          report(combo, 'script-target-missing', `${manifest.name} "${name}" → ${path}`);
        }
      }
    }
  }
}

/** The markers the CLI splices generated fragments into must exist. */
function checkMarkers(manifests, composed, orm, combo) {
  const contents = [...composed.values()].map((source) => readFileSync(source, 'utf8'));

  for (const manifest of manifests.values()) {
    if (manifest.orm && manifest.orm !== orm) continue;

    const splices = [
      ...(manifest.register?.imports ?? []),
      ...(manifest.register?.statements ?? []),
    ];

    for (const { marker } of splices) {
      if (!contents.some((code) => code.includes(marker))) {
        report(combo, 'missing-marker', `${manifest.name} splices at "${marker}", which no template contains`);
      }
    }
  }

  // A region a manifest claims to own must actually exist, or deselecting the
  // module would silently leave its code behind.
  for (const manifest of manifests.values()) {
    if (!manifest.region) continue;
    const start = `forgebase:region:${manifest.region} start`;
    if (!contents.some((code) => code.includes(start))) {
      report(combo, 'missing-region', `${manifest.name} owns region "${manifest.region}", which no template marks`);
    }
  }
}

/**
 * Every template file must be claimed by some manifest.
 *
 * An unclaimed file is invisible: it sits in the repository looking like part
 * of the scaffold, passes every other check, and simply never reaches a
 * generated project. That is how `tsconfig.json` went missing while two
 * scripts still pointed at it.
 *
 * A file claimed by *either* ORM counts as claimed, since no single install
 * takes both.
 */
function checkForOrphans(manifests, language) {
  const templates = join(ROOT, `templates-${language}`);
  if (!existsSync(templates)) return;

  const claimed = new Set();
  for (const orm of ORMS) {
    for (const source of compose(manifests, language, orm, `${language}/orphan-scan`).values()) {
      claimed.add(source);
    }
  }

  // Written by the generator itself, not part of any scaffold.
  const ignored = new Set([join(templates, 'GENERATED.md')]);

  for (const file of walk(templates)) {
    if (!claimed.has(file) && !ignored.has(file)) {
      report(`${language}/*`, 'orphan-template', relative(ROOT, file));
    }
  }
}

/** The dependency graph must be closed and satisfiable. */
function checkGraph(manifests) {
  for (const manifest of manifests.values()) {
    for (const dependency of manifest.requires ?? []) {
      if (!manifests.has(dependency)) {
        report('graph', 'unknown-dependency', `${manifest.name} requires "${dependency}"`);
      }
    }
    for (const dependency of manifest.requiresOneOf ?? []) {
      if (!manifests.has(dependency)) {
        report('graph', 'unknown-dependency', `${manifest.name} requiresOneOf "${dependency}"`);
      }
    }
  }
}

// --------------------------------------------------------------------------

const manifests = loadManifests();
checkGraph(manifests);

console.log(`verifying ${manifests.size} manifests across ${LANGUAGES.length * ORMS.length} combinations\n`);

for (const language of LANGUAGES) {
  checkForOrphans(manifests, language);

  for (const orm of ORMS) {
    const combo = `${language}/${orm}`;

    if (!existsSync(join(ROOT, `templates-${language}`))) {
      report(combo, 'missing-source', `templates-${language} does not exist — run \`npm run build:js\``);
      continue;
    }

    const composed = compose(manifests, language, orm, combo);
    checkImports(composed, combo);
    checkScriptTargets(manifests, composed, language, orm, combo);
    checkMarkers(manifests, composed, orm, combo);

    if (language === 'js') {
      checkJavaScriptIsTypeFree(composed, combo);
      checkJavaScriptHasNoTypeScript(manifests, composed, orm, combo);
    }

    const failures = problems.filter((problem) => problem.combo === combo).length;
    const status = failures === 0 ? 'ok' : `${failures} problem(s)`;
    console.log(`  ${combo.padEnd(14)} ${String(composed.size).padStart(3)} files   ${status}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n`);
  for (const { combo, kind, message } of problems) {
    console.error(`  [${combo}] ${kind}: ${message}`);
  }
  process.exit(1);
}

console.log('\nAll combinations compose cleanly.');

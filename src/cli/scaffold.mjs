import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';

import { applyOverrides, ROOT, substitute } from './manifests.mjs';

/** Files a manifest owns that arrive through some *other* manifest's directory copy. */
function borrowedFiles(manifest, orm, language) {
  const variant = manifest.variants?.[orm] ?? {};
  const paths = [
    ...(variant.models ?? []).map((file) => `src/db/models/${file}`),
    ...(variant.repositories ?? []).map((file) => `src/db/repositories/${file}`),
    ...Object.values(variant.migrations ?? {}),
    ...(manifest.tests ?? []),
  ];
  return paths.map((path) => substitute(path, language));
}

function* walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/**
 * Builds the project: destination path → absolute source path.
 *
 * `src/db` is assembled from two directory copies (the ORM-neutral one and the
 * chosen ORM's), which is why later mappings must win rather than conflict.
 * Anything an *unselected* fragment owns is then subtracted, because a
 * directory copy is indiscriminate — the Drizzle repositories arrive as one
 * folder whether or not master-data was wanted.
 */
export function composeFiles({ selected, unselected, language, orm }) {
  const composed = new Map();

  for (const manifest of selected) {
    const variant = manifest.variants?.[orm] ?? {};
    const mappings = applyOverrides(
      { ...manifest.files, ...variant.files, ...variant.migrations },
      language === 'js' ? manifest.js?.files : undefined,
    );

    for (const [rawSource, rawDestination] of Object.entries(mappings)) {
      const source = join(ROOT, substitute(rawSource, language));
      const destination = substitute(rawDestination, language);
      if (!existsSync(source)) continue;

      if (statSync(source).isDirectory()) {
        for (const file of walk(source)) {
          const suffix = relative(source, file).split('\\').join('/');
          composed.set(posix.join(destination, suffix), file);
        }
      } else {
        composed.set(destination, source);
      }
    }
  }

  for (const manifest of unselected) {
    for (const path of borrowedFiles(manifest, orm, language)) composed.delete(path);
  }

  return composed;
}

const REGION = /^[ \t]*\/\/ forgebase:region:([\w-]+) (start|end)[ \t]*\r?\n/gm;
const MARKER_COMMENT = /^[ \t]*\/\/ forgebase:[^\n]*\r?\n/gm;

/**
 * Removes the blocks belonging to fragments that were not installed, then
 * takes the region markers themselves out.
 *
 * Deleting between two explicit markers is exact in a way that pattern-matching
 * source code is not: it does not care about formatting, nesting depth, or how
 * the code inside happens to be written.
 */
export function pruneRegions(code, keptRegions) {
  const lines = code.split('\n');
  const output = [];
  const dropping = [];

  for (const line of lines) {
    const start = /^\s*\/\/ forgebase:region:([\w-]+) start\s*$/.exec(line);
    if (start) {
      dropping.push(!keptRegions.has(start[1]));
      continue;
    }

    const end = /^\s*\/\/ forgebase:region:([\w-]+) end\s*$/.exec(line);
    if (end) {
      dropping.pop();
      continue;
    }

    if (!dropping.some(Boolean)) output.push(line);
  }

  return output.join('\n');
}

/**
 * Inserts a fragment's import and mount lines at the markers that name them.
 *
 * Imports go at a marker that sits on its own below the import block, separated
 * by a blank line. `simple-import-sort` treats a blank line as a group
 * boundary and sorts each group independently, so a spliced import lands in a
 * group of its own and cannot be out of order.
 */
export function splice(code, insertions) {
  let result = code;

  for (const [marker, lines] of insertions) {
    const pattern = new RegExp(`^([ \\t]*)// ${marker}[^\\n]*$`, 'm');
    const match = pattern.exec(result);
    if (!match) continue;

    const indent = match[1];
    // A trailing blank line is deliberate: `simple-import-sort` reads a blank
    // line as a group boundary, and a spliced `../` import has to stay in its
    // own group to be correctly ordered. The generator's own sort pass strips
    // the blank line that follows the marker in the JavaScript templates, so
    // it cannot be relied on being there already. A duplicate is harmless —
    // `stripMarkers` collapses runs of blank lines.
    const block = [...lines.map((line) => `${indent}${line}`), ''].join('\n');
    result = result.replace(pattern, `${match[0]}\n${block}`);
  }

  return result;
}

/** Strips the scaffolding markers, so the delivered project reads as hand-written. */
export function stripMarkers(code) {
  return code
    .replace(MARKER_COMMENT, '')
    .replace(/\n{3,}/g, '\n\n')
    // A marker on the last line leaves the file ending in a blank line, which
    // Prettier rejects. Exactly one trailing newline, always.
    .replace(/\s*$/, '\n');
}

/** Points the linter's module list at the modules actually installed. */
export function rewriteEslintModules(code, moduleNames) {
  const list = moduleNames.map((name) => `'${name}'`).join(', ');
  return code.replace(/const MODULES = \[[^\]]*\];/, `const MODULES = [${list}];`);
}

/** Collects every marker insertion the selected fragments ask for. */
export function collectInsertions(selected) {
  const insertions = new Map();

  const add = (marker, line) => {
    if (!insertions.has(marker)) insertions.set(marker, []);
    insertions.get(marker).push(line);
  };

  for (const manifest of selected) {
    for (const { marker, line } of manifest.register?.imports ?? []) add(marker, line);
    for (const { marker, line } of manifest.register?.statements ?? []) add(marker, line);
  }

  // Import lines are sorted by module specifier, matching what
  // `simple-import-sort` expects. Without this the order would depend on which
  // fragment happened to be read first, and two fragments splicing at the same
  // marker would produce a project that fails its own lint about half the time.
  for (const [marker, lines] of insertions) {
    if (!lines.every((line) => line.startsWith('import '))) continue;
    const specifier = (line) => /from\s+'([^']+)'/.exec(line)?.[1] ?? line;
    insertions.set(marker, [...lines].sort((a, b) => specifier(a).localeCompare(specifier(b))));
  }

  return insertions;
}

const TEXT = /\.(ts|js|mjs|cjs|json|md|yml|yaml|sql)$/;

/**
 * Drops journal entries whose migration is not in the project.
 *
 * drizzle-kit keeps an ordered journal beside the SQL files, and refuses to
 * migrate if it names one that is missing. Removing a module removes its
 * migration, so the journal has to be rewritten to match — otherwise the very
 * first `db:migrate` on a scaffold without that module fails, which is a
 * spectacularly bad first five minutes.
 *
 * Entries are matched against the files actually present rather than against
 * the module list, so this stays correct however the selection is made.
 */
function pruneDrizzleJournal(composed, targetDir) {
  const journalPath = 'src/db/migrations/meta/_journal.json';
  if (!composed.has(journalPath)) return;

  const target = join(targetDir, journalPath);
  const journal = JSON.parse(readFileSync(target, 'utf8'));

  const present = new Set(
    [...composed.keys()]
      .filter((path) => path.startsWith('src/db/migrations/') && path.endsWith('.sql'))
      .map((path) => path.split('/').pop().replace(/\.sql$/, '')),
  );

  const kept = (journal.entries ?? []).filter((entry) => present.has(entry.tag));
  if (kept.length === journal.entries?.length) return;

  const dropped = journal.entries.filter((entry) => !present.has(entry.tag));

  // `idx` is positional and drizzle-kit reads it as the ordering, so the kept
  // entries are renumbered rather than left with a gap.
  journal.entries = kept.map((entry, index) => ({ ...entry, idx: index }));
  writeFileSync(target, `${JSON.stringify(journal, null, 2)}\n`);

  // The snapshot that belonged to a dropped migration is now unreferenced.
  for (const entry of dropped) {
    const snapshot = join(targetDir, 'src/db/migrations/meta', `${String(entry.idx).padStart(4, '0')}_snapshot.json`);
    if (existsSync(snapshot)) rmSync(snapshot);
  }
}

export function writeProject({ composed, targetDir, selected, moduleNames }) {
  const keptRegions = new Set(selected.map((manifest) => manifest.region).filter(Boolean));
  const insertions = collectInsertions(selected);

  for (const [destination, source] of composed) {
    const target = join(targetDir, destination);
    mkdirSync(dirname(target), { recursive: true });

    // Anything without a text extension is copied byte for byte, which also
    // preserves the executable bit the husky hooks need.
    if (!TEXT.test(destination)) {
      cpSync(source, target);
      continue;
    }

    let code = readFileSync(source, 'utf8');
    code = pruneRegions(code, keptRegions);
    code = splice(code, insertions);
    if (destination === 'eslint.config.js') code = rewriteEslintModules(code, moduleNames);
    code = stripMarkers(code);

    writeFileSync(target, code);
  }

  pruneDrizzleJournal(composed, targetDir);
}

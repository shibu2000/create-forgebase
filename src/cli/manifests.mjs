import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * Fragments every project gets. They are not offered as choices because the
 * scaffold does not hold together without them: `routes` builds the auth
 * guards and hands `...guards` to every module router, so auth is structural
 * rather than optional, and seeding is what makes the action table match the
 * permissions the routes actually check.
 */
const ALWAYS = ['core', 'services-password', 'services-email', 'user-role-action', 'auth', 'seed'];

export function loadManifests() {
  const directory = join(ROOT, 'manifests');
  const manifests = new Map();

  for (const entry of readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue;
    const manifest = JSON.parse(readFileSync(join(directory, entry), 'utf8'));
    manifests.set(manifest.name, manifest);
  }

  return manifests;
}

/** Fragments the user is asked about, in the order they are offered. */
export function selectableModules(manifests) {
  return ['master-data'].map((name) => manifests.get(name)).filter(Boolean);
}

export function selectableExtras(manifests) {
  return ['testing', 'code-quality', 'ci', 'docs'].map((name) => manifests.get(name)).filter(Boolean);
}

/**
 * Closes the selection over `requires`, so choosing CI quietly brings in the
 * testing and lint fragments it runs rather than producing a workflow that
 * calls scripts the project does not have.
 *
 * Returns the resolved set plus whatever had to be added, so the CLI can say
 * so out loud instead of surprising the user.
 */
export function resolveSelection(manifests, { orm, modules, extras }) {
  const wanted = new Set([...ALWAYS, `db-${orm}`, ...modules, ...extras]);
  const added = new Set();

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...wanted]) {
      const manifest = manifests.get(name);
      if (!manifest) throw new Error(`Unknown fragment "${name}"`);

      for (const dependency of manifest.requires ?? []) {
        if (!wanted.has(dependency)) {
          wanted.add(dependency);
          if (!ALWAYS.includes(dependency)) added.add(dependency);
          changed = true;
        }
      }

      // `requiresOneOf` is already satisfied by the chosen ORM; it exists so a
      // fragment can say "some database, I do not care which".
      const oneOf = manifest.requiresOneOf ?? [];
      if (oneOf.length > 0 && !oneOf.some((option) => wanted.has(option))) {
        throw new Error(`${name} needs one of: ${oneOf.join(', ')}`);
      }
    }
  }

  const selected = [...wanted].map((name) => manifests.get(name));
  const unselected = [...manifests.values()].filter((manifest) => !wanted.has(manifest.name));

  return { selected, unselected, added: [...added] };
}

/** `templates-<lang>/seed.<ext>` → `templates-js/seed.js`. */
export function substitute(path, language) {
  return path.replaceAll('<lang>', language).replaceAll('<ext>', language);
}

/**
 * Applies a per-language override block. A `null` value removes the inherited
 * entry — how the JavaScript variant drops `build`, `typecheck` and the
 * `@types/*` packages without each manifest restating what it keeps.
 */
export function applyOverrides(base, override) {
  const merged = { ...base, ...(override ?? {}) };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null) delete merged[key];
  }
  return merged;
}

import { randomBytes } from 'node:crypto';

import { applyOverrides } from './manifests.mjs';

const sortKeys = (object) =>
  Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));

/**
 * Scripts naming a file the project does not have are dropped.
 *
 * This is what removes `test:master-data` when master-data was not installed,
 * without the testing fragment needing to know which modules exist. A script
 * that cannot run is worse than a missing one: it fails at the moment someone
 * trusts it.
 */
function dropUnrunnableScripts(scripts, files) {
  const kept = {};

  for (const [name, command] of Object.entries(scripts)) {
    const targets = [...command.matchAll(/(?:^|\s)((?:src|tests)\/[\w./-]+\.(?:ts|js))/g)];
    if (targets.every(([, path]) => files.has(path))) kept[name] = command;
  }

  return kept;
}

export function buildPackageJson({ name, selected, language, files }) {
  const isJs = language === 'js';
  let scripts = {};
  let dependencies = {};
  let devDependencies = {};

  for (const manifest of selected) {
    scripts = { ...scripts, ...applyOverrides(manifest.scripts, isJs ? manifest.js?.scripts : undefined) };
    dependencies = {
      ...dependencies,
      ...applyOverrides(manifest.dependencies, isJs ? manifest.js?.dependencies : undefined),
    };
    devDependencies = {
      ...devDependencies,
      ...applyOverrides(manifest.devDependencies, isJs ? manifest.js?.devDependencies : undefined),
    };
  }

  return {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=20.11' },
    scripts: sortKeys(dropUnrunnableScripts(scripts, files)),
    dependencies: sortKeys(dependencies),
    devDependencies: sortKeys(devDependencies),
  };
}

/**
 * `.env.example` is grouped by the fragment that introduced each variable, and
 * keeps the manifest's comment above it. A flat alphabetical list would be
 * tidier and far less useful — the grouping is what tells someone which
 * variables they can ignore.
 */
/**
 * Values the project cannot start without and that must not ship as a shared
 * constant. A blank secret is treated as unset by the env loader, so a
 * scaffold that left it blank would refuse to boot on the very first
 * `npm run dev` — the worst possible first impression, and the reason people
 * paste a weak secret in to get moving.
 */
export function generateSecrets(selected) {
  const secrets = {};

  for (const manifest of selected) {
    for (const entry of manifest.env ?? []) {
      if (/_SECRET$/.test(entry.key) && entry.value === '') {
        secrets[entry.key] = randomBytes(48).toString('base64');
      }
    }
  }

  return secrets;
}

export function buildEnvFile({ selected, overrides = {}, includeSecrets = true }) {
  const lines = [
    '# Environment configuration.',
    '#',
    '# Every variable below is validated at boot; the process refuses to start',
    '# rather than fail later at an arbitrary call site. A variable left blank',
    '# is treated as unset, so optional ones can stay empty.',
  ];

  for (const manifest of selected) {
    const entries = manifest.env ?? [];
    if (entries.length === 0) continue;

    lines.push('', `# --- ${manifest.label ?? manifest.name} ---`);

    for (const entry of entries) {
      if (entry.comment) lines.push(`# ${entry.comment}`);
      const value = Object.hasOwn(overrides, entry.key) ? overrides[entry.key] : entry.value;
      lines.push(`${entry.key}=${value}`);
    }
  }

  if (includeSecrets) lines.push('');
  return `${lines.join('\n')}\n`;
}

#!/usr/bin/env node
/**
 * Scaffolds every combination the CLI can produce and checks each one.
 *
 * The scaffold is assembled by pruning regions, splicing at markers and
 * subtracting files an unselected fragment owns. Each of those is exact in
 * isolation and none of them is verified by the templates passing their own
 * checks — a project that drops master-data is a shape that exists only after
 * the CLI has run. So the only real guarantee is to build every shape and look.
 *
 *   node scripts/test-matrix.mjs           structural checks, no installing
 *   node scripts/test-matrix.mjs --deep    also install, lint, typecheck and boot
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'bin', 'create-forgebase.mjs');
const DEEP = process.argv.includes('--deep');
const DOCKER = spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

const skipped = new Set();

const LANGUAGES = ['ts', 'js'];
const ORMS = ['sequelize', 'drizzle'];
const MODULE_SETS = [
  { name: 'full', modules: ['master-data'] },
  { name: 'minimal', modules: [] },
];

const failures = [];
const fail = (combo, message) => failures.push(`[${combo}] ${message}`);

function projectFiles(directory) {
  const files = [];
  (function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(directory, path).split('\\').join('/'));
    }
  })(directory);
  return files;
}

const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g;

function checkStructure(combo, directory, { modules }) {
  const files = projectFiles(directory);
  const fileSet = new Set(files);

  // 1. No scaffolding markers may survive into a delivered project.
  for (const file of files) {
    if (!/\.(ts|js|mjs|json|md|yml|yaml)$/.test(file)) continue;
    const code = readFileSync(join(directory, file), 'utf8');
    if (code.includes('forgebase:')) fail(combo, `marker left behind in ${file}`);
  }

  // 2. Every relative import must resolve. Native ESM writes `.js` even when
  //    the file on disk is `.ts`, so both are candidates.
  for (const file of files) {
    if (!/\.(ts|js)$/.test(file)) continue;
    const code = readFileSync(join(directory, file), 'utf8');

    for (const [, specifier] of code.matchAll(IMPORT_PATTERN)) {
      const base = posix.join(posix.dirname(file), specifier);
      const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}/index.js`, `${base}/index.ts`];
      if (!candidates.some((candidate) => fileSet.has(candidate))) {
        fail(combo, `dangling import ${file} → ${specifier}`);
      }
    }
  }

  // 3. A deselected module must leave nothing behind — no file, no mention.
  if (!modules.includes('master-data')) {
    for (const file of files) {
      if (file.includes('master-data')) fail(combo, `master-data file survived: ${file}`);
      if (!/\.(ts|js)$/.test(file)) continue;
      const code = readFileSync(join(directory, file), 'utf8');
      if (/master[-_]?[Dd]ata|masterData|MasterData/i.test(code)) {
        fail(combo, `master-data referenced in ${file} after being deselected`);
      }
    }
  } else if (!fileSet.has('src/modules/master-data/master-data.service.ts') &&
             !fileSet.has('src/modules/master-data/master-data.service.js')) {
    fail(combo, 'master-data was selected but its service is missing');
  }

  // 4. package.json must be valid and its scripts must point at real files.
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  } catch (error) {
    fail(combo, `package.json is not valid JSON: ${error.message}`);
    return { files: fileSet, packageJson: null };
  }

  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    for (const [, path] of command.matchAll(/(?:^|\s)((?:src|tests)\/[\w./-]+\.(?:ts|js))/g)) {
      if (!fileSet.has(path)) fail(combo, `script "${name}" points at missing ${path}`);
    }
  }

  // 5. The language variant must not leak the other language's toolchain.
  if (combo.startsWith('js')) {
    if (fileSet.has('tsconfig.json')) fail(combo, 'tsconfig shipped to a JavaScript project');
    for (const name of Object.keys(packageJson.devDependencies ?? {})) {
      if (name.startsWith('@types/') || ['typescript', 'tsx', 'ts-jest'].includes(name)) {
        fail(combo, `TypeScript devDependency in a JavaScript project: ${name}`);
      }
    }
  } else if (!fileSet.has('tsconfig.json')) {
    fail(combo, 'TypeScript project has no tsconfig.json');
  }

  for (const required of ['.env', '.env.example', 'README.md', 'package.json', '.gitignore']) {
    if (!fileSet.has(required)) fail(combo, `missing ${required}`);
  }

  // `.env` holds a generated JWT secret. A scaffold that does not ignore it is
  // one `git add .` away from publishing that secret.
  if (fileSet.has('.gitignore')) {
    const ignored = readFileSync(join(directory, '.gitignore'), 'utf8');
    if (!/^\.env$/m.test(ignored)) fail(combo, '.gitignore does not ignore .env');
    if (!/^node_modules\/?$/m.test(ignored)) fail(combo, '.gitignore does not ignore node_modules');
  }

  return { files: fileSet, packageJson };
}

function sh(command, args, cwd, env) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

const TEST_DATABASE_URL = process.env.FORGEBASE_TEST_DATABASE_URL;

async function checkDocs(combo, port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/docs/openapi.json`);
    const spec = await response.json();

    if (spec.openapi !== '3.1.0') {
      fail(combo, `/docs/openapi.json is not an OpenAPI 3.1 document: ${JSON.stringify(spec).slice(0, 200)}`);
      return;
    }

    const operations = Object.values(spec.paths ?? {}).reduce((total, ops) => total + Object.keys(ops).length, 0);
    if (operations === 0) {
      fail(combo, 'the generated OpenAPI document describes no operations');
      return;
    }

    // Documenting a route without saying which permission it needs would make
    // the document actively misleading, so it is checked rather than assumed.
    const guarded = Object.entries(spec.paths).filter(([path]) => path.startsWith('/users'));
    if (guarded.length > 0 && !guarded.some(([, ops]) => Object.values(ops).some((op) => op.security))) {
      fail(combo, 'user routes are documented as unauthenticated');
    }

    console.log(`  ${' '.repeat(26)}   openapi: ${Object.keys(spec.paths).length} paths, ${operations} operations`);
  } catch (error) {
    fail(combo, `could not read /docs/openapi.json: ${error.message}`);
  }
}

async function boot(combo, directory, port) {
  const entry = existsSync(join(directory, 'dist', 'core', 'server.js'))
    ? join('dist', 'core', 'server.js')
    : join('src', 'core', 'server.js');

  if (!existsSync(join(directory, entry))) return;

  const child = spawn('node', [entry], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      ...(TEST_DATABASE_URL ? { DATABASE_URL: TEST_DATABASE_URL } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        const body = await response.json();

        if (body?.data?.status !== 'ok') {
          fail(combo, `/health returned ${JSON.stringify(body)}`);
          return;
        }

        // An unknown path must be a 404. It was a 401 for a long time, because
        // a module guard mounted at `/` matched every request in the app.
        const missing = await fetch(`http://127.0.0.1:${port}/no-such-route`);
        const missingBody = await missing.json();
        if (missingBody?.error?.code !== 'ROUTE_NOT_FOUND') {
          fail(combo, `unknown route answered ${JSON.stringify(missingBody)} instead of 404`);
        }

        await checkDocs(combo, port);
        return;
      } catch {
        // Not listening yet.
      }
    }
    // Reaching the database is proof the composed app loaded, validated its
    // environment and ran its boot wiring — everything the scaffold controls.
    // Whether PostgreSQL then answers is not a property of the scaffold, so
    // without a database this is as far as the check can honestly go.
    if (/Database connection failed|ConnectionError|ECONNREFUSED|does not exist/.test(output)) {
      console.log(`  ${' '.repeat(26)}   (booted to the database step; no PostgreSQL available)`);
      return;
    }

    fail(combo, `server never answered on /health\n${output.slice(0, 500)}`);
  } finally {
    child.kill('SIGTERM');
  }
}

async function checkDeep(combo, directory, language, orm, port, installCache) {
  const cacheKey = `${language}/${orm}`;
  const cached = installCache.get(cacheKey);

  if (cached && existsSync(cached)) {
    sh('cp', ['-R', cached, join(directory, 'node_modules')], ROOT);
  }

  if (!existsSync(join(directory, 'node_modules'))) {
    const install = sh('npm', ['install', '--no-audit', '--no-fund'], directory);
    if (install.status !== 0) {
      fail(combo, `npm install failed: ${install.stderr?.slice(0, 300)}`);
      return;
    }
    installCache.set(cacheKey, join(directory, 'node_modules'));
  }

  const lint = sh('npm', ['run', 'lint'], directory);
  if (lint.status !== 0) fail(combo, `lint failed:\n${(lint.stdout || lint.stderr).slice(0, 800)}`);

  const format = sh('npm', ['run', 'format:check'], directory);
  if (format.status !== 0) fail(combo, `format:check failed:\n${(format.stdout || format.stderr).slice(0, 400)}`);

  if (language === 'ts') {
    const types = sh('npm', ['run', 'typecheck'], directory);
    if (types.status !== 0) fail(combo, `typecheck failed:\n${(types.stdout || types.stderr).slice(0, 800)}`);

    const build = sh('npm', ['run', 'build'], directory);
    if (build.status !== 0) fail(combo, `build failed:\n${(build.stdout || build.stderr).slice(0, 400)}`);
  }

  await boot(combo, directory, port);

  // The suite provisions its own PostgreSQL through Testcontainers, so it is
  // only runnable where a Docker daemon is. Skipping is reported rather than
  // silent: "the matrix passed" must never quietly mean "the tests never ran".
  if (packageJson(directory).scripts?.test) {
    if (!DOCKER) {
      skipped.add('tests (no Docker daemon)');
      return;
    }

    const tests = sh('npm', ['test'], directory);
    if (tests.status !== 0) {
      fail(combo, `tests failed:\n${`${tests.stdout ?? ''}${tests.stderr ?? ''}`.slice(-1500)}`);
    } else {
      const summary = /Tests:\s+(.+)/.exec(tests.stderr || tests.stdout);
      if (summary) console.log(`  ${' '.repeat(26)}   ${summary[1].trim()}`);
    }
  }
}

function packageJson(directory) {
  try {
    return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Checks on the CLI's own logic, before any scaffolding.
 *
 * These are the decisions that never show up in a generated file, so no amount
 * of inspecting output would catch them getting them wrong — `bun test` runs
 * bun's built-in runner rather than the package script, and a scaffold that
 * tells a bun user to type it sends them straight into "0 test files matching".
 */
async function checkCliLogic() {
  const { detectPackageManager, installCommand, runCommand } = await import('../src/cli/package-manager.mjs');
  const { validateProjectName, parseOptions } = await import('../src/cli/options.mjs');

  const expectations = [
    ['bun runs scripts explicitly', runCommand('bun', 'test'), 'bun run test'],
    ['npm runs scripts explicitly', runCommand('npm', 'test'), 'npm run test'],
    ['pnpm shorthand is fine', runCommand('pnpm', 'test'), 'pnpm test'],
    ['yarn shorthand is fine', runCommand('yarn', 'test'), 'yarn test'],
    ['yarn installs bare', installCommand('yarn').join(' ').trim(), 'yarn'],
    ['bun install', installCommand('bun').join(' '), 'bun install'],
    ['detects pnpm', detectPackageManager('pnpm/9.12.0 node/v22'), 'pnpm'],
    ['detects bun', detectPackageManager('bun/1.4.0 node/v22'), 'bun'],
    ['falls back to npm', detectPackageManager(undefined), 'npm'],
    ['rejects capitals', typeof validateProjectName('My-App'), 'string'],
    ['accepts a normal name', validateProjectName('my-api'), undefined],
  ];

  for (const [what, actual, expected] of expectations) {
    if (actual !== expected) fail('cli', `${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }

  try {
    parseOptions(['--nonsense']);
    fail('cli', 'an unknown flag was accepted');
  } catch {
    // Expected.
  }

  console.log(`  ${'cli logic'.padEnd(26)} ${failures.length === 0 ? 'ok' : 'problems'}`);
}

await checkCliLogic();

const workspace = mkdtempSync(join(tmpdir(), 'forgebase-matrix-'));
const installCache = new Map();
let port = 4100;

console.log(`matrix: ${LANGUAGES.length * ORMS.length * MODULE_SETS.length} combinations${DEEP ? ', deep' : ''}${DEEP && !DOCKER ? ', no Docker' : ''}\n`);

for (const language of LANGUAGES) {
  for (const orm of ORMS) {
    for (const set of MODULE_SETS) {
      const combo = `${language}/${orm}/${set.name}`;
      const directory = join(workspace, `${language}-${orm}-${set.name}`);
      const before = failures.length;

      const result = sh('node', [
        CLI,
        directory,
        `--lang=${language}`,
        `--orm=${orm}`,
        `--modules=${set.modules.join(',') || 'none'}`,
        '--smtp=skip',
        '--no-install',
        '-y',
      ], ROOT);

      if (result.status !== 0) {
        fail(combo, `CLI exited ${result.status}: ${(result.stderr || result.stdout)?.slice(0, 400)}`);
        console.log(`  ${combo.padEnd(26)} CLI FAILED`);
        continue;
      }

      checkStructure(combo, directory, set);
      if (DEEP) await checkDeep(combo, directory, language, orm, port++, installCache);

      const added = failures.length - before;
      console.log(`  ${combo.padEnd(26)} ${added === 0 ? 'ok' : `${added} problem(s)`}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(`\nProjects left in ${workspace} for inspection.`);
  process.exit(1);
}

rmSync(workspace, { recursive: true, force: true });

for (const skip of skipped) console.log(`\nSkipped: ${skip}`);
console.log(`\nEvery combination scaffolds correctly${skipped.size > 0 ? ' (with skips above)' : ''}.`);

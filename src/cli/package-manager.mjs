/**
 * Which package manager invoked us.
 *
 * npm, pnpm, yarn and bun all set `npm_config_user_agent` when they run a
 * binary, and it leads with `<name>/<version>`. Using it means `pnpm create`
 * installs with pnpm rather than silently producing an npm lockfile in a pnpm
 * workspace — the kind of mismatch that is discovered much later, in CI.
 */
export function detectPackageManager(userAgent = process.env.npm_config_user_agent) {
  if (!userAgent) return 'npm';

  const [spec] = userAgent.split(' ');
  const name = spec?.split('/')[0];

  return ['npm', 'pnpm', 'yarn', 'bun'].includes(name) ? name : 'npm';
}

export function installCommand(packageManager) {
  return packageManager === 'yarn' ? [packageManager, []] : [packageManager, ['install']];
}

/**
 * How the user runs a package script.
 *
 * `bun` needs the explicit `run`: `bun test` is bun's *own* test runner, which
 * ignores the `test` script entirely and reports "0 test files matching" — a
 * baffling first result for someone who just scaffolded a project with 65
 * tests in it. `bun run test` runs the script.
 *
 * pnpm and yarn pass an unrecognised word straight through to the script of
 * that name, so their shorthand is safe and is what their users expect.
 */
export function runCommand(packageManager, script) {
  if (packageManager === 'npm' || packageManager === 'bun') return `${packageManager} run ${script}`;
  return `${packageManager} ${script}`;
}

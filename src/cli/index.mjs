import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import * as p from '@clack/prompts';
import color from 'picocolors';

import { loadManifests, resolveSelection, selectableExtras, selectableModules, ROOT } from './manifests.mjs';
import { CHOICES, HELP, OptionError, parseOptions, validateProjectName } from './options.mjs';
import { detectPackageManager, installCommand, runCommand } from './package-manager.mjs';
import { buildEnvFile, buildPackageJson, generateSecrets } from './project-files.mjs';
import { composeFiles, writeProject } from './scaffold.mjs';

const version = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

function cancelled(value) {
  if (p.isCancel(value)) {
    p.cancel('Nothing was written.');
    process.exit(130);
  }
  return value;
}

/**
 * Refuses to scaffold over someone's work.
 *
 * A directory holding only editor or VCS metadata is treated as empty, because
 * `mkdir my-app && cd my-app && npm create forgebase .` is a normal way to
 * start and should not need `--force`.
 */
const IGNORABLE = new Set(['.git', '.DS_Store', '.idea', '.vscode']);

function directoryIsUsable(target) {
  if (!existsSync(target)) return true;
  return readdirSync(target).filter((entry) => !IGNORABLE.has(entry)).length === 0;
}

async function askQuestions(options, interactive) {
  const answers = {
    directory: options.directory,
    language: options.language,
    orm: options.orm,
    modules: options.modules,
    extras: options.extras,
    smtp: {},
  };

  if (!interactive) {
    answers.directory ??= 'forgebase-app';
    answers.language ??= 'ts';
    answers.orm ??= 'sequelize';
    answers.modules ??= [...CHOICES.MODULES];
    answers.extras ??= [...CHOICES.EXTRAS];
    return answers;
  }

  const manifests = loadManifests();

  if (answers.directory === undefined) {
    answers.directory = cancelled(
      await p.text({
        message: 'Project name',
        placeholder: 'my-api',
        validate: validateProjectName,
      }),
    );
  }

  if (answers.language === undefined) {
    answers.language = cancelled(
      await p.select({
        message: 'Language',
        options: [
          { value: 'ts', label: 'TypeScript', hint: 'recommended' },
          { value: 'js', label: 'JavaScript' },
        ],
      }),
    );
  }

  if (answers.orm === undefined) {
    answers.orm = cancelled(
      await p.select({
        message: 'Database layer',
        options: [
          { value: 'sequelize', label: 'Sequelize', hint: 'mature, batteries included' },
          { value: 'drizzle', label: 'Drizzle', hint: 'lighter, SQL-first' },
        ],
      }),
    );
  }

  if (answers.modules === undefined) {
    answers.modules = cancelled(
      await p.multiselect({
        message: 'Optional modules',
        options: selectableModules(manifests).map((manifest) => ({
          value: manifest.name,
          label: manifest.label ?? manifest.name,
          hint: manifest.description?.split('.')[0],
        })),
        initialValues: ['master-data'],
        required: false,
      }),
    );
  }

  if (answers.extras === undefined) {
    answers.extras = cancelled(
      await p.multiselect({
        message: 'Tooling',
        options: selectableExtras(manifests).map((manifest) => ({
          value: manifest.name,
          label: manifest.label ?? manifest.name,
        })),
        initialValues: [...CHOICES.EXTRAS],
        required: false,
      }),
    );
  }

  // User/Role/Action and Auth are always installed, so the SMTP question is
  // always relevant: forgot-password is part of the auth module either way.
  if (options.smtp !== 'skip') {
    const configure = cancelled(
      await p.confirm({
        message: 'Set up SMTP now?',
        initialValue: false,
      }),
    );

    if (configure) {
      answers.smtp.SMTP_HOST = cancelled(await p.text({ message: 'SMTP host', placeholder: 'smtp.example.com' }));
      answers.smtp.SMTP_PORT = cancelled(await p.text({ message: 'SMTP port', initialValue: '587' }));
      answers.smtp.SMTP_USER = cancelled(await p.text({ message: 'SMTP username', defaultValue: '' }));
      answers.smtp.SMTP_PASS = cancelled(await p.password({ message: 'SMTP password' }));
    }
  }

  return answers;
}

function runInstall(packageManager, cwd) {
  const [command, args] = installCommand(packageManager);

  return new Promise((resolveInstall) => {
    const child = spawn(command, args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' });
    child.on('error', () => resolveInstall(false));
    child.on('close', (code) => resolveInstall(code === 0));
  });
}

function readme({ name, language, orm, packageManager, hasTesting }) {
  const run = (script) => runCommand(packageManager, script);

  return `# ${name}

Express + PostgreSQL API scaffolded with create-forgebase — ${language === 'ts' ? 'TypeScript' : 'JavaScript'}, ${orm === 'drizzle' ? 'Drizzle' : 'Sequelize'}.

## Getting started

Copy the environment file and point \`DATABASE_URL\` at a PostgreSQL instance:

\`\`\`bash
cp .env.example .env
${run('db:migrate')}
${run('db:seed')}
${run('dev')}
\`\`\`

The API answers on \`/health\` immediately, before any database work.

## Architecture

- \`src/core\` — Express bootstrap, logging, env validation, error handling
- \`src/db\` — the only place an ORM may be imported
- \`src/modules/*\` — one folder per module; modules never import each other
- \`src/routes.${language}\` — the composition root, where modules are wired together

Authorization is checked against **actions**, never role names, so permissions
can change without a code change.
${
  hasTesting
    ? `
## Tests

\`\`\`bash
${run('test')}
\`\`\`

The suite starts a disposable PostgreSQL container, so **Docker must be
running**. No local database setup is needed.
`
    : ''
}`;
}

export async function run(argv) {
  let options;

  try {
    options = parseOptions(argv);
  } catch (error) {
    if (error instanceof OptionError) {
      console.error(`\n${color.red('✖')} ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (options.help) {
    console.log(HELP);
    return;
  }

  if (options.version) {
    console.log(version());
    return;
  }

  const interactive = !options.yes && process.stdout.isTTY && process.stdin.isTTY;

  p.intro(color.bgCyan(color.black(' create-forgebase ')));

  const answers = await askQuestions(options, interactive);
  const target = isAbsolute(answers.directory) ? answers.directory : resolve(process.cwd(), answers.directory);
  const name = basename(target);

  const nameProblem = validateProjectName(name);
  if (nameProblem) {
    p.cancel(nameProblem);
    process.exit(1);
  }

  if (!directoryIsUsable(target) && !options.force) {
    p.cancel(`${color.yellow(relative(process.cwd(), target) || target)} is not empty. Use --force to scaffold into it anyway.`);
    process.exit(1);
  }

  const manifests = loadManifests();
  let selection;

  try {
    selection = resolveSelection(manifests, {
      orm: answers.orm,
      modules: answers.modules,
      extras: answers.extras,
    });
  } catch (error) {
    p.cancel(error.message);
    process.exit(1);
  }

  if (selection.added.length > 0) {
    p.log.info(`Also including ${selection.added.join(', ')} — required by what you picked.`);
  }

  const packageManager = options.packageManager ?? detectPackageManager();
  const spinner = p.spinner();
  spinner.start('Writing project');

  const composed = composeFiles({
    selected: selection.selected,
    unselected: selection.unselected,
    language: answers.language,
    orm: answers.orm,
  });

  const installedModules = ['user', 'role', 'action', 'auth'];
  if (answers.modules.includes('master-data')) installedModules.push('master-data');

  mkdirSync(target, { recursive: true });
  writeProject({ composed, targetDir: target, selected: selection.selected, moduleNames: installedModules });

  const packageJson = buildPackageJson({
    name,
    selected: selection.selected,
    language: answers.language,
    files: new Set(composed.keys()),
  });

  writeFileSync(join(target, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  // `.env.example` is committed, so it keeps the blank placeholders. `.env` is
  // git-ignored and gets a real generated secret, so the project boots as soon
  // as a database is pointed at it.
  writeFileSync(join(target, '.env.example'), buildEnvFile({ selected: selection.selected }));
  writeFileSync(
    join(target, '.env'),
    buildEnvFile({
      selected: selection.selected,
      overrides: { ...generateSecrets(selection.selected), ...answers.smtp },
    }),
  );

  const hasTesting = selection.selected.some((manifest) => manifest.name === 'testing');
  writeFileSync(
    join(target, 'README.md'),
    readme({ name, language: answers.language, orm: answers.orm, packageManager, hasTesting }),
  );

  spinner.stop(`Wrote ${composed.size + 4} files to ${color.cyan(relative(process.cwd(), target) || '.')}`);

  const shouldInstall = options.install ?? true;
  let installed = false;

  if (shouldInstall) {
    spinner.start(`Installing with ${packageManager}`);
    installed = await runInstall(packageManager, target);
    spinner.stop(
      installed ? `Installed with ${packageManager}` : color.yellow(`${packageManager} install failed — run it yourself`),
    );
  }

  const steps = [`cd ${relative(process.cwd(), target) || '.'}`];
  if (!installed) steps.push(installCommand(packageManager).flat().join(' '));
  steps.push(runCommand(packageManager, 'db:migrate'), runCommand(packageManager, 'db:seed'), runCommand(packageManager, 'dev'));

  p.note(steps.join('\n'), 'Next steps');

  const closing = [
    `Set ${color.cyan('DATABASE_URL')} in ${color.cyan('.env')} before migrating.`,
    hasTesting ? `${color.cyan(runCommand(packageManager, 'test'))} needs Docker running — it starts its own PostgreSQL.` : null,
  ].filter(Boolean);

  p.outro(closing.join('\n'));
}

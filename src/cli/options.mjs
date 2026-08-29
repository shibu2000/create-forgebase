const LANGUAGES = ['ts', 'js'];
const ORMS = ['sequelize', 'drizzle'];
const EXTRAS = ['testing', 'code-quality', 'ci', 'docs'];
const MODULES = ['master-data'];
const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'];

export class OptionError extends Error {}

const ALIASES = { language: 'lang', y: 'yes', h: 'help', v: 'version' };

function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new OptionError(`--${name} must be one of: ${allowed.join(', ')} (got "${value}")`);
  }
  return value;
}

function list(name, value, allowed) {
  if (value === '' || value === 'none') return [];

  return value.split(',').map((entry) => {
    const trimmed = entry.trim();
    if (!allowed.includes(trimmed)) {
      throw new OptionError(`--${name} does not know "${trimmed}". Available: ${allowed.join(', ')}`);
    }
    return trimmed;
  });
}

/**
 * Parses argv into answers, leaving anything unspecified `undefined` so the
 * interactive flow knows what it still has to ask. A flag and a prompt are
 * therefore never both consulted for the same question.
 */
export function parseOptions(argv) {
  const options = { modules: undefined, extras: undefined, smtp: undefined };
  const positional = [];

  for (const argument of argv) {
    if (!argument.startsWith('-')) {
      positional.push(argument);
      continue;
    }

    const [rawName, rawValue] = argument.replace(/^--?/, '').split('=');
    const name = ALIASES[rawName] ?? rawName;
    const value = rawValue;

    switch (name) {
      case 'help':
      case 'version':
        options[name] = true;
        break;
      case 'yes':
        options.yes = true;
        break;
      case 'force':
        options.force = true;
        break;
      case 'install':
        options.install = true;
        break;
      case 'no-install':
        options.install = false;
        break;
      case 'lang':
        options.language = oneOf('lang', value, LANGUAGES);
        break;
      case 'orm':
        options.orm = oneOf('orm', value, ORMS);
        break;
      case 'modules':
        options.modules = list('modules', value ?? '', MODULES);
        break;
      case 'extras':
        options.extras = list('extras', value ?? '', EXTRAS);
        break;
      case 'no-extras':
        options.extras = [];
        break;
      case 'smtp':
        options.smtp = oneOf('smtp', value, ['skip']);
        break;
      case 'pm':
        options.packageManager = oneOf('pm', value, PACKAGE_MANAGERS);
        break;
      default:
        throw new OptionError(`Unknown option "--${rawName}". Run with --help to see what is available.`);
    }
  }

  if (positional.length > 1) {
    throw new OptionError(`Expected one project name, got ${positional.length}: ${positional.join(' ')}`);
  }

  options.directory = positional[0];
  return options;
}

/**
 * A project name that is also a usable directory name and a valid npm package
 * name — the scaffold writes it into `package.json`, where npm rejects capitals
 * and leading dots outright.
 */
export function validateProjectName(name) {
  if (!name || name.trim() === '') return 'Please enter a project name.';
  if (name !== name.trim()) return 'Project name cannot start or end with a space.';
  if (name === '.' || name === '..') return 'Please choose a name, not a path.';
  if (name.includes('/') || name.includes('\\')) return 'Project name cannot contain a path separator.';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return 'Use lowercase letters, digits, dots, dashes and underscores; start with a letter or digit.';
  }
  if (name.length > 214) return 'Project name is too long for npm (max 214 characters).';
  return undefined;
}

export const CHOICES = { LANGUAGES, ORMS, EXTRAS, MODULES, PACKAGE_MANAGERS };

export const HELP = `
  create-forgebase — scaffold a production-ready Express + PostgreSQL backend.

  Usage
    npx create-forgebase <project-name> [options]

  Options
    --lang=<ts|js>              Language variant                   (prompted)
    --orm=<sequelize|drizzle>   Database layer                     (prompted)
    --modules=<list>            Optional modules: master-data      (prompted)
    --extras=<list>             testing, code-quality, ci, docs    (default: all)
    --no-extras                 Skip all of the above
    --smtp=skip                 Do not ask for SMTP credentials
    --pm=<npm|pnpm|yarn|bun>    Override package-manager detection
    --no-install                Write the files, skip installing
    --force                     Scaffold into a non-empty directory
    -y, --yes                   Accept defaults, ask nothing
    -h, --help                  Show this message
    -v, --version               Show the version

  Examples
    npx create-forgebase my-app
    npx create-forgebase my-app --lang=ts --orm=drizzle --modules=master-data --smtp=skip
    npx create-forgebase my-app -y --no-install
`;

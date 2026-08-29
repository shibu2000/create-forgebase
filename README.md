# create-forgebase

Scaffold a production-ready Express + PostgreSQL backend — in TypeScript or JavaScript, with Sequelize or Drizzle.

```bash
npx create-forgebase my-api
```

It asks five questions, writes the project, installs with whichever package manager you invoked it with, and leaves you with an API that boots, migrates, seeds, tests and documents itself.

## What you get

- **Express 5** with Helmet, CORS, rate limiting on auth routes, request-id logging and graceful shutdown
- **PostgreSQL** through a repository layer — your services never import an ORM, so the ORM stays swappable
- **Users, roles and actions**, with authorization checked against *actions*, never role names
- **Auth** — login, refresh, logout, forgot/reset password over real SMTP (or logged to the console until you have credentials)
- **Master data** — the type/item pattern, optional
- **Jest + Supertest + Testcontainers** — 65 tests that run on a clean clone with nothing but Docker
- **ESLint + Prettier + Husky**, with lint rules that enforce the architecture rather than describe it
- **GitHub Actions CI**, and **OpenAPI 3.1 + Swagger UI** generated from the routes themselves

## Requirements

- **Node 20.11+**
- **PostgreSQL** to run the app
- **Docker** to run the tests — Testcontainers starts and disposes of its own database, so there is no test-database setup step

## Choices

```
✔ Project name: my-api
✔ Language: TypeScript / JavaScript
✔ Database layer: Sequelize / Drizzle
✔ Optional modules: Master Data
✔ Tooling: Testing, ESLint + Prettier + Husky, CI, API documentation
✔ Set up SMTP now? Yes / Skip
```

Both languages and both ORMs are fully supported and equally tested — the JavaScript variant is generated from the TypeScript source, never hand-maintained, so the two cannot drift apart.

## Non-interactive

Every prompt has a flag, for CI and scripting:

```bash
npx create-forgebase my-api \
  --lang=ts --orm=drizzle \
  --modules=master-data \
  --extras=testing,code-quality,ci,docs \
  --smtp=skip
```

| Flag | Meaning |
| --- | --- |
| `--lang=<ts\|js>` | Language variant |
| `--orm=<sequelize\|drizzle>` | Database layer |
| `--modules=<list>` | Optional modules, or `none` |
| `--extras=<list>` | `testing`, `code-quality`, `ci`, `docs` (default: all) |
| `--no-extras` | Skip all tooling |
| `--smtp=skip` | Do not ask for SMTP credentials |
| `--pm=<npm\|pnpm\|yarn\|bun>` | Override package-manager detection |
| `--no-install` | Write the files, skip installing |
| `--force` | Scaffold into a non-empty directory |
| `-y, --yes` | Accept defaults, ask nothing |

The package manager is detected from the one that invoked the CLI, so `pnpm create forgebase` installs with pnpm rather than leaving an npm lockfile in a pnpm workspace.

## The generated project

```
src/
  core/          Express bootstrap, env validation, logging, errors, health
  db/            Connection, migrations, models, repositories — the only ORM code
  modules/       user, role, action, auth, master-data
  services/      password hashing, email
  docs/          OpenAPI document, generated from the mounted routes
  routes.ts      The composition root, where modules are wired together
tests/
  unit/          One file per module, repositories mocked
  integration/   One file per module, Supertest against real PostgreSQL
```

```bash
npm run dev            # watch mode
npm run db:migrate     # apply migrations
npm run db:seed        # create the actions, an admin role and the first admin
npm test               # 65 tests; needs Docker
npm run test:user      # or just one module
```

Documentation is served at `/docs`, with the raw specification at `/docs/openapi.json`. It is generated from the routers that are actually mounted, the zod schemas already used for validation, and the action each route requires — so it cannot drift from the code, and a route you add tomorrow is documented the moment you write it.

## Three rules the scaffold enforces

**Only `src/db` may import an ORM.** Services and controllers depend on repository interfaces. This is an ESLint error, not a convention — which is why the same service code runs unchanged on both Sequelize and Drizzle.

**Authorization is by action, never by role name.** `authorize('user:delete')` rather than `if (role === 'admin')`. Roles group actions and change per deployment; actions are the stable vocabulary the code is written against.

**Modules never import each other.** They declare the narrow interface they need — the user module asks for a `RoleLookup`, not the role module — and `routes.ts` supplies it. Also an ESLint error.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, how the
JavaScript variant is generated from the TypeScript source, and how to run the
verification matrix.

## License

MIT

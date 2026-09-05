# create-forgebase

Scaffold a production-ready Express + PostgreSQL backend — in TypeScript or JavaScript, with Sequelize or Drizzle.

```bash
npx create-forgebase my-api
```

It asks five questions, writes the project, installs with whichever package manager you invoked it with, and leaves you with an API that boots, migrates, seeds, tests and documents itself.

## What you get

- **Express 5** with Helmet, CORS, rate limiting on auth routes, request-id logging and graceful shutdown
- **PostgreSQL** through a repository layer — your controllers never import an ORM, so the ORM stays swappable
- **A flat module shape** — route, controller, repository. The controller holds the logic; there is no service layer to hunt through
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
    user/
      user.route.ts       paths, validation, permissions
      user.controller.ts  the logic
      user.schema.ts      zod schemas for body, params and query
      user.errors.ts      this module's AppErrors
      user.types.ts       domain types
      user.repository.interface.ts   what the ORM must provide
  services/      password hashing, email
  docs/          OpenAPI document, generated from the mounted routes
  routes.ts      The composition root, where modules are wired together
tests/
  unit/          One file per module, repositories mocked
  integration/   One file per module, Supertest against real PostgreSQL
```

Every endpoint is three files, always in the same order:

```
src/routes.ts                                           which module owns which URL prefix
  └─ src/modules/user/user.route.ts                     path, validation, permission
       └─ src/modules/user/user.controller.ts           ← the logic. Start here.
            └─ src/db/repositories/user.repository.ts   the SQL
```

The controller holds the business logic. The route file above it only unpacks
the request and picks a status code; the repository below it only talks to the
database.

```bash
npm run dev            # watch mode
npm run db:migrate     # apply migrations
npm run db:seed        # create the actions, an admin role and the first admin
npm test               # 65 tests; needs Docker
npm run test:user      # or just one module
```

Documentation is served at `/docs`, with the raw specification at `/docs/openapi.json`. It is generated from the routers that are actually mounted, the zod schemas already used for validation, and the action each route requires — so it cannot drift from the code, and a route you add tomorrow is documented the moment you write it.

## Three rules the scaffold enforces

**Only `src/db` may import an ORM.** Controllers depend on repository interfaces. This is an ESLint error, not a convention — which is why the same controller code runs unchanged on both Sequelize and Drizzle.

**Authorization is by action, never by role name.** `authorize('user:delete')` rather than `if (role === 'admin')`. Roles group actions and change per deployment; actions are the stable vocabulary the code is written against.

**Modules never import each other.** They declare the narrow interface they need — the user module asks for a `RoleLookup`, not the role module — and `routes.ts` supplies it. Also an ESLint error.

## Upgrading from 1.x

**Projects already scaffolded with 1.x are unaffected** — their code is
generated and yours to keep, and nothing here reaches back into it.

What changed is the shape of *newly* generated projects. 1.x emitted
`route → controller → service → repository`, where the controller was a
pass-through and the logic sat in `x.service.ts`. 2.0 drops that layer: the
service was renamed to `x.controller.ts` and the pass-through deleted, so the
file named "controller" is the file holding the logic.

To bring a 1.x project into the same shape by hand: delete `x.controller.ts`,
rename `x.service.ts` to `x.controller.ts` (`createXService` →
`createXController`, `XServiceDeps` → `XControllerDeps`), and move the
`req.validated` unwrapping from the old controller inline into `x.route.ts`.
No behaviour changes — the routes, responses and tests stay the same.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, how the
JavaScript variant is generated from the TypeScript source, and how to run the
verification matrix.

## License

MIT

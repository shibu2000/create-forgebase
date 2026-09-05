# Working on create-forgebase

This is the guide to the *tool*. For what it produces, see [README.md](README.md).

```bash
git clone https://github.com/shibu2000/create-forgebase.git
cd create-forgebase
npm install          # also generates templates-js/ via `prepare`
node bin/create-forgebase.mjs /tmp/demo --lang=ts --orm=drizzle -y --no-install
```

## How it is laid out

```
bin/            The entry point. Thin — it just calls src/cli.
src/cli/        Prompts, flag parsing, manifest resolution, file composition.
manifests/      One JSON file per fragment: its files, dependencies,
                scripts, env vars, and where it splices itself in.
templates-ts/   The source of truth. Every template, in TypeScript.
templates-js/   Generated. Never edit by hand — see below.
scripts/        Build and verification tooling.
```

## The one rule

**`templates-js/` is generated from `templates-ts/` and must never be hand-edited.**
`npm run build:js` strips the types with Babel and reformats with Prettier. It is
git-ignored, regenerated on `npm install`, and rebuilt before every publish, so
an edit there is not merely discouraged — it is erased.

This is why shared files decide language-specific behaviour *at runtime* rather
than being forked. `jest.config`, `eslint.config` and the test setup all check
for `tsconfig.json` and adapt, because one file has to work after type-stripping.

## Verifying a change

Three commands, in increasing order of thoroughness.

```bash
npm run verify:templates      # seconds, no install
npm run test:matrix           # ~1 min, scaffolds all 8 combinations
npm run test:matrix:deep      # ~15 min, installs and runs each one
```

**`verify:templates`** composes every language × ORM combination in memory and
checks that imports resolve, manifests reference files that exist, no template is
orphaned, and the JavaScript variant carries no TypeScript.

Templates are a *staging* layout, not a project layout: `templates-ts/db` and
`templates-ts/<orm>/db` both become `src/db`. A relative import is therefore
unresolvable where it sits and only becomes meaningful after composition — which
is why linting the template directory directly reports dozens of false failures.

**`test:matrix`** scaffolds all eight combinations and checks the output —
no leftover markers, no dangling imports, nothing belonging to a deselected
module, a `.gitignore` that covers `.env`.

**`test:matrix:deep`** additionally installs each one and runs its lint,
typecheck, build, boot and full Jest suite. This needs **Docker** running
(Testcontainers), and a PostgreSQL for the boot check:

```bash
colima start                                     # or Docker Desktop
FORGEBASE_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/app_development \
  npm run test:matrix:deep
```

Without Docker it says so and skips the suites rather than passing quietly.

## Adding a module

1. Write `templates-ts/modules/<name>/` — route, controller, schema, errors,
   types, repository interface. Copy the shape of an existing module: the
   route file wires path → validation → permission → controller, and the
   controller holds the logic.
2. Add repositories and models under both `templates-ts/sequelize/db/` and
   `templates-ts/drizzle/db/`, plus a migration for each.
3. Write `manifests/<name>.json`: its files, dependencies, env vars, and the
   `variants` block naming the models, repositories and migrations it owns —
   that list is what removes them when the module is not selected.
4. If the module is optional, wrap its blocks in `routes.ts`, `seed.ts`, the
   Drizzle schema barrel and the test helper's table list with:
   ```ts
   // forgebase:region:<name> start
   // forgebase:region:<name> end
   ```
   and give the manifest a `"region": "<name>"`. The CLI deletes marked regions
   for modules that were not chosen.
5. Add `tests/unit/<name>.controller.test.ts` and `tests/integration/<name>.test.ts`,
   and list them under `"tests"` in the manifest so they are removed too.
6. Register it in `selectableModules()` in `src/cli/manifests.mjs`.
7. Run the deep matrix.

A module's tests must not depend on another module's data — deselecting one
would then break the other's suite.

## Releasing

```bash
npm version patch|minor|major
npm publish
```

`prepublishOnly` rebuilds the templates, verifies all four combinations, and runs
`check:publishable`, which refuses to publish if metadata is missing, the build
output is stale, or any file a manifest references would not make it into the
tarball. That last check exists because **npm silently strips `.gitignore` from
published packages** — the templates ship it as `gitignore` and the CLI renames
it on the way out.

## Dependency policy

Every version is pinned **exactly** — no `^`, no `~` — and kept at the newest
release the toolchain accepts.

`typescript` is deliberately held at 6.x: `typescript-eslint` declares a peer of
`<6.1.0` and `ts-jest` declares `<7`, so TypeScript 7 would break type-aware
linting and the test transform. Check their `peerDependencies` before raising it.

Upgrade in stages, running the deep matrix after each, so a failure points at a
few packages rather than all of them.

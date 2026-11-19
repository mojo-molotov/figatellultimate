# figatellultimate — collaboration instructions

figatellultimate is a typed, filesystem-driven content management library (MDX), with an i18n layer whose schema is derived from the content, a headless faceted-collection engine with its state in the URL, local search, and a minimal design system. It is a pnpm monorepo: the packages under `packages/`, a Next.js example app under `examples/next`, and the repository's own checks under `tooling/`.

This file is self-contained: every rule that applies to the project is written here, and each one is checked mechanically wherever a check can exist.

## Where knowledge lives

There are no architecture, spec, roadmap or decision documents: **the code and the tests are the documentation**.

- **Every module opens with a header comment**: what it is, its architecture (an ASCII diagram of the flow when it helps), its key design decisions and why (including the alternatives rejected when it matters), its invariants and the test that checks each, its limitations.
- **Every export carries a full JSDoc**: a summary, `@param`, `@returns`, `@throws` when it throws, and an `@example` for public functions and components. Keep examples short: the detail lives in the module header.
- A decision taken with the user goes into the header of the module it shapes, as a key design decision with its reason.
- **No ids**: no decision, spec, step or bug numbers in code, tests, changesets or package metadata. A test title describes the behavior it checks; an invariant names the test file that checks it.
- figatellultimate is a new project: comments describe what it does and why, never a comparison with a previous project.
- Package READMEs are minimal, for npm: what the package does, its installation, one usage example.
- Never write `*/` inside a comment (e.g. a path like `.figatellultimate/*/index.js`): it closes the comment.

## Workflow

1. **Questions**: open design decisions are asked via AskUserQuestion.
   - At most 4 questions per call, 2 to 4 options each; the recommended option first, marked as recommended.
   - Each question stands on its own: it briefly recalls the context.
   - A `preview` (code, tree, API) when variants need to be compared visually.
   - If the user answers outside the options or postpones, follow their answer without insisting.
   - Don't ask what has an obvious conventional answer: choose and say so.
2. **Test first**: scenarios written once and replayed on each implementation, type tests, a regression test for every bug found.
3. **Implement** the smallest increment that makes the tests pass; one module at a time.
4. **Document in the code**: the module's header and the exports' JSDoc, as above; the README only if the usage example changes.
5. **Check**: `pnpm check` (format, lint `--max-warnings 0`, dependency-cruiser, knip, typecheck, tests, build, the CLI's surface, publint and attw), run from the repository root; the example's `example:build`, `example:verify` and `example:browse` (Next's real navigation in Chromium) when it is affected; real browsers (`pnpm test:browser`) for components.
6. **Close**: a changeset for changed packages; summarize; propose a Conventional commit message. **Commit only on request**, push only on request.

## Principle

**An invariant is written, then checked.** A rule stated in a module header or in this file has a test, a lint rule or a CI step that fails when it drifts: role boundaries through ESLint and dependency-cruiser, documentation through the tooling tests, published exports through publint and attw. A rule nobody checks ends up false.

## Architecture

- **A DX layer, not a content engine.** Generic content processing (files, frontmatter, schemas, MDX, watching, routing, i18n formatting) is delegated to an existing tool behind a port, replaceable; figatellultimate implements what is specific to it.
- **Ports and adapters.** The core never imports an adapter and does no I/O; it never reads `process` (checked by `tooling/boundaries`). Package roles and their allowed dependencies live in `tooling/boundaries/roles.ts`, enforced by ESLint and dependency-cruiser.
- **Composition, not inheritance.** The pipeline is a composition of pure functions; collections and taxonomies are declared as data, never subclassed.
- **Validate what comes from outside.** The `define*` builders validate and freeze each part of the configuration where it is written; frontmatter is checked by the collection's schema (any Standard Schema: valibot, zod) before it is read; types are derived from what was validated.
- **Silent libraries.** Packages print nothing by themselves: diagnostics are returned values, and only the CLI writes them.
- **Injection seams for tests** (a content source, a URL adapter, the CLI's I/O) are explicit parameters, documented as such.
- **Decorative looks stay out of `@figatellultimate/ui`**, a minimal design system (parts with `data-slot`, styled by tokens): decorative components live in `@figatellultimate/effects` (their mechanics, every look a token), and a theme of `@figatellultimate/themes` (one stylesheet) or the app decides where they show and how they look.
- **React reaches elements through refs**, never `querySelector`, `querySelectorAll` or `closest` (lint rule `figatellultimate/react-no-dom-queries`, tests excepted).

## Errors

- **Expected failures are values.** They flow through the minimal railway-oriented `Result` of `@figatellultimate/core` (`shared/result.ts`): `andThen` chains dependent steps, `combine` accumulates every error so a user sees every problem at once. A function throws only for a programming error or an invalid configuration, and its JSDoc says so with `@throws`.
- **Typed diagnostics.** Each failure is a discriminated value with a `code`; a diagnostic says where, why and how to fix, in English.

## Typing and tooling

- TypeScript `strict`, with `noImplicitOverride`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules` and `isolatedDeclarations` (`tsconfig.base.json`); type-only imports are separate.
- **Types never promise more than the runtime guarantees.**
- **Airy functions**, tests included: a blank line before a `return`, after a group of declarations, and around control flow (`if`, loops, `switch`, `try`); consecutive declarations stay together. Enforced and fixed by the `@stylistic/padding-line-between-statements` rule (`tooling/boundaries/airy.ts`, also applied to the example): run `pnpm exec eslint . --fix`.
- **No unused variables** (`@typescript-eslint/no-unused-vars`), in the workspace and the example.
- **No type assertions** (`consistent-type-assertions: never`; `as const` aside): a guard, a schema or a better-typed API instead; a rare exception carries an `eslint-disable-next-line` with its reason. Prefer `x = … as const satisfies T` over an annotation, and `{ a: false } as const` over `{ a: false as const }`.
- **pnpm and Turborepo**: the packages' own tasks (`build`, `typecheck`, `test`, `test:cli`, `lint:package`) run through Turborepo (`turbo.json`, `turbo run --filter=…` in the example), cached and in dependency order; a `transit` task makes a change in a package invalidate the cached tests and type checks of the packages depending on it (they read its sources). pnpm is the package manager: Turborepo needs one declared (`packageManager`), and leaving the choice free would pin Turborepo to 2.10.0 (from 2.10.1, `turbo run` finds no package once the package manager check is disabled).
- Workspace packages resolve each other through their sources (the `@figatellultimate/source` export condition); a package's tests run through Turborepo (`pnpm test`, each package's `test` script runs its own vitest project from the root's configuration), or `pnpm vitest run --project <name>`.
- CI (`.github/workflows/ci.yml`): format check, lint, boundaries, knip, typecheck, build, no generated artifact committed, publint and attw, changeset status, commitlint; tests on Linux, macOS and Windows with Node 24 and 26. Every job of a matrix runs to its end whatever another one did (`fail-fast: false`), and a run of `main` is never cancelled by a newer commit; only a pull request replaces its older run.
- **GitHub Actions are pinned, against supply-chain attacks**: any action not from GitHub's `actions/` is pinned to the full commit SHA of its latest stable release at the time it is written, its version in a comment (`uses: pnpm/action-setup@<40-hex sha> # v6.1.1`), never to a tag or a branch, which can be moved; resolve the SHA of the release's commit (an annotated tag points to a tag object, not to the commit). A container image is pinned by its digest too (`image:tag@sha256:…`); Playwright's, which runs the browser jobs, is the release of the repository's `playwright`, so that its browsers match. Checked, with the matrix and cancellation rules, by `tooling/__tests__/github-actions.test.ts`.
- Conventional Commits (commitlint, husky `commit-msg`): lowercase subject, header and body lines at most 100 characters. Releases through changesets.
- No coverage ignore on a whole file or a range to inflate coverage (lint-checked); generated output (`.figatellultimate/`, `dist/`) is never committed.

## Tests

Test what matters, from the outside, the way a user meets it: the public contract, never private state, and no mock of figatellultimate's own code (only at the edges: a framework's router, a browser API).

- **Families**, each run by its own vitest configuration and labeled in Allure (`tooling/allure.ts`):
  - **scenarios** (`pnpm test`): every package, components in happy-dom, type tests (`*.test-d.ts`) and properties;
  - **cli** (`pnpm test:cli`, after `pnpm build`): the command line's surface against the built binary in real processes, with cli-testing-library: help, usage errors, exit codes, each command's output, `watch` stopped by a signal. The CLI is a user interface: its surface is checked there, not in process;
  - **browsers** and **lab**, weekly: the same component tests in Chromium, Firefox and WebKit; the watch under bursts of changes.
- **Properties** (fast-check) where an invariant holds for a whole space: a total URL reading, a round trip, a parser answering any input. Hand-picked cases become the property's `examples`; the seed is fixed (`tooling/fast-check.setup.ts`), `FC_SEED` explores another draw.
- **Lean**: one test per behavior; a table (`it.each`) or a property rather than near-identical tests; a test that another family covers better is removed.
- **Tests live in a sibling `__tests__` folder**, with their scenarios; disposable file trees are generated at test time (`@japa/file-system`), never committed fixtures (the boundaries lint fixtures excepted).
- **Scenarios are written once** and replayed on every implementation through a small adapter interface (e.g. the shared collections of `packages/core/src/__tests__/scenarios`).
- **Inputs differ from expected outputs**, so a no-op cannot pass; random data is seeded, and a test asserts its own precondition when a degenerate case is possible.
- **Generous timeouts**: five minutes for every test and hook, thirty seconds for every wait on the page (`waitFor`, `findBy…`), set once (`tooling/timeouts.ts`, in every vitest configuration, the waits through `tooling/async-timeout.setup.ts`). A timeout stops a hang, never judges speed (the load test has the budgets): a slow CI runner must not fail a right test. Never set on a single test, hook or wait, which would cut it short again; a fixed pause before reading a change is a `waitFor`. Checked by `tooling/__tests__/timeouts.test.ts`.
- **Coverage** (`pnpm test:coverage`): branches included, on the pure code only; adapters and components are covered by the other families. A report, never a threshold.
- **Reports**: Allure, one per family on GitHub Pages, each with its own history (`.github/actions/reports-publish`); `pnpm allure` locally.
- **No network in unit tests.** Slow or environment-heavy suites run weekly and on demand, never on each pull request: real browsers (`browsers.yml`), the watch lab (`watch-lab.yml`), the example's real `next build` and its navigation in Chromium (`example.yml`) and the load test with its budgets (`load.yml`).

## Language

- **Everything written in the repo is in English**: code, comments, JSDoc, tool output, commit messages, READMEs and this file.
- **The example's French text is spaced the French way**: a no-break space (U+00A0) before `:`, a narrow no-break space (U+202F) before `;`, `!` and `?` and inside « », never an ordinary space nor none; code, inline code and URLs keep their own syntax. Generated French text follows the same rule. Checked by `tooling/__tests__/french-typography.test.ts` on the content and the messages.

# figatellu

Typed, filesystem-driven MDX content management, with an i18n layer whose schema is derived from your content, and a headless faceted-collection engine whose state lives in the URL.

> **Status: pre-alpha.** Nothing is published yet.

## What it aims to give you

- **Write MDX in folders, get the rest at build time:** routes, i18n URLs, and generated getters (`getPage`, `getBlogPost`…) whose types make asking for a nonexistent document a compile error.
- **Content-derived i18n:** adding a category or a tag breaks the typing of every locale until it is translated.
- **Diagnostics instead of surprises:** every convention violation says where, why and how to fix it.
- **Headless faceted collections:** multi-facet filters, sorts and pagination with all state in a compact, shareable URL, RSC-friendly.
- **Local search:** the built site indexed with Pagefind, one bundle per locale with its stemming, and a headless client.

## Packages

| Package | Role | Status |
|---|---|---|
| [`@figatellu/core`](packages/core) | Pure core: content model, diagnostics, results, content source ports. No I/O. | in progress |
| [`@figatellu/fs-node`](packages/fs-node) | Node.js `PathLister` adapter (lists content paths). | in progress |
| [`@figatellu/content-collections`](packages/content-collections) | `ContentSource` adapter backed by Content Collections. | in progress |
| [`@figatellu/codegen`](packages/codegen) | Generates the typed modules of `.figatellu/` (ts-morph, in memory). | in progress |
| [`@figatellu/messages`](packages/messages) | Message analysis: required keys, ICU syntax, plurals and arguments, as diagnostics. | in progress |
| [`@figatellu/use-intl`](packages/use-intl) | use-intl adapter: a translator typed by the generated messages. | in progress |
| [`@figatellu/toc`](packages/toc) | Table of contents model: the tree of headings and the heading being read, pure. | in progress |
| [`@figatellu/site`](packages/site) | Metadata, sitemap and static params, pure and framework-free. | in progress |
| [`@figatellu/next16`](packages/next16) | Next.js 16 adapter: metadata, sitemap, the facets URL adapter. | in progress |
| [`@figatellu/facets`](packages/facets) | Faceted collections: a pure engine with its whole state in the URL. | in progress |
| [`@figatellu/facets-react`](packages/facets-react) | React binding of faceted collections. | in progress |
| [`@figatellu/pagefind`](packages/pagefind) | Indexes built pages with Pagefind, one bundle per locale. | in progress |
| [`@figatellu/search`](packages/search) | Headless local search client over the Pagefind bundles. | in progress |
| [`@figatellu/search-react`](packages/search-react) | React binding of the search client: a hook, a search box and a search dialog. | in progress |
| [`@figatellu/ui`](packages/ui) | A minimal design system: navbar from the content, locale switcher, theme toggle, entry card, one stylesheet of tokens. | in progress |
| [`@figatellu/effects`](packages/effects) | Decorative effects (cursor glow, sparkles, cards lit under the mouse), loaded on desktops only, every look a token. | in progress |
| [`@figatellu/themes`](packages/themes) | Themes: one stylesheet each over the design system and the effects. First theme: maquis. | in progress |
| [`@figatellu/cli`](packages/cli) | The `figatellu` command: build, check, watch, search. | in progress |

## Requirements

Node.js ≥ 24, ESM only.

## Contributing

```sh
pnpm install
pnpm check   # format, lint, boundaries, dead code, typecheck, tests, build, package checks
```

### Tests

Every pull request runs the scenarios (every package, happy-dom, type tests and properties) and the command line's surface against the built binary, on Linux, macOS and Windows; real browsers, the watch lab, the example's build and the load test run weekly. The reports of `main`:

- [CI report](https://mojo-molotov.github.io/figatellu/ci/): every test of the last build on main, with its trend.
- [Coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/): branches included, on the pure code (`pnpm test:coverage`).
- [Real browsers](https://mojo-molotov.github.io/figatellu/browsers/) and [watch lab](https://mojo-molotov.github.io/figatellu/watch-lab/): the weekly runs, each with its own history.
- [Every report](https://mojo-molotov.github.io/figatellu/).

Locally: `pnpm test`, `pnpm test:cli` (after `pnpm build`), `pnpm test:coverage`, then `pnpm allure` to open the report.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/); changes to a package need a changeset (`pnpm changeset`). The design lives in the code: each module opens with its architecture, its design decisions and its invariants, each export carries its JSDoc, and the tests check the rest. Package roles and boundaries: [`tooling/boundaries/roles.ts`](tooling/boundaries/roles.ts).

## License

[MIT](LICENSE)

---
name: use-figatellultimate
description: Build and maintain a site with figatellultimate, the typed, filesystem-driven MDX content library for Next.js (figatellultimate.config.ts, the `figatellultimate` CLI, the generated `#figatellultimate/*` modules, `@figatellultimate/*` packages). Use this skill whenever a project has a figatellultimate.config.ts or imports `#figatellultimate/*` or `@figatellultimate/*`, and whenever the user wants to add or move pages, posts, collections, languages, translations, tags or authors, fix a figatellultimate build or check diagnostic, wire the catch-all Next.js route, metadata, sitemap, feeds or llms.txt, or set up its local search, faceted listings or UI components, even if they do not name figatellultimate.
---

# Using figatellultimate

figatellultimate turns folders of MDX files into a typed site. A file's path is its structure: the configuration declares what each folder means (a category, a language, a slug), `figatellultimate build` checks every file and writes typed modules to `.figatellultimate/`, and the app imports them through `#figatellultimate/*`. A page that does not exist has no getter, so asking for it does not compile.

```text
content/**/*.mdx ──> figatellultimate.config.ts (grammar per collection) ──> figatellultimate build
    ──> .figatellultimate/ (typed modules) ──> the app: one catch-all route or one per base, metadata, sitemap, feeds, llms.txt
```

Generic content work is delegated: Content Collections reads the files, validates the frontmatter with its schema and compiles the MDX (`content-collections.ts`); figatellultimate adds the structure, the URLs, the translations and the checks.

## How to work in a figatellultimate project

1. **Read before you write.** Open `figatellultimate.config.ts` (the collections and their grammars), `content-collections.ts` (each collection's frontmatter schema) and the messages schema (`messages.schema` in the config). They decide where a file goes and what it must hold.
2. **Make the change in the content or the config**, never in `.figatellultimate/`: that folder is regenerated on every build and is not committed (it is in `.gitignore`).
3. **Run `figatellultimate build`** (or `figatellultimate check` to change nothing) at the project's root, and read every diagnostic: each names the file, the cause and the fix. They are all listed at once; fix them all, then build again.
4. **Then typecheck the app** (`tsc --noEmit`): the generated types are what tell you a page, a locale or a message key is missing.

`build` and `check` also warn the messages no code uses, by compiling the app, their longest step; `--no-unused` skips it. In continuous integration, run `figatellultimate check`: the same analysis, writing nothing, exiting non-zero on any error, so that a broken file never gets merged. A job that also typechecks or builds the app runs `figatellultimate build` instead (the app needs `.figatellultimate/`, which `check` does not write), then `tsc --noEmit`.

Exit codes: `0` no error; `1` content errors, each with its file; `2` an invalid config or a usage error; `3` an unexpected failure. An error keeps the last valid generated code in place; a warning (a reservation matching nothing, an unused message key) does not stop the build; an info only tells what the build chose on its own.

Requirements: Node 24 or later (the config is TypeScript, loaded through Node's type stripping) and an ES module project (`"type": "module"`).

## The packages

| Package                                                                         | Role                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@figatellultimate/core`                                                        | The pure core: configuration, path grammars, URLs, diagnostics.        |
| `@figatellultimate/cli`                                                         | The `figatellultimate` command: build, check, watch, search, migrate.  |
| `@figatellultimate/content-collections`                                         | The adapter of Content Collections.                                    |
| `@figatellultimate/use-intl`                                                    | Translators typed by the generated messages, and precompiled messages. |
| `@figatellultimate/site`                                                        | Metadata, sitemap, feeds, breadcrumbs, structured data, llms.txt.      |
| `@figatellultimate/next16`                                                      | The Next.js 16 adapter.                                                |
| `@figatellultimate/facets`, `@figatellultimate/facets-react`                    | Faceted collections, and their React components.                       |
| `@figatellultimate/search`, `@figatellultimate/search-react`                    | Local search over Pagefind, and its React components.                  |
| `@figatellultimate/ui`, `@figatellultimate/effects`, `@figatellultimate/themes` | A minimal design system, decorative effects, themes.                   |

The generated code is wired once in `package.json`: `"imports": { "#figatellultimate/*": "./.figatellultimate/*/index.js" }`.

## The configuration

Everything is declared once in `figatellultimate.config.ts`, as data: each `define…` validates its part where it is written and throws, saying what to fix, on an invalid declaration.

```ts
import { join } from 'node:path';

import { createContentCollectionsSource } from '@figatellultimate/content-collections';
import { defineCollection, defineConfig, defineLocales, defineTaxonomy, locale, rest, segment, slug } from '@figatellultimate/core';

export default defineConfig({
  locales: defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' }),
  collections: {
    pages: defineCollection({
      entry: 'page',
      base: '',
      grammar: [locale({ optional: true }), rest('path'), slug()],
      metadata: { title: 'title', description: 'description', order: 'order' },
    }),
    blog: defineCollection({
      entry: 'blogPost',
      base: 'blog',
      grammar: [segment('category'), locale({ optional: true }), slug()],
      references: { tags: 'tags' },
      draft: 'draft',
      metadata: { title: 'title', description: 'description', publishedTime: 'date', type: 'article' },
    }),
  },
  taxonomies: { tags: defineTaxonomy(['release', 'guide'], { messages: ['label'] }) },
  navigation: [{ collection: 'pages', depth: 1, menus: false }],
  // Required: one route serves every page (`false`), or a route per base (`true`).
  splitRoutes: false,
  messages: { directory: 'messages', schema: 'schema.ts', runtime: 'use-intl' },
  source: createContentCollectionsSource({
    configPath: join(import.meta.dirname, 'content-collections.ts'),
    projectRoot: import.meta.dirname,
  }),
});
```

### Collections and their grammar

A collection gathers documents sharing a path shape. `entry` names its generated API (`blogPost` gives `getBlogPost`), `base` prefixes its URLs, and `grammar` says what each folder means:

| Part                            | Meaning                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `segment('name')`               | One folder, its value named.                                     |
| `rest('name')`                  | Any depth of folders, for free-form trees such as documentation. |
| `locale({ optional: true })`    | The language folder; optional: the default language may omit it. |
| `slug()`                        | The file name, always last.                                      |
| `join('-', 'category', 'slug')` | In `route`: two parts joined into one URL segment.               |

| Option                                        | Effect                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `route`                                       | How the URL is composed from the grammar's parts.                                            |
| `reserved`                                    | Keys served by a dedicated route instead of the shared one (`'pricing'`, `'lp/*'`).          |
| `indexForbiddenUnder`, `indexForbiddenAtRoot` | Where an `index.mdx` is not allowed.                                                         |
| `draft`                                       | The boolean field marking drafts, left out of production builds.                             |
| `testOnly`                                    | Keys of test content, left out of production builds.                                         |
| `shared`                                      | Fields translations take from the default language when they leave them out.                 |
| `references`                                  | Frontmatter fields referencing a taxonomy.                                                   |
| `metadata`                                    | The fields holding title, description, image, dates, robots, canonical URL and `order`.      |
| `llms`                                        | What it exposes to LLMs: `{ include: ['docs', 'docs/*'], exclude: 'llmExclude' }`.           |
| `searchable`                                  | Whether the local search indexes it (default `true`).                                        |
| `folderPages`                                 | Folders with a page of their own (`root`, `levels`, `preview`, `perPage`, `index`, `images`). |
| `mounted`                                     | `false`: no page at all, read through its getters only (a taxonomy's content).               |
| `messages`                                    | Fields each folder must have in every language's messages (`$root` for the collection's own). |

Key patterns (`reserved`, `testOnly`, `llms.include`) are an exact key, or `prefix/*` for the prefix's descendants only. A folder page has no frontmatter: its meta description is a field of the folder's messages (`folderPages.metadata.description`), which each paginated level must then declare in `messages`.

### Locales, taxonomies, navigation, images

- `defineLocales({ list, default })`: adding a language is one line, then following the diagnostics, which report every missing translation. `urls: { defaultLocale: 'implicit' | 'explicit', trailingSlash, page }`, an option of `defineConfig` (not of `defineLocales`), sets the URL strategy used everywhere: `implicit` (the default) leaves the default language unprefixed; `page` names the segment of a paginated listing's pages (`page` by default). `extensions: ['.mdx', '.md']` also reads Markdown (`.mdx` only by default).
- `defineTaxonomy(terms, { messages, pages, content })`: tags and authors are closed lists; the frontmatter references terms by key and an unknown key is an error suggesting the closest one. A term may carry data (an avatar), message fields (a name), a page (`pages: { base: 'authors', perPage: 10 }`) and a long text (`content`, an unmounted collection keyed by term).
- `navigation`: the collections in the navbar, their order and depth. A new folder appears by itself, in every language.
- Images: every local image the content uses must exist in `publicDirectory` (`public`), or the build fails with `missing-image`, naming the file and suggesting the closest one.

## Writing content

The path of a file is its structure: no frontmatter field says which category or language it belongs to. With `[segment('category'), locale({ optional: true }), slug()]` under `blog`:

| File                              | Language | URL                    |
| --------------------------------- | -------- | ---------------------- |
| `content/blog/news/launch.mdx`    | default  | `/blog/news/launch`    |
| `content/blog/news/en/launch.mdx` | `en`     | `/en/blog/news/launch` |

- Names are lowercase letters, digits and dashes; two names differing only by case are an error.
- `index.mdx` is its folder's page (`content/pages/docs/index.mdx` is `/docs`).
- A missing translation is not an error: the page exists in the languages it was written in.
- A translation writes only what differs: fields listed in `shared` come from the default language's version, and `inherit: <locale>` takes every field it leaves out from another language.
- The frontmatter is checked by the collection's schema in `content-collections.ts` (valibot, zod, any Standard Schema); add a field there before using it.
- `draft: true` (with the collection's `draft` option) keeps a file out of production builds; `figatellultimate watch` runs in development mode and keeps drafts.
- A file leaves itself out of llms.txt with its collection's exclusion field (`llmExclude: true`); a passage with `<llm-exclude>`, blank lines around its content:

```mdx
<llm-exclude>

Shown on the page, left out of its Markdown for LLMs.

</llm-exclude>
```

To change the default language or the notation (implicit or explicit language folders), use `figatellultimate migrate default-locale <locale>` or `figatellultimate migrate notation explicit`: it prints its plan, and with `--write` moves every file, edits the config and writes `redirects.json`, all or nothing. Do not move many files by hand for that.

## The generated code

| Module                          | Gives                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `#figatellultimate/<collection>` | `getBlogPost(query)` (typed, known to exist), `findBlogPost(query)`, `findBlogPostByUrl(url)`, `blogIndex` (light items, data and body loaded on demand with `load()`), `listBlog(filter)`, `findBlogFolderByUrl(url)`. |
| `#figatellultimate/urls`        | `findByUrl(url)` (`kind`: `'entry'`, `'folder'` or `'term'`), `mountedUrls` (every page once, with `alternates`, `searchable`, `indexed`, `llms`, `routeBase`), `routeParamsOf(base)` (a split route's static params), `urlOf(locale, segments)`, `segmentsOf(url, locale)`, `metadataFields`. |
| `#figatellultimate/locales`     | `locales`, `defaultLocale`, `localeInfo`, the `Locale` type.                                             |
| `#figatellultimate/navigation`  | `navigationOf(locale)`: the navbar's tree.                                                               |
| `#figatellultimate/taxonomies`  | Each taxonomy's terms and data.                                                                          |
| `#figatellultimate/terms`       | Term pages (`findAuthorsTermByUrl`, `authorsTermUrl`).                                                   |
| `#figatellultimate/messages`    | The messages' skeleton, types and loader (`loadMessages`).                                               |

Build URLs with `urlOf` and read them with `segmentsOf`: never concatenate a locale prefix by hand, the project's strategy decides it.

## Messages

The interface's texts live in one file per language (`messages/fr.ts`, `messages/en.ts`). The content requires part of them: every folder's declared fields (`content.blog.news.$.title`) and every taxonomy term's (`taxonomies.tags.release.label`), gathered into the generated `skeleton`. The app's schema spreads it and adds its own keys:

```ts
import { skeleton, type MessageSchema } from '#figatellultimate/messages';

const _ = '';

export const schema = { ...skeleton, ui: { toc: { title: _ } } } as const satisfies MessageSchema;
```

Each language file must satisfy the schema exactly: a missing or extra key does not compile. Messages are ICU; the arguments are typed (`{count, plural, …}` takes a number) and each language must take the default one's. `build` and `check` warn about schema keys no code uses; keep one on purpose with a `// figatellultimate-keep: <reason>` comment above it. Translate with `createTranslator` of `@figatellultimate/use-intl`, or next-intl in Next.js; `precompiledLoader` and `withPrecompiledMessages` compile them at build time.

## Next.js

`splitRoutes`, required in the config, says how the app routes its pages. `false`: one optional catch-all per language serves every entry, folder page and term page, prerendered (below); simple, and any page may sit anywhere, but every page loads every page kind's client code. `true`: a route per base (`app/[locale]/blog/[[...url]]` with `generateStaticParams() { return routeParamsOf('blog'); }` and `findByUrl(urlOf(locale, ['blog', ...url]))`, the root route for base `''`), each page loading its own kind's code only; then a page under another route's prefix (a page at `/blog/about`) is a `route-shadowed` error: move it or change its collection's base.

```tsx
// app/[locale]/[[...url]]/page.tsx
import { notFound } from 'next/navigation';

import { findByUrl, mountedUrls, segmentsOf, urlOf } from '#figatellultimate/urls';

export const dynamicParams = false;

export function generateStaticParams() {
  return mountedUrls.map((item) => ({ locale: item.locale, url: segmentsOf(item.url, item.locale) }));
}

export default async function Page(props: PageProps<'/[locale]/[[...url]]'>) {
  const { locale, url } = await props.params;
  const found = await findByUrl(urlOf(locale, url));

  if (found === undefined) notFound();
  // found.kind: 'entry' (found.entry.data, found.entry.body), 'folder' or 'term'
}
```

`findByUrl` gives one of three kinds, each rendered by the app:

- **`'entry'`**: `found.collection` and `found.entry`: its `url`, `locale`, `alternates`, `data` (the frontmatter, `data.mdx` the compiled MDX) and `body` (the MDX source).
- **`'folder'`** (a collection's `folderPages`): `found.folder`: its `url`, `locale`, `segments`, `level` (`null` for the collection's own page), `messages` (the message keys of its title and description), `image`, `subfolders`, `entries` (light index items), and for a paginated listing `page`, `pages`, `first`, `index`.
- **`'term'`** (a taxonomy's `pages`): `found.term`: its `taxonomy`, `term`, `entries`, `page`, `pages`, `first`, `metadata.description` (a message key) and `content` (the term's long text, when written).

A folder or term page has no frontmatter: its title and description are messages, translated by the app, and its metadata comes from `pageMetadataOf`, not `metadataOf`:

```tsx
export async function generateMetadata(props: PageProps<'/[locale]/[[...url]]'>): Promise<Metadata> {
  const { locale, url } = await props.params;
  const found = await findByUrl(urlOf(locale, url));

  if (found === undefined) return {};

  if (found.kind === 'entry') return toNextMetadata(metadataOf(found.entry, metadataFields[found.collection], site));

  const t = await getTranslations({ locale });
  const page = found.kind === 'folder' ? found.folder : found.term;
  const described = page.metadata.description;
  const description = described === undefined ? undefined : t(described);

  // A folder's title is its `title` message; a term's, the message field its taxonomy declares (here `name`).
  const title =
    found.kind === 'folder'
      ? found.folder.messages.title === undefined
        ? undefined
        : t(found.folder.messages.title)
      : t(`taxonomies.${found.term.taxonomy}.${found.term.term}.name`);

  return toNextMetadata(pageMetadataOf({ ...page, title, description }, site));
}
```

`@figatellultimate/site` computes the rest, framework-free; `@figatellultimate/next16` maps it to Next:

- Metadata: `toNextMetadata(metadataOf(found.entry, metadataFields[found.collection], site))` for an entry, `pageMetadataOf` for a folder or term page (above), with `site = { origin, name, defaultLocale }`.
- Sitemap and robots: `toNextSitemap(sitemapOf(mountedUrls, site))`, `toNextRobots(site)`; `noindex` pages are left out.
- Structured data and feeds: `structuredDataOf`, `breadcrumbListOf`, `jsonLd`, `rssOf`.
- llms.txt: `llmsTxtOf`, `llmsFullOf`, `isLlmsExposed`, `exposedPagesOf` and `markdownUrlOf` (`@figatellultimate/site`) collect exposed pages and write the files, `llmsMarkdownOf(entry.body, { components })` (`@figatellultimate/content-collections/llms`) each page's Markdown, served at the page's URL plus `.md`.
- Redirects: `toNextRedirects` of the `redirects.json` that `migrate` writes.
- Links, images and themes: wrap the layout in `UiProvider` (`link={NextLink}`, `image={NextImage}`) of `@figatellultimate/ui`; `rehypeImageSizes` of `@figatellultimate/content-collections/images` measures content images at build time; `cardImagePriority` of `@figatellultimate/next16/images` preloads desktop above-the-fold cards without affecting mobile; `themeStylesheetRoute` of `@figatellultimate/next16/themes` serves lazy non-default theme stylesheets matched by `siteThemeScript` and `SiteThemePicker` (`stylesheetBase`).

## Search, faceted listings, interface

- **Search**: after the framework's build, `figatellultimate search --site .next/server/app --out public/pagefind --locale-folders` indexes the element marked `data-pagefind-body` (`--site` repeated for a route per base, each folder from `prerenderedPages`) of every searchable page, one Pagefind bundle per language. `formatTrail` and `parseTrail` of `@figatellultimate/site` format and split breadcrumb trails for search metadata. `createSearch({ locale, collections })` of `@figatellultimate/search` queries it; `SearchDialog` of `@figatellultimate/search-react` is the accessible box (⌘K / Ctrl+K). With a deployment adapter, `prerenderedPages` and `copyIntoOutput` of `@figatellultimate/next16/build` find the pages and copy the index.
- **Faceted listings**: `defineFacetedCollection({ items, key, facets, sorts, perPage })` of `@figatellultimate/facets` is a pure engine (`read`, `view`, `transition`, `write`) whose whole state is in the URL; `useFacetedCollection(engine, useNextUrl())` binds it, and `FacetOptions`, `SortSelect`, `Pagination`, `PageSelect`, `ListingOptions` of `@figatellultimate/facets-react` render it. Paginated listings (`folderPages.perPage` with `index`) use `usePagedCollection`, `createIndexLoader` and `listingIndexRoute` of `@figatellultimate/next16/listing-index`. Section lists splitting cards into static JSON batches use `splitSectionBatches` and `pagedSectionsOf` of `@figatellultimate/site` with `useResponsiveBatches` of `@figatellultimate/facets-react` (scroll loading on phones, pagination on desktops). The query's page and sort are `page` and `sort` unless `params: { page, sort }` names them; with another page segment (`urls.page`, generated as `pageSegment` of `#figatellultimate/urls`) or page parameter, pass `segment` and `param` to `useNextUrl`, `NextUrlBoundary` and `usePagedLocaleLinks`.
- **Interface**: `@figatellultimate/ui` (`Navbar`, `LocaleSwitcher`, `ThemeToggle`, `SiteThemePicker`, `Breadcrumb`, `TableOfContents`, `EntryCard`, `CodeBlock`, `CodeTabs`, `ImageZoom`, `ScrollRegion`, `PrintMargins`, `UiProvider`; `CodeTabs` remembers the reader's tab under `storageKey`, `ImageZoom` zooms from `media`, the table of contents docks from `TOC_WIDE_MEDIA`), styled by one stylesheet through `data-slot` and `--fig-*` tokens; `@figatellultimate/effects` and `@figatellultimate/themes` (`base.css`, `maquis.css`, `calanque.css`) on top. Components have no text of their own: every label comes from the messages.

## Recipes

- **Add a page**: create the MDX file where the grammar puts it (its path is its URL), with the frontmatter the collection's schema requires; build.
- **Translate a page**: add the same file under the language's folder (`en/`), writing only the fields that differ when the collection shares the others; build.
- **Add a language**: add it to `defineLocales`, build, then add every message and folder field the diagnostics and the types ask for.
- **Add a tag or an author**: add the term to its `defineTaxonomy`, then its message fields in every language; reference it by key in the frontmatter.
- **Add a collection**: declare it in `content-collections.ts` (schema, `withFigatellultimate`) and in `figatellultimate.config.ts` (`entry`, `base`, `grammar`, `metadata`); build, then import `#figatellultimate/<collection>`.
- **Fix a diagnostic**: read its file, cause and fix line; it often suggests the closest valid name. Rebuild until none is left.

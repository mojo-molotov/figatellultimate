# figatellultimate example: Next.js 16

Pages, a blog and landing pages (`/…`, `/blog/<category>/<subcategory>/<slug>`, `/lp/<category>-<slug>`, French unprefixed, English under `/en`), rebuilt with figatellultimate and Next.js 16.4 (App Router, classic static generation) **by configuration only**: one optional catch-all route per locale, locale routing and every label by next-intl over figatellultimate's typed messages, a navbar generated from the content, no collection-specific code in the library. Not published.

```sh
pnpm --filter figatellultimate-example-next example:build      # the packages it uses (as a user installs them), then figatellultimate build && next build && figatellultimate search --locale-folders
pnpm --filter figatellultimate-example-next example:verify     # acceptance on the built HTML and bundles
pnpm --filter figatellultimate-example-next exec next start    # try it: ⌘K or Ctrl+K for the search, /en for English
pnpm --filter figatellultimate-example-next dev                # the packages it uses, then figatellultimate build && next dev
```

| File                                                             | Role                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `figatellultimate.config.ts`                                            | the three collections, their metadata fields and folder titles, the taxonomies (tags, authors with their avatars), the navigation                                                              |
| `content-collections.ts`                                         | frontmatter schemas (valibot) and MDX compilation, delegated                                                                                                                                                        |
| `messages/schema.ts`                                             | the shape of every locale, written once: figatellultimate's `skeleton` spread (the content's folders and terms), then the app's own keys as holes                                                                               |
| `messages/fr.ts`, `messages/en.ts`                               | every text, in locked sections composed into the locale, each `satisfies` the schema: the content's folder titles, the taxonomies' names, the components' labels (`ui.*`), also checked by figatellultimate at build time |
| `i18n/`, `proxy.ts`, `global.d.ts`                               | next-intl: routing (`as-needed`, as figatellultimate's URLs), the locale from `next/root-params`, the request's messages from `#figatellultimate/messages`, its types from figatellultimate's                                                 |
| `app/[locale]/layout.tsx`                                        | `<html lang dir>`, the theme script, the styles                                                                                                                                                                    |
| `app/[locale]/[[...url]]/page.tsx`                               | every mounted URL in its locale, entries and the blog's folder pages: `findByUrl`, `generateStaticParams`, `generateMetadata`                                                                                            |
| `app/sitemap.ts`                                                 | the sitemap with translations and `x-default`                                                                                                                                                                                    |
| `app/robots.ts`, `app/[locale]/feed.xml/route.ts`, `components/structured-data.tsx` | SEO: `robots.txt`, the blog's RSS feed per locale (`/feed.xml`, `/en/feed.xml`), and schema.org data on every page (`BlogPosting` or `WebPage`, `BreadcrumbList`, `Person`); the launch landing page is `noindex` |
| `components/site-header.tsx`, `header-bar.tsx`                   | the navbar from the content, the search dialog, the locale switcher, the theme toggle                                                                                                                            |
| `components/links.tsx` | every internal link through `next/link`, so the layout and its effects stay mounted from page to page |
| `components/mdx.tsx`                                             | one MDX component registry for every collection: every primitive overridden as shadcn's, a `data-slot` each, styled by the maquis theme; `CodeBlock` as `pre`, `ImageZoom` as `img`                                                                                                                                                                            |
| `content-collections.ts`                                         | MDX compiled with its headings in one pass (`rehypeHeadings`), cached together                                                                                                                                  |
| `components/crumbs.tsx` (`[data-layout='post']`) | a post: the navbar, then the table of contents in the margin, sticky right under it, and the breadcrumb at the top of the text                                                                                           |
| `components/section-pages.tsx`                                   | a section's page lists its pages from the navigation (`/docs`); Documentation is a link, not a menu                                                                                                               |
| `blog/`                                                          | the authors' pages (`author-page.tsx`: avatar, name, bio, their posts with the tags facet, sorts and pagination), the folder pages from figatellultimate's data (`folder-page.tsx`: the blog and a category with their latest posts, a subcategory with facets), the shared engine (`facets.ts`), the interactive list (`posts.tsx`)  |
| `@figatellultimate/effects`, `@figatellultimate/themes/maquis.css` | the effects (`Effects` in the layout, `Collector` around previews) and the maquis theme (page, glass, MDX typography, where the effects show) |
| `public/covers/`, `public/authors/`                              | post covers (pixel-art placeholders) and author avatars                                                                                                                                                             |
| `scripts/verify.ts`                                              | checks the prerendered HTML, the sitemap, the search bundles and the navbar (plain Node)                                                                                                                                   |
| `scripts/load-test.ts`                                           | `pnpm example:load --posts N`: the example copied to `.tmp/`, N generated posts per locale, build and typecheck times, page weights and a navigation's bytes in Chromium, against budgets; weekly in the `Load test` workflow |

Checked weekly on Linux, macOS and Windows by the `Example app` workflow.

## Static generation, or Cache Components

Every route is prerendered (`●` in `next build`), and an unknown URL is a real 404 (`dynamicParams = false`); `example:verify` checks that every route is static. To try Cache Components instead (the default in Next 17), set `cacheComponents: true` in `next.config.ts` and remove the `dynamicParams` exports, which Cache Components forbid: pages stay complete at build time, but Next then reports them as partial prerendering and serves unknown URLs with status 200 and `noindex`.

## Accepted limitations

- Landing pages are not searchable (`searchable: false`). Under `next dev` without a full build, the search box says the search is unavailable.
- The components are checked by their packages' tests (happy-dom, axe-core, keyboard, and real browsers with `pnpm test:browser`) and a Node search of the real bundles; not yet with a screen reader.
- The subcategory page prerenders its default view (cards and pagination links); a filtered URL renders on the client. The interaction itself is tested by the hook's and components' tests.

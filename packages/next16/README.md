# @figatellultimate/next16

The Next.js 16 adapter of figatellultimate: metadata, sitemap, robots and redirects mapped onto the App Router, faceted-collection URL adapter, static listing indexes, desktop-only LCP image preloading (`@figatellultimate/next16/images`) and lazy theme stylesheet routes (`@figatellultimate/next16/themes`).

```sh
pnpm add @figatellultimate/next16
```

```ts
import { toNextMetadata, toNextSitemap } from '@figatellultimate/next16';
import { useNextUrl } from '@figatellultimate/next16/facets'; // client

export const generateMetadata = async () => toNextMetadata(metadataOf(entry, metadataFields.blog, site));
export default function sitemap() { return toNextSitemap(sitemapOf(mountedUrls, site)); }
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

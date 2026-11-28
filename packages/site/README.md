# @figatellultimate/site

Pure, framework-free site helpers: metadata, sitemap, static params, locale links, section batching, breadcrumbs, search trails, structured data, RSS feeds, llms.txt and ARD agent catalogs.

```sh
pnpm add @figatellultimate/site
```

```ts
import { metadataOf, sitemapOf } from '@figatellultimate/site';
import { findByUrl, metadataFields, mountedUrls } from '#figatellultimate/urls';

const found = await findByUrl('/en/docs');
const metadata = metadataOf(found.entry, metadataFields[found.collection], site);
const sitemap = sitemapOf(mountedUrls, site);
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

# @figatellu/site

Pure, framework-free site helpers: metadata, sitemap, static params, locale links, breadcrumbs, structured data and RSS feeds.

```sh
pnpm add @figatellu/site
```

```ts
import { metadataOf, sitemapOf } from '@figatellu/site';
import { findByUrl, metadataFields, mountedUrls } from '#figatellu/urls';

const found = await findByUrl('/en/docs');
const metadata = metadataOf(found.entry, metadataFields[found.collection], site);
const sitemap = sitemapOf(mountedUrls, site);
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

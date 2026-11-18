# @figatellu/pagefind

The Pagefind adapter of figatellu: indexes the built HTML of the mounted entries, one bundle per locale. `figatellu search` uses it.

```sh
pnpm add -D @figatellu/pagefind
```

```ts
import { indexSite } from '@figatellu/pagefind';

const { locales, problems } = await indexSite({ pages, outputDirectory: 'public/pagefind' });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

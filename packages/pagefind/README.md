# @figatellultimate/pagefind

The Pagefind adapter of figatellultimate: indexes the built HTML of the mounted entries, one bundle per locale. `figatellultimate search` uses it.

```sh
pnpm add -D @figatellultimate/pagefind
```

```ts
import { indexSite } from '@figatellultimate/pagefind';

const { locales, problems } = await indexSite({ pages, outputDirectory: 'public/pagefind' });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

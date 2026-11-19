# @figatellultimate/search

A headless local search client over the Pagefind bundles that `figatellultimate search` writes, one per locale.

```sh
pnpm add @figatellultimate/search
```

```ts
import { createSearch } from '@figatellultimate/search';

const search = createSearch({ locale: 'fr', collections: ['pages', 'blog'] });
const page = await search.query('chevaux', { sort: 'date-desc' });
if (page?.status === 'done') console.log(page.results, await page.more?.());
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

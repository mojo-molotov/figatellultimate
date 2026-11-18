# @figatellu/search

A headless local search client over the Pagefind bundles that `figatellu search` writes, one per locale.

```sh
pnpm add @figatellu/search
```

```ts
import { createSearch } from '@figatellu/search';

const search = createSearch({ locale: 'fr', collections: ['pages', 'blog'] });
const page = await search.query('chevaux', { sort: 'date-desc' });
if (page?.status === 'done') console.log(page.results, await page.more?.());
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

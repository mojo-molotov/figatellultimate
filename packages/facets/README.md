# @figatellu/facets

A pure engine for faceted collections: filter by N facets, sort, paginate, and keep the whole state in the URL.

```sh
pnpm add @figatellu/facets
```

```ts
import { defineFacetedCollection } from '@figatellu/facets';

const engine = defineFacetedCollection({
  items: posts,
  key: (post) => post.url,
  facets: { tags: { values: (post) => post.tags } },
  sorts: { 'date-desc': (a, b) => b.date.localeCompare(a.date) },
  perPage: 5,
});
const { keys, pages } = engine.view(engine.read('?tags=bot&page=2'));
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

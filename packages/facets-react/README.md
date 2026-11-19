# @figatellultimate/facets-react

The React layer of faceted collections: a binding, a History API URL adapter, and unstyled, accessible components (facet options, sort select, pagination, reset).

```sh
pnpm add @figatellultimate/facets-react @figatellultimate/facets react radix-ui cmdk
```

```tsx
import { FacetOptions, Pagination, useFacetedCollection, useHistoryUrl } from '@figatellultimate/facets-react';

const binding = useFacetedCollection(engine, useHistoryUrl());
<FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr" />
<Pagination binding={binding} labels={labels.pagination} locale="fr" />
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

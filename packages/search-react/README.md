# @figatellultimate/search-react

The React layer of figatellultimate's local search: a binding, and an unstyled, accessible search box and search dialog.

```sh
pnpm add @figatellultimate/search-react @figatellultimate/search react radix-ui cmdk
```

```tsx
import { SearchDialog } from '@figatellultimate/search-react';

<SearchDialog search={createSearch({ locale, collections })} labels={labels} boxLabels={boxLabels} locale={locale} />
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

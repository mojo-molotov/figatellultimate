# @figatellu/search-react

The React layer of figatellu's local search: a binding, and an unstyled, accessible search box and search dialog.

```sh
pnpm add @figatellu/search-react @figatellu/search react radix-ui cmdk
```

```tsx
import { SearchDialog } from '@figatellu/search-react';

<SearchDialog search={createSearch({ locale, collections })} labels={labels} boxLabels={boxLabels} locale={locale} />
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

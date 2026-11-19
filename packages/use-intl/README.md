# @figatellultimate/use-intl

The use-intl adapter of figatellultimate: translators typed by the generated messages, formatting by use-intl.

```sh
pnpm add @figatellultimate/use-intl use-intl
```

```ts
import { createTranslator } from '@figatellultimate/use-intl';

const t = createTranslator({ locale: 'fr', messages: await loadMessages('fr') });
t('home.posts', { count: 3 });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

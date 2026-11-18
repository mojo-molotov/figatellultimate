# @figatellu/use-intl

The use-intl adapter of figatellu: translators typed by the generated messages, formatting by use-intl.

```sh
pnpm add @figatellu/use-intl use-intl
```

```ts
import { createTranslator } from '@figatellu/use-intl';

const t = createTranslator({ locale: 'fr', messages: await loadMessages('fr') });
t('home.posts', { count: 3 });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

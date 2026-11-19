# @figatellultimate/core

The pure core of figatellultimate: locales, collection grammars, path parsing, URLs, diagnostics and the content's required message keys, without any I/O.

```sh
pnpm add @figatellultimate/core
```

```ts
import { analyze, defineCollection, defineLocales, locale, segment, slug } from '@figatellultimate/core';

const locales = defineLocales({ list: ['fr', 'en'], default: 'fr' });
const blog = defineCollection({ entry: 'blogPost', base: 'blog', grammar: [segment('category'), locale({ optional: true }), slug()] });
const { entries, diagnostics } = analyze({ locales, collections: { blog }, sources });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

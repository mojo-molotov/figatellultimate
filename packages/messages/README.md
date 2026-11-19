# @figatellultimate/messages

The message analysis of figatellultimate: checks every locale's messages against the keys the content requires, and models them for the code generator.

```sh
pnpm add -D @figatellultimate/messages
```

```ts
import { analyzeMessages } from '@figatellultimate/messages';

const { model, diagnostics } = analyzeMessages({ locales, tree: contentMessageTree(input), modules });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

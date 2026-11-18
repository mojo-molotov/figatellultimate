# @figatellu/messages

The message analysis of figatellu: checks every locale's messages against the keys the content requires, and models them for the code generator.

```sh
pnpm add -D @figatellu/messages
```

```ts
import { analyzeMessages } from '@figatellu/messages';

const { model, diagnostics } = analyzeMessages({ locales, tree: contentMessageTree(input), modules });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

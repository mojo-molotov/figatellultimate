# @figatellu/codegen

The code generator of figatellu: turns validated content into the typed modules of `.figatellu/`. The CLI uses it.

```sh
pnpm add -D @figatellu/codegen
```

```ts
import { emit } from '@figatellu/codegen';

for (const file of emit({ config, assembly, outputDirectory })) console.log(file.path);
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

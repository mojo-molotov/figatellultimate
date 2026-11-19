# @figatellultimate/codegen

The code generator of figatellultimate: turns validated content into the typed modules of `.figatellultimate/`. The CLI uses it.

```sh
pnpm add -D @figatellultimate/codegen
```

```ts
import { emit } from '@figatellultimate/codegen';

for (const file of emit({ config, assembly, outputDirectory })) console.log(file.path);
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

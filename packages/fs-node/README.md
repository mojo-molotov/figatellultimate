# @figatellultimate/fs-node

The Node.js file system adapter of figatellultimate: lists content files and writes generated ones.

```sh
pnpm add @figatellultimate/fs-node
```

```ts
import { createNodePathLister } from '@figatellultimate/fs-node';

const result = await createNodePathLister(projectRoot).list('content/blog');
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

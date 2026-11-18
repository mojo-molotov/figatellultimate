# @figatellu/fs-node

The Node.js file system adapter of figatellu: lists content files and writes generated ones.

```sh
pnpm add @figatellu/fs-node
```

```ts
import { createNodePathLister } from '@figatellu/fs-node';

const result = await createNodePathLister(projectRoot).list('content/blog');
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

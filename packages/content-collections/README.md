# @figatellu/content-collections

The Content Collections adapter of figatellu: frontmatter, schemas and MDX by Content Collections, structure and diagnostics by figatellu.

```sh
pnpm add -D @figatellu/content-collections @content-collections/core
```

```ts
// content-collections.ts
import { withFigatellu } from '@figatellu/content-collections/config';

const blog = withFigatellu(defineCollection({ name: 'blog', directory: 'content/blog', include: '**/*.mdx', schema }));
export default defineConfig({ content: [blog] });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

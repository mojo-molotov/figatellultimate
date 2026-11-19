# @figatellultimate/content-collections

The Content Collections adapter of figatellultimate: frontmatter, schemas and MDX by Content Collections, structure and diagnostics by figatellultimate.

```sh
pnpm add -D @figatellultimate/content-collections @content-collections/core
```

```ts
// content-collections.ts
import { withFigatellultimate } from '@figatellultimate/content-collections/config';

const blog = withFigatellultimate(defineCollection({ name: 'blog', directory: 'content/blog', include: '**/*.mdx', schema }));
export default defineConfig({ content: [blog] });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

# @figatellultimate/toc

The table of contents model: the tree of an entry's headings and the heading being read, pure and DOM-free.

```sh
pnpm add @figatellultimate/toc
```

```ts
import { activeHeading, tocTree } from '@figatellultimate/toc';

const tree = tocTree(entry.data.headings); // <h2> and <h3>, nested
const { active } = activeHeading({ tops, zone, viewport, scroll, maxScroll, phase: 'scroll' });
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

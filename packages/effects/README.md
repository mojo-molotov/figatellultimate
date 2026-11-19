# @figatellultimate/effects

Decorative effects for figatellultimate apps: a glow under the cursor, sparkles in the margins, preview cards lighting up under the mouse. `Effects` loads them on desktops only; every look is a token, so a theme (such as `@figatellultimate/themes/maquis.css`) decides where they show and their colors.

```sh
pnpm add @figatellultimate/effects react
```

```tsx
import '@figatellultimate/ui/styles.css';
import '@figatellultimate/effects/styles.css';
import { Collector, Effects } from '@figatellultimate/effects';

<body>
  {children}
  <Effects />
</body>;
<Collector><EntryCard … /></Collector>;
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

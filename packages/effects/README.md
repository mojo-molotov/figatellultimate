# @figatellu/effects

Decorative effects for figatellu apps: a glow under the cursor, sparkles in the margins, preview cards lighting up under the mouse. `Effects` loads them on desktops only; every look is a token, so a theme (such as `@figatellu/themes/maquis.css`) decides where they show and their colors.

```sh
pnpm add @figatellu/effects react
```

```tsx
import '@figatellu/ui/styles.css';
import '@figatellu/effects/styles.css';
import { Collector, Effects } from '@figatellu/effects';

<body>
  {children}
  <Effects />
</body>;
<Collector><EntryCard … /></Collector>;
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

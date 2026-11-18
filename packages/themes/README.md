# @figatellu/themes

Themes for figatellu apps, over `@figatellu/ui` and `@figatellu/effects`, on their tokens and slots: `base.css` lays out the page, the listings and the MDX typography; each theme sets its looks. **maquis**: dark glass over the previews and the code, the effects in the dark theme only. **paper**: soft ink on a grey paper, serif headings, an ink-blue accent, no effect.

```sh
pnpm add @figatellu/themes @figatellu/ui @figatellu/effects
```

```tsx
import '@figatellu/ui/styles.css';
import '@figatellu/effects/styles.css';
import '@figatellu/themes/base.css';
import '@figatellu/themes/paper.css';
```

Several themes can be loaded at once: `<html data-site-theme="paper">` picks one.

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

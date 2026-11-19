# @figatellultimate/themes

Themes for figatellultimate apps, over `@figatellultimate/ui` and `@figatellultimate/effects`, on their tokens and slots: `base.css` lays out the page, the listings and the MDX typography; each theme sets its looks. **maquis**: dark glass over the previews and the code, the effects in the dark theme only. **paper**: soft ink on a grey paper, serif headings, an ink-blue accent, no effect.

```sh
pnpm add @figatellultimate/themes @figatellultimate/ui @figatellultimate/effects
```

```tsx
import '@figatellultimate/ui/styles.css';
import '@figatellultimate/effects/styles.css';
import '@figatellultimate/themes/base.css';
import '@figatellultimate/themes/paper.css';
```

Several themes can be loaded at once: `<html data-site-theme="paper">` picks one.

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

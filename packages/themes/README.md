# @figatellultimate/themes

Themes for figatellultimate apps, over `@figatellultimate/ui` and `@figatellultimate/effects`, on their tokens and slots: `base.css` lays out the page, the listings and the MDX typography; each theme sets its looks and layout. **maquis**: dark glass over the previews and the code, the effects in the dark theme only. **calanque**: deep ocean-navy navbar, elevated white cards with vignetted paper grain on light mode, navy night in dark mode, no effect. **scandola**: mobile-first panoramic editorial layout — full-width adaptive multi-column grids, uniform vertical full-bleed cards, crisp mineral alabaster and terracotta by day, volcanic obsidian and ember by night, no effect.

```sh
pnpm add @figatellultimate/themes @figatellultimate/ui @figatellultimate/effects
```

```tsx
import '@figatellultimate/ui/styles.css';
import '@figatellultimate/effects/styles.css';
import '@figatellultimate/themes/base.css';
import '@figatellultimate/themes/calanque.css';
```

Several themes can be loaded at once: `<html data-site-theme="calanque">` picks one.

Tests: [Allure report](https://mojo-molotov.github.io/figatellultimate/ci/) · [coverage](https://mojo-molotov.github.io/figatellultimate/ci/coverage/)

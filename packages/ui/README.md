# @figatellu/ui

A minimal design system on top of figatellu: navbar, locale switcher, theme toggle, entry cards, breadcrumb, table of contents, code blocks, image zoom, and one stylesheet of tokens.

```sh
pnpm add @figatellu/ui react radix-ui
```

```tsx
import { Navbar, ThemeToggle } from '@figatellu/ui';
import '@figatellu/ui/styles.css';

<Navbar items={navigationOf(locale)} current={url} t={t} labels={{ nav: 'Navigation', menu: 'Menu' }}>
  <ThemeToggle labels={{ dark: 'Dark theme' }} />
</Navbar>
```

Tests: [Allure report](https://mojo-molotov.github.io/figatellu/ci/) · [coverage](https://mojo-molotov.github.io/figatellu/ci/coverage/)

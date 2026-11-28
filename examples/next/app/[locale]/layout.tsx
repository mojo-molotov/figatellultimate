/** The root layout of each locale: the design system's styles, the theme, the effects, and Vercel's Speed Insights and Web Analytics. */
import { Effects } from '@figatellultimate/effects';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { hasLocale } from 'next-intl';
import { siteThemeScript, tocScript } from '@figatellultimate/ui/scripts';
import { ThemeProvider } from 'next-themes';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { localeInfo, locales } from '#figatellultimate/locales';
import { urlOf } from '#figatellultimate/urls';

import { AppProviders } from '../../components/providers';
import { SectionPaginationPreload } from '../../components/section-pagination-preload';
import { SITE_THEMES } from '../../lib/site-themes';
import { routing } from '../../i18n/routing';
import { SiteFooter } from '../../components/site-footer';

// The minimal design system, the effects' mechanics, the themes' shared layout, then the default theme only; non-default
// themes (`/themes/<name>.css`) load lazily on hover/click or before first paint when remembered (`lib/site-themes.ts`).
import '@figatellultimate/ui/styles.css';
import '@figatellultimate/effects/styles.css';
import '@figatellultimate/themes/base.css';
import '@figatellultimate/themes/maquis.css';

// One root layout per declared locale, prerendered. Unknown params are let through, as Next applies a layout's
// `dynamicParams` to its children too: the catch-all route's unknown URLs reach their locale's 404
// (`not-found.tsx`); an undeclared locale is still a 404, below.
export const dynamicParams = true;

export function generateStaticParams(): { locale: string }[] {
  return locales.map((locale) => ({ locale }));
}

/**
 * The root layout knows the locale at last: `<html lang dir>`. No messages for client components: they receive their
 * texts from the server (`i18n/labels.ts`).
 */
export default async function LocaleLayout(props: LayoutProps<'/[locale]'>): Promise<ReactNode> {
  const { locale } = await props.params;

  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // next-themes sets <html data-theme>, `tocScript` <html data-toc>, `siteThemeScript` <html data-site-theme>,
    // before the first paint, hence the warning suppressed. `data-site-theme` is omitted here so switching locales
    // (re-rendering this `[locale]` layout) never overwrites the visitor's chosen theme with the default; `maquis.css`
    // already matches `:not([data-site-theme])` when no choice is stored or JavaScript is off.
    <html lang={locale} dir={localeInfo[locale].dir} suppressHydrationWarning>
      <head>
        {/* A table of contents the visitor closed is closed from the first paint: it never slides shut on load. */}
        <script dangerouslySetInnerHTML={{ __html: tocScript() }} />
        {/* The visitor's theme from the first paint: injects its lazy stylesheet when non-default. */}
        <script dangerouslySetInnerHTML={{ __html: siteThemeScript(SITE_THEMES, undefined, '/themes/') }} />
        {/* The blog's feed in this locale, for feed readers to find from any page. */}
        <link rel="alternate" type="application/rss+xml" href={urlOf(locale, ['feed.xml'])} />
        {/* The agentic resources the site offers (its agent skill), as ARD has agents look for them. */}
        <link rel="ard" href="/.well-known/ard.json" />
      </head>
      <body>
        {/* The stylesheet's dark tokens follow `data-theme`; without a choice, the system's preference. */}
        <ThemeProvider
          attribute="data-theme"
          storageKey="figatellultimate-theme"
          enableSystem
          disableTransitionOnChange
        >
          {/* Client-side navigations and next/image through a single UiProvider: the layout stays mounted. */}
          <AppProviders>{props.children}</AppProviders>
          <SiteFooter locale={locale} />
          {/* The cursor glow and the margins' sparkles, loaded on desktops only. */}
          <Effects />
          {/* Section pagination preloaded on desktop idle so client navigations to `/docs` paint controls on frame 1. */}
          <SectionPaginationPreload />
        </ThemeProvider>
        {/* The real visitors' Core Web Vitals, sent to Vercel's Speed Insights; their visits, to Vercel's Web
            Analytics: both scripts exist on Vercel only. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

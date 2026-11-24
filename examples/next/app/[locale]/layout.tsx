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

import { AppImages } from '../../components/images';
import { AppLinks } from '../../components/links';
import { SITE_THEMES } from '../../components/site-themes';
import { routing } from '../../i18n/routing';
import { SiteFooter } from '../../components/site-footer';
import { ListingPreload } from '../../blog/listing';

// The minimal design system, the effects' mechanics, the themes' shared layout, then both themes, one picked by
// `<html data-site-theme>` (`components/site-themes.ts`).
import '@figatellultimate/ui/styles.css';
import '@figatellultimate/effects/styles.css';
import '@figatellultimate/themes/base.css';
import '@figatellultimate/themes/maquis.css';
import '@figatellultimate/themes/paper.css';

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
    // before the first paint, hence the warning suppressed.
    <html lang={locale} dir={localeInfo[locale].dir} data-site-theme={SITE_THEMES[0]} suppressHydrationWarning>
      <head>
        {/* A table of contents the visitor closed is closed from the first paint: it never slides shut on load. */}
        <script dangerouslySetInnerHTML={{ __html: tocScript() }} />
        {/* The visitor's theme from the first paint: the page never flashes the default one. */}
        <script dangerouslySetInnerHTML={{ __html: siteThemeScript(SITE_THEMES) }} />
        {/* The blog's feed in this locale, for feed readers to find from any page. */}
        <link rel="alternate" type="application/rss+xml" href={urlOf(locale, ['feed.xml'])} />
      </head>
      <body>
        {/* The stylesheet's dark tokens follow `data-theme`; without a choice, the system's preference. */}
        <ThemeProvider
          attribute="data-theme"
          storageKey="figatellultimate-theme"
          enableSystem
          disableTransitionOnChange
        >
          {/* Client-side navigations: this layout, and what it holds, stays mounted from page to page. */}
          <AppLinks>
            <AppImages>{props.children}</AppImages>
          </AppLinks>
          <SiteFooter locale={locale} />
          {/* The cursor glow and the margins' sparkles, loaded on desktops only. */}
          <Effects />
          {/* The listing's code, loaded once the page is idle: a listing reached later shows at once. */}
          <ListingPreload />
        </ThemeProvider>
        {/* The real visitors' Core Web Vitals, sent to Vercel's Speed Insights; their visits, to Vercel's Web
            Analytics: both scripts exist on Vercel only. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

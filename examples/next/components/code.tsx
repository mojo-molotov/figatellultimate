/**
 * The MDX `pre`, and groups of code blocks as tabs: the design system's components (client), their labels
 * translated here, on the server.
 */
import { CodeBlock, CodeTabs } from '@figatellultimate/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';

import { localeInfo } from '#figatellultimate/locales';

import { routing } from '../i18n/routing';

/** MDX's `pre`: Shiki's block with a copy button, its labels from the messages. */
export async function Code(props: ComponentProps<'pre'>): Promise<ReactNode> {
  const t = await getTranslations('ui.code');

  return <CodeBlock {...props} labels={{ copy: t('copy'), copied: t('copied') }} />;
}

/**
 * A group of code blocks (`rehypeCodeGroups` of `@figatellultimate/content-collections/config`: npm, pnpm, yarn, bun) as tabs, its list named from the messages,
 * its arrows moving the page's reading way.
 */
export async function CodeGroup({ children }: { readonly children: ReactNode }): Promise<ReactNode> {
  const t = await getTranslations('ui.code');
  const locale = await getLocale();
  const dir = hasLocale(routing.locales, locale) ? localeInfo[locale].dir : undefined;

  return (
    <CodeTabs labels={{ list: t('tabs') }} {...(dir === undefined ? {} : { dir })}>
      {children}
    </CodeTabs>
  );
}

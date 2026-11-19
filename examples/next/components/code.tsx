/**
 * The MDX `pre`, and groups of code blocks as tabs: the design system's components (client), their labels
 * translated here, on the server.
 */
import { CodeBlock, CodeTabs } from '@figatellultimate/ui';
import { getTranslations } from 'next-intl/server';
import type { ComponentProps, ReactNode } from 'react';

/** MDX's `pre`: Shiki's block with a copy button, its labels from the messages. */
export async function Code(props: ComponentProps<'pre'>): Promise<ReactNode> {
  const t = await getTranslations('ui.code');

  return <CodeBlock {...props} labels={{ copy: t('copy'), copied: t('copied') }} />;
}

/** A group of code blocks (`rehype-code-groups.ts`: npm, pnpm, yarn, bun) as tabs, its list named from the messages. */
export async function CodeGroup({ children }: { readonly children: ReactNode }): Promise<ReactNode> {
  const t = await getTranslations('ui.code');

  return <CodeTabs labels={{ list: t('tabs') }}>{children}</CodeTabs>;
}

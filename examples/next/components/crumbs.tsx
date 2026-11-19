/** The breadcrumb, its labels translated (server: no JavaScript of its own, its links the app's). */
import type { Crumb } from '@figatellultimate/site';
import { Breadcrumb } from '@figatellultimate/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import type { Locale } from '#figatellultimate/locales';
import type { MessageKey } from '#figatellultimate/messages';

/** The breadcrumb, its section labels translated in the page's locale: on its own, wherever a page puts it. */
export async function Crumbs({
  locale,
  crumbs,
}: {
  readonly locale: Locale;
  readonly crumbs: readonly Crumb<MessageKey>[];
}): Promise<ReactNode> {
  const t = await getTranslations({ locale });

  return <Breadcrumb crumbs={crumbs} t={(key) => t(key)} labels={{ nav: t('ui.breadcrumb.nav') }} />;
}

/** next-intl's request configuration: the locale and its generated messages. */
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';

import type { Messages } from '#figatellultimate/messages';

import { precompiledMessages } from './labels';
import { routing } from './routing';

// Each request's messages: figatellultimate's, validated at build time in every locale, loaded lazily, precompiled. The locale
// comes from the `[locale]` root segment (`next/root-params`, Next ≥ 16.3): no `setRequestLocale` in pages.
export default getRequestConfig(async ({ locale: explicit }) => {
  // An explicit locale (`getTranslations({ locale })`) wins; otherwise the root segment's.
  const requested = explicit ?? (await rootParams.locale());

  if (!hasLocale(routing.locales, requested)) notFound();

  // Precompiled (`labels.ts`): no page ships the ICU parser.
  const messages = await precompiledMessages(requested);

  // The one assertion: next-intl types the source strings; with the `format-only` alias (next.config.ts) it reads
  // the compiled form handed here.
  return { locale: requested, messages: messages as unknown as Messages };
});

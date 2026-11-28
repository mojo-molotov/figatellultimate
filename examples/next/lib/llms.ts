/**
 * What the site exposes to LLMs: the pages its configuration exposes (`llms`, the documentation), per locale, in
 * their reading order, each with its Markdown. Delegates collection and sorting to `@figatellultimate/site`.
 */
import { llmsMarkdownOf } from '@figatellultimate/content-collections/llms';
import { exposedPagesOf as collectExposedPages, isLlmsExposed, type ExposedPage } from '@figatellultimate/site';

import { findByUrl, metadataFields, mountedUrls } from '#figatellultimate/urls';

export type { ExposedPage };

/**
 * Whether a URL is exposed to LLMs.
 *
 * @param url - A page's URL.
 * @returns Whether its collection exposes it (`llms`), it does not leave itself out, and it is indexed.
 */
export const isExposed = (url: string): boolean => isLlmsExposed(mountedUrls, url);

/**
 * A page's Markdown for LLMs, when it is exposed.
 *
 * @param url - The page's URL.
 * @returns Its source, `<llm-exclude>` and MDX's statements left out; `undefined` when it is not exposed.
 */
export async function exposedMarkdownOf(url: string): Promise<string | undefined> {
  if (!isExposed(url)) return undefined;

  const found = await findByUrl(url);

  return found?.kind === 'entry' ? llmsMarkdownOf(found.entry.body) : undefined;
}

/**
 * A locale's exposed pages, in their reading order (the collection's `order` field), then by title.
 *
 * @param locale - The locale.
 * @returns Its exposed pages, each with its Markdown.
 */
export function exposedPagesOf(locale: string): Promise<readonly ExposedPage[]> {
  return collectExposedPages({
    urls: mountedUrls,
    locale,
    find: findByUrl,
    fields: metadataFields,
    toMarkdown: llmsMarkdownOf,
  });
}

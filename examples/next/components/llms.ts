/**
 * What the site exposes to LLMs: the pages its configuration exposes (`llms`, the documentation), per locale, in
 * their reading order, each with its Markdown. Read by the `llms.txt`, `llms-full.txt` and Markdown routes, and by
 * the page, which links its Markdown version and its locale's `llms.txt`.
 */
import { llmsMarkdownOf } from '@figatellultimate/site';

import { findByUrl, mountedUrls } from '#figatellultimate/urls';

/** An exposed page: its URL, title and description, and its Markdown for LLMs. */
export interface ExposedPage {
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
}

/**
 * Whether a URL is exposed to LLMs.
 *
 * @param url - A page's URL.
 * @returns Whether its collection exposes it (`llms`), it does not leave itself out, and it is indexed.
 */
export const isExposed = (url: string): boolean => mountedUrls.some((item) => item.url === url && item.llms);

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
 * A locale's exposed pages, in the documentation's reading order (`order`), then by title.
 *
 * @param locale - The locale.
 * @returns Its exposed pages, each with its Markdown.
 */
export async function exposedPagesOf(locale: string): Promise<readonly ExposedPage[]> {
  const found = await Promise.all(
    mountedUrls.filter((item) => item.llms && item.locale === locale).map((item) => findByUrl(item.url)),
  );
  const pages = found.flatMap((page) => (page?.kind === 'entry' ? [page.entry] : []));

  return pages
    .toSorted(
      (a, b) =>
        (a.data.order ?? Number.POSITIVE_INFINITY) - (b.data.order ?? Number.POSITIVE_INFINITY) ||
        a.data.title.localeCompare(b.data.title, locale),
    )
    .map((entry) => ({
      url: entry.url,
      title: entry.data.title,
      description: entry.data.metadescription,
      markdown: llmsMarkdownOf(entry.body),
    }));
}

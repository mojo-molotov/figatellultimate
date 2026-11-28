/**
 * What the site exposes to LLMs: the pages its configuration exposes (`llms`, the documentation), per locale, in
 * their reading order, each with its Markdown. Read by the `llms.txt`, `llms-full.txt` and Markdown routes, and by
 * the page, which links its Markdown version and its locale's `llms.txt`.
 */
import { llmsMarkdownOf } from '@figatellultimate/content-collections/llms';

import { findByUrl, metadataFields, mountedUrls } from '#figatellultimate/urls';

/** An exposed page: its URL, title and description, and its Markdown for LLMs. */
export interface ExposedPage {
  readonly url: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly markdown: string;
}

/** A frontmatter field, by the name its collection declares (`metadataFields`): never written here. */
const fieldOf = (data: object, name: string | undefined): unknown =>
  name === undefined ? undefined : Reflect.get(data, name);

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
 * A locale's exposed pages, in their reading order (the collection's `order` field), then by title.
 *
 * @param locale - The locale.
 * @returns Its exposed pages, each with its Markdown.
 */
export async function exposedPagesOf(locale: string): Promise<readonly ExposedPage[]> {
  const found = await Promise.all(
    mountedUrls.filter((item) => item.llms && item.locale === locale).map((item) => findByUrl(item.url)),
  );
  const pages = found.flatMap((page) => {
    if (page?.kind !== 'entry') return [];

    // Read through the fields the collection declares: its title, description and order.
    const fields = metadataFields[page.collection];
    const title = fieldOf(page.entry.data, fields.title);
    const description = fieldOf(page.entry.data, fields.description);
    const order = fieldOf(page.entry.data, fields.order);

    return [
      {
        url: page.entry.url,
        title: typeof title === 'string' ? title : page.entry.url,
        ...(typeof description === 'string' ? { description } : {}),
        order: typeof order === 'number' ? order : Number.POSITIVE_INFINITY,
        markdown: llmsMarkdownOf(page.entry.body),
      },
    ];
  });

  return pages
    .toSorted((a, b) => a.order - b.order || a.title.localeCompare(b.title, locale))
    .map((page) => ({
      url: page.url,
      title: page.title,
      ...(page.description === undefined ? {} : { description: page.description }),
      markdown: page.markdown,
    }));
}

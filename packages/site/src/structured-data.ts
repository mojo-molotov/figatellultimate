/**
 * schema.org structured data, as pure functions returning frozen objects: an entry (its collection's declared type),
 * a breadcrumb, a person; and their safe serialization for a `<script>`.
 *
 * Key design decisions:
 *     - The type is declared on the collection (`metadata.schema`), never inferred from Open Graph: a collection may
 *       be a `TechArticle` while its Open Graph type is `article`.
 *     - Data, not a component: the app writes the `<script>`, whatever its framework.
 *     - Escaping belongs to `jsonLd`: no value can close the script it is written in.
 *
 * Invariants: each type, missing fields left out, the declared canonical, the escaping and its round trip
 * (`structured-data.test.ts`).
 */
import { absoluteOn, plainSpaces, text, w3cDate } from './shared.js';
import type { MetadataFields, Site, SiteEntryWithData, StructuredData } from './types.js';

const CONTEXT = 'https://schema.org';

/** Only the properties that have a value: schema.org data never carries empty ones. */
const defined = (properties: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));

/** An author or a term page's person: a name, and the page to find them. */
export interface Person {
  readonly name: string;
  readonly url?: string | undefined;
}

/**
 * The schema.org data of an entry.
 *
 * @param entry - A generated entry: its URL, locale and frontmatter data.
 * @param fields - The frontmatter fields its collection declares, its schema.org type included (`WebPage` default).
 * @param site - The site's origin and name (an article's publisher).
 * @param extra - Its authors' names (translated by the app) and pages.
 * @returns A frozen object: `headline` for an article type or `name` for a page, the description, the image, the
 *   dates as W3C dates (`dateModified` falling back to the publication), the authors, the URL (the declared canonical
 *   when there is one), the language; empty properties left out.
 *
 * @example
 * structuredDataOf(post, metadataFields.blog, site, { authors: [{ name: 'Gustave', url: '/authors/gustave' }] });
 * // { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: …, datePublished: …, author: [...] }
 */
export function structuredDataOf(
  entry: SiteEntryWithData,
  fields: MetadataFields,
  site: Site,
  extra: { readonly authors?: readonly Person[] } = {},
): StructuredData {
  const absolute = absoluteOn(site);
  const read = (field: string | undefined): string | undefined =>
    field === undefined ? undefined : text(entry.data[field]);
  const type = fields.schema ?? 'WebPage';
  const article = type !== 'WebPage';
  const title = read(fields.title);
  // Read by machines: plain spaces, as the meta description.
  const description = read(fields.description);
  const image = read(fields.image);
  const published = read(fields.publishedTime);
  const modified = read(fields.modifiedTime) ?? published;
  const url = read(fields.canonical) ?? absolute(entry.url);
  const authors = extra.authors ?? [];

  return Object.freeze({
    '@context': CONTEXT,
    '@type': type,
    ...defined({
      [article ? 'headline' : 'name']: title,
      description: description === undefined ? undefined : plainSpaces(description),
      image: image === undefined ? undefined : Object.freeze([absolute(image)]),
      datePublished: published === undefined ? undefined : w3cDate(published),
      dateModified: modified === undefined ? undefined : w3cDate(modified),
      author:
        authors.length === 0
          ? undefined
          : Object.freeze(
              authors.map((author) =>
                Object.freeze({
                  '@type': 'Person',
                  ...defined({ name: author.name, url: author.url === undefined ? undefined : absolute(author.url) }),
                }),
              ),
            ),
      url,
      mainEntityOfPage: article ? url : undefined,
      inLanguage: entry.locale,
      publisher:
        article && site.name !== undefined ? Object.freeze({ '@type': 'Organization', name: site.name }) : undefined,
    }),
  });
}

/**
 * A `BreadcrumbList` from a breadcrumb's steps.
 *
 * @param crumbs - The steps, labels already translated (e.g. `breadcrumbOf`'s, its message keys translated).
 * @param site - The site's origin.
 * @returns A frozen `BreadcrumbList`: positions from 1, absolute links; a step without a page has no `item`.
 *
 * @example
 * breadcrumbListOf([{ label: 'Accueil', url: '/' }, { label: 'Blog', url: '/blog' }], site);
 */
export function breadcrumbListOf(
  crumbs: readonly { readonly label: string; readonly url?: string | undefined }[],
  site: Site,
): StructuredData {
  const absolute = absoluteOn(site);

  return Object.freeze({
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: Object.freeze(
      crumbs.map((crumb, index) =>
        Object.freeze({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.label,
          ...(crumb.url === undefined ? {} : { item: absolute(crumb.url) }),
        }),
      ),
    ),
  });
}

/**
 * A `Person`, e.g. for an author's term page.
 *
 * @param person - The name, the page, and optionally an image, a bio and profiles elsewhere.
 * @param site - The site's origin.
 * @returns A frozen `Person`, absolute URLs, empty properties left out.
 *
 * @example
 * personOf({ name: 'Gustave', url: '/authors/gustave', image: '/authors/gustave.svg' }, site);
 */
export function personOf(
  person: {
    readonly name: string;
    readonly url: string;
    readonly image?: string | undefined;
    readonly description?: string | undefined;
    readonly sameAs?: readonly string[] | undefined;
  },
  site: Site,
): StructuredData {
  const absolute = absoluteOn(site);

  return Object.freeze({
    '@context': CONTEXT,
    '@type': 'Person',
    ...defined({
      name: person.name,
      url: absolute(person.url),
      image: person.image === undefined ? undefined : absolute(person.image),
      description: person.description === undefined ? undefined : plainSpaces(person.description),
      sameAs: person.sameAs === undefined || person.sameAs.length === 0 ? undefined : Object.freeze([...person.sameAs]),
    }),
  });
}

/**
 * The text of a `<script type="application/ld+json">`.
 *
 * @param data - One schema.org object, or several.
 * @returns JSON with every `<` escaped, so that no value can close the script (`</script>`) or open a comment; it
 *   parses back to the same data.
 *
 * @example
 * <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([data, breadcrumb]) }} />
 */
export function jsonLd(data: StructuredData | readonly StructuredData[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

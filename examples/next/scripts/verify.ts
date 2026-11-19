// Acceptance on the real `next build`: every mounted URL is prerendered with its metadata, the draft is absent in
// production, the sitemap lists every mounted URL.
// Run after `pnpm example:build`: `pnpm example:verify` (plain Node).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSearch, type SearchResult, type SearchSort } from '@figatellultimate/search';
import { localeLinksOf } from '@figatellultimate/site';

import { defaultLocale, locales } from '#figatellultimate/locales';
import { navigationOf } from '#figatellultimate/navigation';

import { blogIndex } from '#figatellultimate/blog';
import { taxonomies } from '#figatellultimate/taxonomies';
import { findAuthorsTermByUrl } from '#figatellultimate/terms';
import { mountedUrls } from '#figatellultimate/urls';

import { site } from '../site.ts';
import { findBlogFolderByUrl } from '#figatellultimate/blog';

const ORIGIN = site.origin;
const app = join(import.meta.dirname, '..', '.next', 'server', 'app');
const problems: string[] = [];
const check = (condition: boolean, problem: string): void => {
  if (!condition) problems.push(problem);
};
/**
 * The prerendered HTML of a public URL. With next-intl's `app/[locale]`, Next writes every locale under its own
 * folder, the default one included: `/docs` is `fr/docs.html`, `/en/docs` is `en/docs.html`.
 */
const htmlOf = (url: string): string | undefined => {
  const prefixed = locales.some((l) => l !== defaultLocale && (url === `/${l}` || url.startsWith(`/${l}/`)));
  const built = prefixed ? url : `/${defaultLocale}${url === '/' ? '' : url}`;
  const path = join(app, `${built}.html`);

  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
};
const absolute = (url: string): string => `${ORIGIN}${url}`;

/** Every link of a slot in some HTML, by its href, whatever the order of its attributes (`next/link` puts `href` last). */
const hrefsOf = (html: string, slot: string): string[] =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes(`data-slot="${slot}"`))
    .map((tag) => /\shref="([^"]+)"/.exec(tag)?.[1] ?? '');

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;
/** A JSON object's object field, `{}` when absent: read files are checked, not cast. */
const objectAt = (value: unknown, key: string): Readonly<Record<string, unknown>> => {
  const field = isRecord(value) ? value[key] : undefined;

  return isRecord(field) ? field : {};
};

// Classic static generation: every prerendered route is fully static.
const manifest: unknown = JSON.parse(readFileSync(join(app, '..', '..', 'prerender-manifest.json'), 'utf8'));

for (const [route, value] of Object.entries(objectAt(manifest, 'routes'))) {
  const renderingMode: unknown = isRecord(value) ? value['renderingMode'] : undefined;

  check(
    renderingMode === undefined || renderingMode === 'STATIC',
    `${route}: rendered as ${String(renderingMode)}, not static`,
  );
}

check(mountedUrls.length >= 10, `expected every content route, found ${String(mountedUrls.length)} mounted URLs`);

for (const item of mountedUrls) {
  const html = htmlOf(item.url);

  if (html === undefined) {
    problems.push(`${item.url}: not prerendered`);
    continue;
  }

  check(
    html.includes(`<link rel="canonical" href="${absolute(item.url)}"/>`),
    `${item.url}: wrong or missing canonical`,
  );

  for (const [locale, url] of Object.entries(item.alternates)) {
    check(
      html.includes(`hrefLang="${locale}" href="${absolute(url ?? '')}"`),
      `${item.url}: missing alternate ${locale}`,
    );
  }

  const xDefault = item.alternates.fr;

  check(
    xDefault === undefined
      ? !html.includes('hrefLang="x-default"')
      : html.includes(`hrefLang="x-default" href="${absolute(xDefault)}"`),
    `${item.url}: wrong x-default`,
  );
  check(html.includes(`<meta property="og:url" content="${absolute(item.url)}"`), `${item.url}: missing og:url`);
  check(
    html.includes(item.kind === 'entry' ? `data-collection="${item.collection}"` : 'data-folder=') ||
      html.includes('data-listing='),
    `${item.url}: not rendered by the catch-all`,
  );

  if (item.kind === 'entry' && item.collection === 'blog') {
    check(html.includes('<meta property="og:type" content="article"'), `${item.url}: not an article`);
    check(html.includes('<meta property="article:published_time"'), `${item.url}: missing published time`);
    check(html.includes('<meta property="article:tag"'), `${item.url}: missing tags`);
  }
}

check(htmlOf('/blog/maquis/corsicamon/how-to-catch-pulendix') === undefined, 'the draft is published in production');

// The page sizes, as the configuration sets them (`perPage` of `folderPages`): the checks follow it.
const sizeOf = (url: string): number => {
  const size = findBlogFolderByUrl(url)?.perPage;

  if (size === undefined) throw new Error(`${url}: not a paged folder page`);

  return size;
};
const perPost = sizeOf('/blog/empire/decrees');
const perSection = sizeOf('/blog/empire');

// The subcategory page: the default view prerendered in full, with real pagination links.
for (const [listing, expectedFirst] of [
  ['/blog/empire/decrees', '/blog/empire/decrees/amending-decree-on-pushing-to-main-without-review'],
  ['/en/blog/empire/decrees', '/en/blog/empire/decrees/amending-decree-on-pushing-to-main-without-review'],
] as const) {
  const html = htmlOf(listing);

  if (html === undefined) {
    problems.push(`${listing}: listing not prerendered`);
    continue;
  }

  const cards = [...html.matchAll(/data-key="([^"]*)"/g)].map((match) => match[1]);

  check(cards[0] === expectedFirst, `${listing}: the newest post is not first (default sort)`);
  check(cards.length === perPost, `${listing}: wrong first page size`);
  check(new Set(cards).size === cards.length, `${listing}: a card is rendered twice`);
}

const french = htmlOf('/blog/empire/decrees') ?? '';

check([...french.matchAll(/data-key="/g)].length === perPost, '/blog/empire/decrees: not a page of cards');
check(french.includes('href="/blog/empire/decrees/page/2"'), '/blog/empire/decrees: no real link to page 2');

// Each further page is prerendered with its own slice and title; the listing's index holds every post, once.
const decrees = blogIndex.filter(
  (item) => item.locale === 'fr' && !item.reserved && item.url.startsWith('/blog/empire/decrees/'),
);
const keysOf = (html: string): string[] => [...html.matchAll(/data-key="([^"]*)"/g)].map((match) => match[1] ?? '');
const second = htmlOf('/blog/empire/decrees/page/2') ?? '';
const last = Math.ceil(decrees.length / perPost);
const englishLast = Math.ceil(
  blogIndex.filter((item) => item.locale === 'en' && !item.reserved && item.url.startsWith('/en/blog/empire/decrees/'))
    .length / perPost,
);

check(keysOf(second).length === perPost, '/blog/empire/decrees/page/2: not a page of cards');
check(
  keysOf(second).every((key) => !keysOf(french).includes(key)),
  '/blog/empire/decrees/page/2: a card of the first page',
);
check(
  second.includes(`<title>Décrets impériaux · ${site.name ?? ''}</title>`),
  "/blog/empire/decrees/page/2: not its folder's title, then the site's name",
);
check(
  second.includes(`aria-label="Page 2 sur ${String(last)}, page actuelle"`),
  '/blog/empire/decrees/page/2: not marked as page 2',
);
check(
  keysOf(htmlOf(`/blog/empire/decrees/page/${String(last)}`) ?? '').length === decrees.length - (last - 1) * perPost,
  '/blog/empire/decrees: the last page does not hold the remaining posts',
);
check(htmlOf(`/blog/empire/decrees/page/${String(last + 1)}`) === undefined, '/blog/empire/decrees: a page too many');

const index: unknown = JSON.parse(readFileSync(join(app, 'fr', 'listing', 'empire', 'decrees.body'), 'utf8'));
const indexed =
  typeof index === 'object' && index !== null && 'items' in index && Array.isArray(index.items) ? index.items : [];

check(indexed.length === decrees.length, "/listing/empire/decrees: the listing's index does not hold every post");

// The unstyled components are prerendered: the pagination's real links, the facets and the sort.
for (const slot of ['facet-options-trigger', 'sort-select-trigger', 'pagination', 'pagination-link'])
  check(french.includes(`data-slot="${slot}"`), `/blog/empire/decrees: no prerendered ${slot}`);

check(
  french.includes(`aria-label="Page 1 sur ${String(last)}, page actuelle"`),
  '/blog/empire/decrees: pagination not in French',
);
check(french.includes('aria-label="Trier les articles"'), '/blog/empire/decrees: sort select not in French');
const english = htmlOf('/en/blog/empire/decrees') ?? '';

check(english.includes('aria-label="Sort posts"'), '/en/blog/empire/decrees: sort select not in English');
check(
  english.includes(`aria-label="Page 1 of ${String(englishLast)}, current page"`),
  '/en/blog/empire/decrees: pagination not in English',
);
check(french.includes('data-slot="pagination"'), '/blog/empire/decrees: no pagination');

// The site's icon (`app/icon.svg`): linked from every page, served.
check(
  /<link rel="icon" href="\/icon\.svg[^"]*"[^>]*type="image\/svg\+xml"/.test(htmlOf('/blog') ?? '') &&
    existsSync(join(app, 'icon.svg.body')),
  '/blog: no site icon',
);

const sitemap = readFileSync(join(app, 'sitemap.xml.body'), 'utf8');

// Every indexed mounted URL; the noindex ones are checked absent below.
for (const item of mountedUrls.filter((candidate) => candidate.indexed))
  check(sitemap.includes(`<loc>${absolute(item.url)}</loc>`), `sitemap: missing ${item.url}`);

check(new Set(mountedUrls.map((item) => item.url)).size === mountedUrls.length, 'a URL is mounted twice');

// The minimal design system: every page has the navbar generated from the content, in its own language,
// and the locale switcher never leads to a URL that is not mounted.
const mountedSet = new Set(mountedUrls.map((item) => item.url));

for (const item of mountedUrls) {
  const html = htmlOf(item.url) ?? '';

  check(html.includes('data-slot="navbar"'), `${item.url}: no navbar`);
  // The root layout knows the locale at last.
  check(html.includes(`<html lang="${item.locale}"`), `${item.url}: <html lang> is not ${item.locale}`);
  check(
    html.includes(`aria-label="${item.locale === 'fr' ? 'Navigation principale' : 'Main navigation'}"`),
    `${item.url}: navbar not in its language`,
  );

  for (const link of localeLinksOf(item.url, mountedUrls, locales))
    check(mountedSet.has(link.url), `${item.url}: the switcher links ${link.url}, which is not mounted`);
}

check(
  navigationOf('en').every((node) => node.kind !== 'entry' || mountedSet.has(node.url)),
  'navigation: an English entry link is not mounted',
);
check(french.includes('data-slot="navbar"'), '/blog/empire/decrees: the listing has no navbar');
check(french.includes('>Décrets impériaux</h1>'), '/blog/empire/decrees: the listing title is not translated');
// The breadcrumb: static, real links, on the listing and on a post, in each page's language.
check(french.includes('aria-label="Fil d’Ariane"'), '/blog/empire/decrees: no breadcrumb');
const post = htmlOf('/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors') ?? '';

check(
  post.includes('aria-label="Fil d’Ariane"') && post.includes('href="/blog/empire/decrees"'),
  '/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors: no breadcrumb linking its listing',
);
check(
  (htmlOf('/en/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors') ?? '').includes(
    'aria-label="Breadcrumb"',
  ),
  '/en/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors: the breadcrumb is not in English',
);

// Folder pages: the blog, a category and a subcategory, from the single catch-all, in both
// locales where they hold posts; every breadcrumb step of a post is a link; the navbar links the categories.
for (const url of [
  '/blog',
  '/blog/empire',
  '/blog/empire/decrees',
  '/blog/maquis/kitchen',
  '/en/blog',
  '/en/blog/empire',
  '/en/blog/empire/decrees',
  '/en/blog/maquis/kitchen',
])
  check(
    mountedUrls.some((item) => item.kind === 'folder' && item.url === url) && htmlOf(url) !== undefined,
    `${url}: folder page not mounted or not prerendered`,
  );

// Every folder page exists in both locales: the whole site is translated (a list's further pages follow each
// locale's own count of posts).
for (const item of mountedUrls.filter(
  (entry) => entry.kind === 'folder' && entry.locale === 'fr' && !/\/page\/\d+$/.test(entry.url),
))
  check(
    mountedUrls.some((other) => other.kind === 'folder' && other.locale === 'en' && other.key === item.key),
    `${item.url}: no English folder page`,
  );

// A category's subcategories, a page at a time (`perPage.category`): a page of sections, the rest further on.
const sectionsOf = (url: string): number => [...(htmlOf(url) ?? '').matchAll(/data-slot="folder-section"/g)].length;
const subcategories = findBlogFolderByUrl('/blog/empire')?.subfolders.length ?? 0;
const sectionPages = Math.ceil(subcategories / perSection);

// Precondition: the category has more than one page.
check(sectionPages > 1, '/blog/empire: a single page of subcategories, its pagination untested');
check(
  sectionsOf('/blog/empire') === perSection && (htmlOf('/blog/empire') ?? '').includes('href="/blog/empire/page/2"'),
  '/blog/empire: not a page of subcategories with a link to page 2',
);
check(
  sectionsOf(`/blog/empire/page/${String(sectionPages)}`) === subcategories - (sectionPages - 1) * perSection,
  '/blog/empire: the last page does not hold the remaining subcategories',
);
check(htmlOf(`/blog/empire/page/${String(sectionPages + 1)}`) === undefined, '/blog/empire: a page too many');
// A further page's breadcrumb: its first page's, the folder its current step, without a number of its own.
check(
  /href="\/blog"[^>]*>Blog<\/a>.*aria-current="page"[^>]*>L’Empire</s.test(htmlOf('/blog/empire/page/2') ?? '') &&
    !/data-slot="breadcrumb".*?>Page 2</s.test(htmlOf('/blog/empire/page/2') ?? ''),
  '/blog/empire/page/2: not the breadcrumb of its first page',
);

/** Every page of a folder page, its further pages included (`…/page/N`), as one text. */
const allPagesOf = (url: string): string =>
  Array.from({ length: findBlogFolderByUrl(url)?.pages ?? 1 }, (_, index) =>
    htmlOf(index === 0 ? url : `${url}/page/${String(index + 1)}`),
  ).join('');
const blogHome = allPagesOf('/blog');

// Images: every one served, and none twice within a category, its posts' covers and bodies alike (a post and its
// translation share theirs); the categories' own images all differ.
const blogDir = join(import.meta.dirname, '..', 'content', 'blog');
const imagesOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/^featuredPictureUrl: '?([^'\n]+)'?$|\]\((\/covers\/[^)]+)\)/gm)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
const frenchFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === 'en'
        ? []
        : frenchFiles(join(dir, entry.name))
      : entry.name.endsWith('.mdx')
        ? [join(dir, entry.name)]
        : [],
  );

for (const category of readdirSync(blogDir)) {
  const images = frenchFiles(join(blogDir, category)).flatMap(imagesOf);

  // Precondition: the category's posts have images.
  check(images.length > 0, `${category}: no image`);
  check(new Set(images).size === images.length, `${category}: an image shown twice`);

  for (const image of images)
    check(existsSync(join(import.meta.dirname, '..', 'public', image)), `${category}: ${image} is not served`);
}

const categoryImages = (findBlogFolderByUrl('/blog')?.subfolders ?? []).map((subfolder) => subfolder.image);

check(
  categoryImages.every((image) => image !== undefined) && new Set(categoryImages).size === categoryImages.length,
  '/blog: a category without an image of its own',
);

check(blogHome.includes('href="/blog/empire"') && blogHome.includes('data-folder="root"'), '/blog: no category');
// "See the n posts" only leads to a list of posts: a category's section links its page by its heading alone.
const moreOf = (url: string): string[] =>
  [...(htmlOf(url) ?? '').matchAll(/data-slot="folder-more"[^>]*>([^<]*)</g)].map((m) => m[1] ?? '');

check(moreOf('/en/blog').length === 0, '/en/blog: a category has a "see more" link');
// Documentation is a link, not a menu, and its page lists its pages.
const docs = htmlOf('/docs') ?? '';

check(
  /data-slot="navbar-link"[^>]*href="\/docs"|href="\/docs"[^>]*data-slot="navbar-link"/.test(docs) &&
    !/data-slot="navbar-trigger"[^>]*>Documentation</.test(docs),
  '/docs: Documentation is not a plain navbar link',
);
check(/data-slot="folder-list".*href="\/docs\/installation"/s.test(docs), '/docs: the page does not list its pages');

// The blog's own pages list its categories, a page at a time, with their descriptions, as previews linking their pages, and no post.
for (const [url, description] of [
  ['/blog', 'Les décrets et les chroniques de l’Empire d’Igoristan, gravés puis versionnés.'],
  ['/en/blog', 'The decrees and chronicles of the Empire of Igoristan, carved, then versioned.'],
] as const) {
  const html = allPagesOf(url);
  // Its previews are its categories (their own pages, two segments under the blog), never a post.
  const links = hrefsOf(html, 'entry-card-link');
  const categories = links.every((link) => /^(\/en)?\/blog\/[^/]+$/.test(link));

  check(html.includes(description) && links.length > 0 && categories, `${url}: not its categories only`);
}

check(
  moreOf('/en/blog/empire').length > 0 && moreOf('/en/blog/empire').every((text) => /^See the \d+ posts$/.test(text)),
  "/en/blog/empire: a subcategory's link does not count its posts",
);
const crumbs =
  (htmlOf('/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors') ?? '').match(
    /data-slot="breadcrumb-list".*?<\/ol>/s,
  )?.[0] ?? '';

for (const href of ['/', '/blog', '/blog/empire', '/blog/empire/decrees'])
  check(
    crumbs.includes(`href="${href}"`),
    `/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors: breadcrumb step ${href} is not a link`,
  );

check(
  !crumbs.includes('data-slot="breadcrumb-text"'),
  '/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors: a breadcrumb step without a link',
);

// Table of contents: every post and documentation page prerenders one whose links are exactly its h2
// and h3 ids, in order,
// and every heading links to itself.
for (const item of mountedUrls.filter(
  (entry) => entry.kind === 'entry' && (entry.collection === 'blog' || entry.key.startsWith('docs/')),
)) {
  const html = htmlOf(item.url) ?? '';
  const toc = html.match(/<nav[^>]*data-slot="toc".*?<\/nav>/s)?.[0] ?? '';
  const body = html.match(/data-pagefind-body.*/s)?.[0] ?? '';
  const ids = [...body.matchAll(/<h[23][^>]*\bid="([^"]+)"/g)].map((m) => m[1] ?? '');
  const links = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => decodeURIComponent(m[1] ?? ''));

  check(
    links.length >= 2 && links.join() === ids.join(),
    `${item.url}: table of contents [${links.join()}] ≠ headings [${ids.join()}]`,
  );
  check(
    ids.every((id) => body.includes(`href="#${id}"`)),
    `${item.url}: a heading does not link to itself`,
  );
}

// Authors' pages: one per author in every locale where they wrote a post, and nowhere else, a page per slice of
// their posts (`perPage`), each prerendered with its slice only (an author's page once held every post, megabytes);
// every card's author links their page in the card's locale.
const authorPages = mountedUrls.filter((item) => item.kind === 'term' && item.collection === 'authors');

for (const author of taxonomies.authors.terms) {
  for (const locale of locales) {
    const posts = blogIndex.filter(
      (item) => item.locale === locale && !item.reserved && item.terms.authors.includes(author),
    );
    const pages = authorPages
      .filter((item) => item.key === author && item.locale === locale)
      .flatMap((item) => findAuthorsTermByUrl(item.url) ?? [])
      .sort((a, b) => a.page - b.page);
    const perPage = pages[0]?.perPage ?? posts.length;

    check(pages.length > 0 === posts.length > 0, `${locale} ${author}: an author page iff they wrote a post`);

    if (pages.length === 0) continue;

    check(
      pages.length === Math.ceil(posts.length / perPage) && pages.every((page, index) => page.page === index + 1),
      `${locale} ${author}: ${String(pages.length)} pages for ${String(posts.length)} posts, ${String(perPage)} a page`,
    );
    check(pages[0]?.url === pages[0]?.first, `${locale} ${author}: the first page is not at the author's URL`);

    for (const page of pages) {
      const html = htmlOf(page.url) ?? '';

      check(html !== '', `${page.url}: not prerendered`);
      // On their own page, the author is a plain name on the cards: no link to the page itself, no preview.
      check(
        !hrefsOf(html, 'entry-card-author').includes(page.first) &&
          /<span data-slot="entry-card-author"(?![^>]*tabindex)/.test(html),
        `${page.url}: the author is still a link or a preview on their own page`,
      );
      // The listing says how many posts it holds, every page of it, not its slice's.
      const total = html.match(/data-slot="listing-total"[^>]*>([^<]+)</)?.[1] ?? '';

      check(
        total.startsWith(`${String(posts.length)} `),
        `${page.url}: the listing says "${total}", not ${String(posts.length)} posts`,
      );
      // Its slice only: the posts of this page, never the others.
      const slice = page.entries.slice((page.page - 1) * perPage, page.page * perPage).map((entry) => entry.item.url);
      const listed = hrefsOf(html, 'entry-card-link');

      check(
        listed.length === slice.length && listed.every((url) => slice.includes(url)),
        `${page.url}: lists [${listed.join()}], not its slice of the author's posts`,
      );
    }
  }
}

check(authorPages.length >= 3, `authors: only ${String(authorPages.length)} pages`);

for (const item of mountedUrls.filter((entry) => entry.kind === 'folder' || entry.kind === 'term')) {
  for (const link of hrefsOf(htmlOf(item.url) ?? '', 'entry-card-author')) {
    const target = authorPages.find((page) => page.url === link);

    check(target?.locale === item.locale, `${item.url}: an author links ${link}, not their page here`);
  }
}

// A section's page lists its pages, and the blog its categories, as post previews: an image and a description each;
// every folder page carries its image in its Open Graph metadata.
for (const [url, count] of [
  ['/docs', 11],
  ['/en/docs', 11],
  // A page of categories, as `perPage.root` sets it.
  ['/blog', Math.min(sizeOf('/blog'), findBlogFolderByUrl('/blog')?.subfolders.length ?? 0)],
  ['/en/blog', Math.min(sizeOf('/en/blog'), findBlogFolderByUrl('/en/blog')?.subfolders.length ?? 0)],
] as const) {
  const cards = [...(htmlOf(url) ?? '').matchAll(/<article data-slot="entry-card".*?<\/article>/gs)].map((m) => m[0]);

  check(cards.length === count, `${url}: lists ${String(cards.length)} previews, expected ${String(count)}`);
  check(
    cards.every(
      (card) => card.includes('data-slot="entry-card-image"') && card.includes('data-slot="entry-card-description"'),
    ),
    `${url}: a preview without its image or its description`,
  );
}

for (const item of mountedUrls.filter((entry) => entry.kind === 'folder')) {
  check(
    /<meta property="og:image" content="[^"]+"/.test(htmlOf(item.url) ?? ''),
    `${item.url}: a folder page without an Open Graph image`,
  );
}

check(
  (htmlOf('/blog/empire') ?? '').includes(findBlogFolderByUrl('/blog/empire')?.image ?? '/nothing'),
  '/blog/empire: not the image declared for its folder',
);

// The MDX registry: every primitive of every body goes through it (its `data-slot`), none left as is.
let primitives = 0;

for (const item of mountedUrls.filter((entry) => entry.kind === 'entry')) {
  // The body only: up to the section's list of pages, a post's footer or the end of the main content, rendered
  // by the app.
  const body =
    ((htmlOf(item.url) ?? '').match(/<div data-slot="mdx">.*/s)?.[0] ?? '').split(
      /<ul data-slot="folder-list"|<footer data-slot="post-footer"|<\/main>/,
    )[0] ?? '';

  check(body !== '', `${item.url}: no MDX body`);
  primitives += [...body.matchAll(/<(?:h[1-6]|p|a|ul|ol|li|blockquote|table|tr|th|td|hr)\b[^>]*data-slot="mdx-/g)]
    .length;
  // A table is the registry's own wrapper's child (`mdx-table`, which scrolls it): bare there, by design.
  const bare = body
    .replaceAll(/(<div data-slot="mdx-table"[^>]*>)<table>/g, '$1')
    .match(/<(h[1-6]|p|ul|ol|li|blockquote|table|hr)(?=[\s>])(?![^>]*data-slot=)[^>]*>/);

  check(bare === null, `${item.url}: a bare <${bare?.[1] ?? ''}> in the body, outside the MDX registry`);
}

check(primitives > 100, `MDX registry: only ${String(primitives)} primitives found`);

// A post ends with its date, its tags and its authors, each author linking their page in the post's locale.
for (const post of blogIndex.filter((item) => !item.reserved)) {
  const footer = (htmlOf(post.url) ?? '').match(/<footer data-slot="post-footer">.*?<\/footer>/s)?.[0] ?? '';

  check(
    /<time data-slot="entry-card-date" dateTime="[^"]+">[^<]+<\/time>/.test(footer),
    `${post.url}: its footer shows no date`,
  );
  const tags = [...footer.matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1] ?? '');

  check(tags.join() === post.terms.tags.join(), `${post.url}: its footer shows tags [${tags.join()}]`);
  const links = hrefsOf(footer, 'entry-card-author');
  const expected = post.terms.authors.map(
    (author) => authorPages.find((page) => page.key === author && page.locale === post.locale)?.url ?? '?',
  );

  check(links.join() === expected.join(), `${post.url}: its footer links authors [${links.join()}]`);
}

// Image zoom: the content's images are prerendered as plain images (the button only arrives on a
// desktop, once hydrated); precondition: the posts hold some.
let images = 0;

for (const item of mountedUrls.filter((entry) => entry.kind === 'entry')) {
  const body = (htmlOf(item.url) ?? '').match(/data-pagefind-body.*/s)?.[0] ?? '';

  images += [...body.matchAll(/<img[^>]*data-slot="image-zoom-image"/g)].length;
  check(!body.includes('data-slot="image-zoom-trigger"'), `${item.url}: an image prerendered as a zoom button`);
}

check(images >= 4, `image zoom: only ${String(images)} content images found`);

// Code blocks: every prerendered block is highlighted by Shiki with both themes' variables
// and wrapped with its copy button; precondition: the posts hold some (a vacuous pass is impossible).
let blocks = 0;

for (const item of mountedUrls.filter((entry) => entry.kind === 'entry')) {
  const html = htmlOf(item.url) ?? '';

  for (const block of html.matchAll(/<div data-slot="code-block">(.*?)<\/pre>(.*?)<\/span><\/div>/gs)) {
    blocks += 1;
    const [, pre = '', rest = ''] = block;

    check(/<pre[^>]*class="shiki/.test(pre), `${item.url}: a code block is not highlighted`);
    check(pre.includes('--shiki-light:') && pre.includes('--shiki-dark:'), `${item.url}: a code block lacks a theme`);
    check(rest.includes('data-slot="code-block-copy"'), `${item.url}: a code block has no copy button`);
  }

  check(!/<pre(?![^>]*data-slot="code-block-pre")/.test(html), `${item.url}: a code block without CodeBlock`);
}

check(blocks >= 4, `code blocks: only ${String(blocks)} found in the posts`);

// Local search: one Pagefind bundle per locale, holding exactly its mounted, searchable entries.
const bundles = join(import.meta.dirname, '..', 'public', 'pagefind');

for (const locale of ['fr', 'en']) {
  const entryFile = join(bundles, locale, 'pagefind-entry.json');

  if (!existsSync(entryFile)) {
    problems.push(`search: no bundle for ${locale} (run figatellultimate search)`);
    continue;
  }

  const languages = objectAt(JSON.parse(readFileSync(entryFile, 'utf8')), 'languages');
  const pages: unknown = objectAt(languages, locale)['page_count'];
  const expected = mountedUrls.filter((item) => item.searchable && item.locale === locale).length;

  check(Object.keys(languages).join() === locale, `search: the ${locale} bundle holds other languages`);
  check(pages === expected, `search: the ${locale} bundle has ${String(pages)} pages, expected ${String(expected)}`);
}

check(
  mountedUrls.some((item) => item.collection === 'landingPages' && !item.searchable),
  'search: landing pages should not be searchable',
);

// Search acceptance: the bundles searched like a browser would (Pagefind's own `pagefind.js`, figatellultimate's client),
// `fetch` reading the bundle's `file:` URLs. Each locale finds its own entries only, with its stemming; landing pages
// are not searchable; the collection filter applies.
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);

  if (!url.startsWith('file:')) return realFetch(input, init);

  return new Response(await readFile(fileURLToPath(url.split('?')[0] ?? url)));
};
const searchers = Object.fromEntries(
  ['fr', 'en'].map((locale) => [
    locale,
    createSearch({
      collections: ['pages', 'blog'],
      locale,
      base: pathToFileURL(bundles).href,
      debounce: 0,
      load: (url) => import(url),
    }),
  ]),
);
const found = async (locale: string, term: string, collections?: readonly ('pages' | 'blog')[]): Promise<string[]> => {
  const page = await searchers[locale]?.query(term, { collections });

  if (page?.status !== 'done') return [`(${page?.status ?? 'superseded'})`];

  return page.results.map((result) => result.url).sort();
};
const expectations: readonly [string, string, readonly string[], (readonly ('pages' | 'blog')[])?][] = [
  ['fr', 'bienvenue', ['/']],
  ['en', 'bienvenue', []],
  ['en', 'welcome', ['/en']],
  ['fr', 'welcome', []],
  ['fr', 'racinisation', ['/docs/search']],
  ['en', 'stemming', ['/en/docs/search']],
];

for (const [locale, term, expected, collections] of expectations) {
  const urls = await found(locale, term, collections);

  check(
    urls.join() === expected.join(),
    `search: "${term}" in ${locale}${collections === undefined ? '' : ` (${collections.join()})`} found [${urls.join(', ')}], expected [${expected.join(', ')}]`,
  );
}

// The collection filter: the blog's Igoristan in the blog only, none of it among the pages.
{
  const inBlog = await found('fr', 'igoristan', ['blog']);

  check(
    inBlog.length > 3 && inBlog.every((url) => url.startsWith('/blog/')),
    `search: "igoristan" in the blog [${inBlog.join(', ')}]`,
  );
  check((await found('fr', 'igoristan', ['pages'])).length === 0, 'search: "igoristan" found among the pages');
}

// Landing pages are not searchable: their own words never lead to them (other pages may still match by prefix).
for (const [locale, term] of [
  ['fr', 'figée'],
  ['en', 'frozen'],
] as const)
  check(
    !(await found(locale, term)).some((url) => url.includes('/lp/')),
    `search: "${term}" in ${locale} leads to a landing page`,
  );

// Each result carries its page's breadcrumb (Pagefind metadata): without the home nor the page itself.
for (const [locale, term, url, trail] of [
  ['fr', 'racinisation', '/docs/search', 'Documentation'],
  ['en', 'stemming', '/en/docs/search', 'Documentation'],
] as const) {
  const page = await searchers[locale]?.query(term);
  const result = page?.status === 'done' ? page.results.find((item) => item.url === url) : undefined;

  check(result?.meta['breadcrumb'] === trail, `search: ${url} has the trail "${result?.meta['breadcrumb'] ?? ''}"`);
}

// Sorted search: every result of "igoristan", loaded to the last, in the order each sort promises.
const everything = async (sort: SearchSort): Promise<readonly SearchResult<'pages' | 'blog'>[]> => {
  let page = await searchers['fr']?.query('igoristan', { sort });

  while (page?.more !== undefined) page = await page.more();

  return page?.status === 'done' ? page.results : [];
};
const plain = (title: string): string =>
  title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const isOrdered = (values: readonly string[], order: 'asc' | 'desc'): boolean =>
  values.every(
    (value, index) => index === 0 || (order === 'asc' ? values[index - 1]! <= value : values[index - 1]! >= value),
  );
const titlesAsc = (await everything('title-asc')).map((result) => plain(result.title));

check(titlesAsc.length > 3 && isOrdered(titlesAsc, 'asc'), `search: A → Z not in order [${titlesAsc.join(' | ')}]`);
check(
  isOrdered(
    (await everything('title-desc')).map((result) => plain(result.title)),
    'desc',
  ),
  'search: Z → A not in order',
);
const dates = new Map(
  await Promise.all(blogIndex.map(async (item) => [item.url, String((await item.load()).data.date)] as const)),
);
const dated = (results: readonly SearchResult<'pages' | 'blog'>[]): string[] =>
  results.map((result) => dates.get(result.url) ?? '');
const newest = dated(await everything('date-desc'));

check(
  isOrdered(
    newest.filter((date) => date !== ''),
    'desc',
  ),
  `search: newest first not in order [${newest.join(', ')}]`,
);

// Each result carries its date: a post's publication date, none for a page.
for (const result of await everything('date-desc'))
  check(result.date === dates.get(result.url), `search: ${result.url} has the date ${String(result.date)}`);

// Undated results (pages) come after every dated one, both ways.
for (const order of [newest, dated(await everything('date-asc'))])
  check(
    order.indexOf('') === -1 || order.slice(order.indexOf('')).every((date) => date === ''),
    'search: an undated result before a dated one',
  );

globalThis.fetch = realFetch;

// SEO: structured data on every page, the blog's feed per locale, robots.txt, dated sitemap
// entries, and a `noindex` page mounted but kept from crawlers.
/** Every JSON-LD object of a page, parsed: a page's data must be valid JSON. */
const structuredDataOf = (html: string): Readonly<Record<string, unknown>>[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].flatMap((match) => {
    const parsed: unknown = JSON.parse(match[1] ?? 'null');

    return (Array.isArray(parsed) ? parsed : [parsed]).filter(isRecord);
  });

for (const item of mountedUrls) {
  const html = htmlOf(item.url) ?? '';
  const types = structuredDataOf(html).map((data) => data['@type']);
  const expected =
    item.kind === 'term'
      ? ['Person']
      : item.kind === 'folder'
        ? ['BreadcrumbList']
        : item.collection === 'blog'
          ? ['BlogPosting', 'BreadcrumbList']
          : ['WebPage', 'BreadcrumbList'];

  check(
    types.join() === expected.join(),
    `${item.url}: structured data [${types.join(', ')}], expected [${expected.join(', ')}]`,
  );
}

const posting =
  structuredDataOf(htmlOf('/en/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors') ?? '')[0] ?? {};

check(posting['headline'] === 'Imperial decree on the banning of CORS errors', 'BlogPosting: no headline');
check(
  posting['datePublished'] === '2024-01-08' && posting['dateModified'] === '2024-01-28',
  'BlogPosting: wrong dates',
);
check(
  JSON.stringify(posting['author']) ===
    JSON.stringify([
      { '@type': 'Person', name: 'Igor', url: absolute('/en/authors/igor') },
      { '@type': 'Person', name: 'Napoléon', url: absolute('/en/authors/napoleon') },
    ]),
  `BlogPosting: wrong authors ${JSON.stringify(posting['author'])}`,
);
// The messages are precompiled (`i18n/precompile.ts`): no client chunk ships the ICU parser, whose error kinds are
// strings in its code.
const chunks = join(import.meta.dirname, '..', '.next', 'static', 'chunks');
const parsing = readdirSync(chunks).filter(
  (name) => name.endsWith('.js') && readFileSync(join(chunks, name), 'utf8').includes('EXPECT_ARGUMENT_CLOSING_BRACE'),
);

check(parsing.length === 0, `the ICU parser is shipped to the browser: ${parsing.join(', ')}`);

// No client component imports next-intl (`i18n/labels.ts`): no chunk ships use-intl's runtime (its error codes are
// strings in its code), and no page carries the catalog of messages.
const intl = readdirSync(chunks).filter(
  (name) => name.endsWith('.js') && readFileSync(join(chunks, name), 'utf8').includes('MISSING_MESSAGE'),
);

check(intl.length === 0, `use-intl's runtime is shipped to the browser: ${intl.join(', ')}`);

for (const url of ['/docs/cli', '/en/blog/empire/chronicles', '/'])
  check(
    // A missing page fails too.
    !(htmlOf(url) ?? String.raw`\"messages\":`).includes(String.raw`\"messages\":`),
    `${url}: the messages are serialized in the page`,
  );

// Both themes loaded, maquis by default until the visitor's choice (`components/site-themes.ts`); the footer picks.
for (const url of ['/', '/en/docs/cli']) {
  const html = htmlOf(url) ?? '';

  check(/<html[^>]*data-site-theme="maquis"/.test(html), `${url}: no default site theme on <html>`);
  check(html.includes('data-slot="site-theme"'), `${url}: no theme picker in the footer`);
}

const noindex = mountedUrls.filter((item) => !item.indexed).map((item) => item.url);

check(noindex.join() === '/en/lp/launch-v1,/lp/launch-v1', `noindex: [${noindex.join(', ')}]`);

for (const url of noindex) {
  check(htmlOf(url)?.includes('<meta name="robots" content="noindex"/>') === true, `${url}: no robots meta`);
  check(!sitemap.includes(`<loc>${absolute(url)}</loc>`), `sitemap: lists ${url}, which is noindex`);
}

check(
  sitemap.includes(`<loc>${absolute('/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors')}</loc>`) &&
    /imperial-decree-on-banning-of-cors-errors<\/loc>[^]*?<lastmod>2024-01-28<\/lastmod>/.test(sitemap),
  'sitemap: the updated post is not dated by its modification',
);

for (const locale of locales) {
  const file = join(app, locale, 'feed.xml.body');
  const feed = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const links = [...feed.matchAll(/<item><title>[^<]*<\/title><link>([^<]*)<\/link>/g)].map((match) => match[1]);
  const posts = blogIndex.filter((item) => item.locale === locale && !item.reserved);

  check(links.length === Math.min(20, posts.length), `feed ${locale}: ${String(links.length)} items`);
  check(new Set(links).size === links.length, `feed ${locale}: an item twice`);
  const dates = [...feed.matchAll(/<pubDate>([^<]*)<\/pubDate>/g)].map((match) => Date.parse(match[1] ?? ''));

  check(
    dates.every((date, index) => index === 0 || (dates[index - 1] ?? 0) >= date),
    `feed ${locale}: not newest first`,
  );
  check(feed.includes(`<language>${locale}</language>`), `feed ${locale}: no language`);
}

const feedLink = '<link rel="alternate" type="application/rss+xml" href="/en/feed.xml"/>';

check(htmlOf('/en/docs')?.includes(feedLink) === true, '/en/docs: no link to its feed');
const robotsFile = join(app, 'robots.txt.body');
const robotsTxt = existsSync(robotsFile) ? readFileSync(robotsFile, 'utf8') : '';

check(robotsTxt.includes(`Sitemap: ${absolute('/sitemap.xml')}`), 'robots.txt: no sitemap');

// Sparkles: loaded on demand on desktops, so never in the prerendered HTML; the stylesheet shows them on
// listing pages only, which carry its markers (a folder or author page's `main`, a section's list of pages).
for (const item of mountedUrls)
  check(!(htmlOf(item.url) ?? '').includes('data-slot="sparkles"'), `${item.url}: sparkles prerendered`);

const listingMarker = /<main[^>]*data-(listing|folder)=|data-slot="folder-list"/;

for (const url of ['/blog', '/blog/empire', '/blog/empire/decrees', '/docs', '/authors/igor', '/en/blog'])
  check(listingMarker.test(htmlOf(url) ?? ''), `${url}: not marked as a listing, no sparkles`);

for (const url of ['/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors', '/docs/installation'])
  check(!listingMarker.test(htmlOf(url) ?? ''), `${url}: marked as a listing`);

// Authors' long bios: on their page under the short one where written (Napoléon has none in English), never a page.
for (const url of ['/authors/igor', '/en/authors/igor', '/authors/napoleon'])
  check(htmlOf(url)?.includes('data-slot="author-bio"') === true, `${url}: no long bio`);

for (const url of mountedUrls.map((item) => item.url).filter((url) => url.startsWith('/en/authors/napoleon')))
  check(htmlOf(url)?.includes('data-slot="author-bio"') !== true, `${url}: a long bio that was never written`);

// Never a page of its own (the types already keep it out of `mountedUrls`): nothing built at its path.
for (const url of ['/igor', '/en/igor', '/napoleon']) check(htmlOf(url) === undefined, `${url}: a long bio has a page`);

// GitHub's Markdown: a table in the content is a real table (remark-gfm), styled as the theme's.
for (const url of ['/docs/faceted-collections', '/en/docs/cli'])
  check(/<div data-slot="mdx-table"[^>]*><table/.test(htmlOf(url) ?? ''), `${url}: a table left as text`);

// The documentation in its reading order (`order`), and each page linking the previous and next ones.
{
  const order = hrefsOf(htmlOf('/docs') ?? '', 'entry-card-link');

  check(
    order.slice(0, 4).join() === '/docs/quick-start,/docs/installation,/docs/configuration,/docs/content',
    `/docs: not in its reading order [${order.join(', ')}]`,
  );

  const pager = (htmlOf('/docs/installation') ?? '').match(/<nav[^>]*data-slot="pager".*?<\/nav>/s)?.[0] ?? '';

  check(
    /href="\/docs\/quick-start"[^>]*rel="prev"|rel="prev"[^>]*href="\/docs\/quick-start"/.test(pager) &&
      /href="\/docs\/configuration"[^>]*rel="next"|rel="next"[^>]*href="\/docs\/configuration"/.test(pager),
    '/docs/installation: no previous and next pages',
  );
}

// A section's own page is an index of its pages: the plain layout, never the article's table of contents.
for (const url of ['/docs', '/en/docs']) {
  const html = htmlOf(url) ?? '';

  check(
    !html.includes('data-layout="article"') && !html.includes('data-slot="toc"'),
    `${url}: an index with a sidebar`,
  );
}

// Package manager commands: one block in tabs (npm, pnpm, yarn, bun), every variant prerendered, npm shown first.
for (const url of ['/docs/installation', '/en/docs/cli', '/docs/nextjs']) {
  const html = htmlOf(url) ?? '';
  const tabs = [...html.matchAll(/data-slot="code-tabs-trigger"[^>]*>([^<]+)</g)].map((match) => match[1]);

  check(tabs.slice(0, 4).join() === 'npm,pnpm,yarn,bun', `${url}: no package manager tabs (${tabs.join()})`);
  check(
    html.includes('pnpm add -D') || html.includes('pnpm exec') || html.includes('figatellultimate'),
    `${url}: a variant missing`,
  );
}

// Printed, each page carries its title in its margins (the maquis theme's `@top-right`).
check(
  (htmlOf('/blog/empire/decrees/imperial-decree-on-banning-of-cors-errors') ?? '').includes(
    `--fig-print-title:"Décret impérial sur l'interdiction des erreurs CORS"`,
  ),
  'a printed page without its title',
);

// The footer: on every page, out of the search, with links to the navigation's sections.
for (const item of mountedUrls) {
  const html = htmlOf(item.url) ?? '';

  check(/<footer[^>]*data-slot="site-footer"[^>]*data-pagefind-ignore="all"/.test(html), `${item.url}: no footer`);
  check(
    /data-slot="site-footer-links"[\s\S]*href="[^"]*\/blog"/.test(html),
    `${item.url}: no section links in the footer`,
  );
}

if (problems.length > 0) {
  console.error(`✖ ${String(problems.length)} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${String(mountedUrls.length)} mounted URLs prerendered with canonical, alternates, x-default and Open Graph; subcategory pages with their default view and pagination links; sitemap (dated, noindex left out), structured data, feeds, robots.txt, drafts, the footer, one search bundle per locale (French and English queries, stemming, collection filter), and the navbar from the content in each page's language as expected.`,
  );
}

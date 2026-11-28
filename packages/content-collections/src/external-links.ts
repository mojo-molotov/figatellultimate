/**
 * External links in MDX marked `rel="nofollow"` by default: a rehype plugin of the MDX compilation, leaving internal
 * paths, anchors, non-web schemes (`mailto:`, `tel:`), and links to the site's own `origin` untouched.
 *
 * Key design decisions:
 *     - Structural hast and MDX JSX types, as `rehypeCodeGroups` and `rehypeLlmExclude`: no dependency for the user's
 *       config to load.
 *     - Handles both Markdown links (hast `<a>` elements) and inline MDX JSX `<a>` elements with static string `href`.
 *     - Merges `rel` tokens without duplicates (case-insensitively) and honors per-link opt-out (`rel="follow"` or
 *       `rel="dofollow"`), stripping the non-standard opt-out token so the emitted HTML stays valid.
 *     - Does not force `target="_blank"`: an app that wants it passes `target: '_blank'`, preserving any `target`
 *       already written on a link.
 *
 * Invariants (`external-links.test.ts`): external `http(s):` and protocol-relative links receive `rel="nofollow"` by
 * default; relative paths, anchors, non-web schemes, same-origin URLs, `follow` destinations, and per-link `follow`/
 * `dofollow` opt-outs do not; existing `rel` tokens are preserved without duplicates; dynamic JSX attributes stay
 * untouched.
 */

/** An MDX JSX attribute as the compilation carries it in the tree. */
export interface ExternalLinkAttribute {
  readonly type: string;
  readonly name?: string | undefined;
  value?: unknown;
}

/** The part of a hast or MDX JSX node this plugin reads and writes: structural, so no hast types are required. */
export interface ExternalLinkNode {
  readonly type: string;
  /** An HTML element's tag (`a`). */
  readonly tagName?: string | undefined;
  /** An MDX JSX element's name (`a`). */
  readonly name?: string | null | undefined;
  properties?: Record<string, unknown> | undefined;
  attributes?: ExternalLinkAttribute[] | undefined;
  readonly children?: readonly ExternalLinkNode[] | undefined;
}

/** Options of `rehypeExternalLinks`: the site's own origin, trusted destinations, and the attributes to apply. */
export interface ExternalLinksOptions {
  /**
   * The site's own origin (e.g. `'https://example.com'`). Absolute or protocol-relative URLs with the same origin are
   * treated as internal and left untouched.
   */
  readonly origin?: string | undefined;
  /**
   * External hosts (exact hostname match, case-insensitive) or predicate for URLs that should stay followed: they do
   * not receive `nofollow` (any other configured `rel` tokens and `target` still apply).
   */
  readonly follow?: readonly string[] | ((url: URL) => boolean) | undefined;
  /**
   * Link relation tokens added to external links, merged without duplicates with any existing `rel`.
   * Default: `['nofollow']`.
   */
  readonly rel?: readonly string[] | undefined;
  /**
   * Optional `target` attribute applied to external links that do not already declare one (e.g. `'_blank'`).
   * Default: unset.
   */
  readonly target?: string | undefined;
}

const DEFAULT_REL: readonly string[] = ['nofollow'];
const FOLLOW_OPT_OUT = new Set(['follow', 'dofollow']);
const EXTERNAL_SCHEME = /^(?:https?:)?\/\//i;
const PLACEHOLDER_ORIGIN = 'https://placeholder.invalid';

/**
 * Parses an external web URL (`http://`, `https://`, or protocol-relative `//`), returning `undefined` for relative
 * paths, anchors, non-web schemes (`mailto:`, `tel:`, …), malformed URLs, or URLs sharing `siteOrigin`.
 */
function parseExternal(href: string, siteOrigin: string | undefined): URL | undefined {
  const trimmed = href.trim();

  if (!EXTERNAL_SCHEME.test(trimmed)) return undefined;

  let url: URL;

  try {
    url = trimmed.startsWith('//') ? new URL(trimmed, siteOrigin ?? PLACEHOLDER_ORIGIN) : new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  if (siteOrigin !== undefined && url.origin === siteOrigin) return undefined;

  return url;
}

function parseRel(value: unknown): string[] {
  if (typeof value === 'string')
    return value
      .trim()
      .split(/\s+/)
      .filter((token) => token !== '');

  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === 'string')
      .flatMap((item) => item.trim().split(/\s+/))
      .filter((token) => token !== '');

  return [];
}

function mergeRel(existing: readonly string[], additions: readonly string[], followed: boolean): string[] {
  const optOut = followed || existing.some((token) => FOLLOW_OPT_OUT.has(token.toLowerCase()));
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (token: string): void => {
    const lower = token.toLowerCase();

    if (lower === '' || FOLLOW_OPT_OUT.has(lower) || seen.has(lower)) return;

    seen.add(lower);
    result.push(token);
  };

  for (const token of existing) add(token);

  for (const token of additions) {
    if (optOut && token.toLowerCase() === 'nofollow') continue;

    add(token);
  }

  return result;
}

function isFollowed(url: URL, follow: ExternalLinksOptions['follow']): boolean {
  if (follow === undefined) return false;

  if (typeof follow === 'function') return follow(url);

  const host = url.hostname.toLowerCase();

  return follow.some((entry) => entry.toLowerCase() === host);
}

function updateElement(
  node: ExternalLinkNode,
  siteOrigin: string | undefined,
  follow: ExternalLinksOptions['follow'],
  rel: readonly string[],
  target: string | undefined,
): void {
  const href = node.properties?.['href'];

  if (typeof href !== 'string') return;

  const url = parseExternal(href, siteOrigin);

  if (url === undefined) return;

  const existing = parseRel(node.properties?.['rel']);
  const nextRel = mergeRel(existing, rel, isFollowed(url, follow));
  const properties: Record<string, unknown> = { ...node.properties };

  if (nextRel.length > 0) properties['rel'] = nextRel.join(' ');
  else delete properties['rel'];

  if (target !== undefined && properties['target'] === undefined) properties['target'] = target;

  node.properties = properties;
}

function updateJsxLink(
  node: ExternalLinkNode,
  siteOrigin: string | undefined,
  follow: ExternalLinksOptions['follow'],
  rel: readonly string[],
  target: string | undefined,
): void {
  const attributes = node.attributes;

  if (attributes === undefined) return;

  const hrefAttr = attributes.find((attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'href');

  if (typeof hrefAttr?.value !== 'string') return;

  const url = parseExternal(hrefAttr.value, siteOrigin);

  if (url === undefined) return;

  const relIndex = attributes.findIndex((attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'rel');
  const relAttr = relIndex === -1 ? undefined : attributes[relIndex];
  const nextAttributes = [...attributes];

  // Dynamic JSX `rel={expr}`: leave it alone rather than replacing an expression with a string.
  if (relAttr === undefined || typeof relAttr.value === 'string') {
    const nextRel = mergeRel(parseRel(relAttr?.value), rel, isFollowed(url, follow));

    if (nextRel.length > 0) {
      const updated: ExternalLinkAttribute = { type: 'mdxJsxAttribute', name: 'rel', value: nextRel.join(' ') };

      if (relIndex === -1) nextAttributes.push(updated);
      else nextAttributes[relIndex] = updated;
    } else if (relIndex !== -1) {
      nextAttributes.splice(relIndex, 1);
    }
  }

  if (target !== undefined && !nextAttributes.some((attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'target'))
    nextAttributes.push({ type: 'mdxJsxAttribute', name: 'target', value: target });

  node.attributes = nextAttributes;
}

/**
 * Adds `rel="nofollow"` (or configured `rel` tokens and optional `target`) to every external link in an MDX tree.
 *
 * @param options - Optional `origin` (same-origin URLs stay internal), `follow` (trusted hosts or predicate that skip
 *   `nofollow`), `rel` (tokens merged without duplicates, default `['nofollow']`), and `target`.
 * @returns The rehype plugin; its place among the others does not matter.
 *
 * @example
 * compileMDX(context, document, {
 *   rehypePlugins: [[rehypeExternalLinks, { origin: 'https://example.com' }], rehypeShiki],
 * });
 */
export function rehypeExternalLinks(options: ExternalLinksOptions = {}): (tree: ExternalLinkNode) => void {
  const siteOrigin = options.origin === undefined ? undefined : new URL(options.origin).origin;
  const rel = options.rel ?? DEFAULT_REL;
  const { follow, target } = options;

  const visit = (node: ExternalLinkNode): void => {
    if (node.type === 'element' && node.tagName === 'a') updateElement(node, siteOrigin, follow, rel, target);
    else if ((node.type === 'mdxJsxTextElement' || node.type === 'mdxJsxFlowElement') && node.name === 'a')
      updateJsxLink(node, siteOrigin, follow, rel, target);

    for (const child of node.children ?? []) visit(child);
  };

  return visit;
}

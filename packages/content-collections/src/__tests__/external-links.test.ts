import { describe, expect, it } from 'vitest';

import {
  rehypeExternalLinks,
  type ExternalLinkAttribute,
  type ExternalLinkNode,
  type ExternalLinksOptions,
} from '../external-links.js';

const link = (href: string, properties: Record<string, unknown> = {}): ExternalLinkNode => ({
  type: 'element',
  tagName: 'a',
  properties: { href, ...properties },
  children: [{ type: 'text' }],
});

const jsxLink = (
  attributes: ExternalLinkAttribute[],
  type: 'mdxJsxTextElement' | 'mdxJsxFlowElement' = 'mdxJsxTextElement',
): ExternalLinkNode => ({
  type,
  name: 'a',
  attributes,
  children: [{ type: 'text' }],
});

const attr = (name: string, value: unknown): ExternalLinkAttribute => ({ type: 'mdxJsxAttribute', name, value });

const run = (nodes: ExternalLinkNode[], options?: ExternalLinksOptions): ExternalLinkNode[] => {
  const tree: ExternalLinkNode = { type: 'root', children: [{ type: 'element', tagName: 'p', children: nodes }] };

  rehypeExternalLinks(options)(tree);

  return nodes;
};

describe('rehypeExternalLinks', () => {
  it('marks external http, https and protocol-relative links as nofollow by default', () => {
    const [https, http, upper, protoRel] = run([
      link('https://llmstxt.org'),
      link('http://example.com/guide'),
      link('HTTPS://EXAMPLE.ORG/Spec'),
      link('//cdn.example.net/doc'),
    ]);

    expect(https?.properties?.['rel']).toBe('nofollow');
    expect(http?.properties?.['rel']).toBe('nofollow');
    expect(upper?.properties?.['rel']).toBe('nofollow');
    expect(protoRel?.properties?.['rel']).toBe('nofollow');
    expect(https?.properties?.['target']).toBeUndefined();
  });

  it('leaves internal paths, anchors, queries, non-web schemes and malformed URLs untouched', () => {
    const nodes = run([
      link('/docs/cli'),
      link('./sibling'),
      link('../parent'),
      link('#section-1'),
      link('?page=2'),
      link(''),
      link('mailto:igor@example.com'),
      link('tel:+33123456789'),
      link('https://[invalid'),
      { type: 'element', tagName: 'a', properties: {}, children: [] },
    ]);

    for (const node of nodes) expect(node.properties?.['rel']).toBeUndefined();
  });

  it('treats absolute and protocol-relative URLs on the site origin as internal', () => {
    const [same, samePort, sameProtoRel, external] = run(
      [
        link('https://figatellultimate.vercel.app/docs'),
        link('https://figatellultimate.vercel.app:443/blog'),
        link('//figatellultimate.vercel.app/docs'),
        link('https://other.example.com/docs'),
      ],
      { origin: 'https://figatellultimate.vercel.app/' },
    );

    expect(same?.properties?.['rel']).toBeUndefined();
    expect(samePort?.properties?.['rel']).toBeUndefined();
    expect(sameProtoRel?.properties?.['rel']).toBeUndefined();
    expect(external?.properties?.['rel']).toBe('nofollow');
  });

  it('merges existing rel tokens without duplicates and supports per-link follow/dofollow opt-out', () => {
    const [merged, arrayRel, dup, optOut, optOutWithOther] = run([
      link('https://example.com', { rel: 'noopener' }),
      link('https://example.com', { rel: ['ugc', 'sponsored'] }),
      link('https://example.com', { rel: 'NoFollow noopener' }),
      link('https://example.com', { rel: 'dofollow' }),
      link('https://example.com', { rel: 'follow noopener' }),
    ]);

    expect(merged?.properties?.['rel']).toBe('noopener nofollow');
    expect(arrayRel?.properties?.['rel']).toBe('ugc sponsored nofollow');
    expect(dup?.properties?.['rel']).toBe('NoFollow noopener');
    expect(optOut?.properties?.['rel']).toBeUndefined();
    expect(optOutWithOther?.properties?.['rel']).toBe('noopener');
  });

  it('honors follow host allowlists and predicates, and applies custom rel and target when configured', () => {
    const [trusted, untrusted, withTarget] = run(
      [
        link('https://GitHub.com/mojo-molotov/figatellultimate'),
        link('https://docs.github.com/en'),
        link('https://example.com', { target: '_self' }),
      ],
      { follow: ['github.com'], rel: ['nofollow', 'noopener'], target: '_blank' },
    );

    expect(trusted?.properties?.['rel']).toBe('noopener');
    expect(trusted?.properties?.['target']).toBe('_blank');
    expect(untrusted?.properties?.['rel']).toBe('nofollow noopener');
    expect(untrusted?.properties?.['target']).toBe('_blank');
    // An explicit target on the link is preserved.
    expect(withTarget?.properties?.['target']).toBe('_self');

    const [byFn, other] = run([link('https://sub.trusted.org/a'), link('https://untrusted.org/b')], {
      follow: (url) => url.hostname.endsWith('.trusted.org'),
    });

    expect(byFn?.properties?.['rel']).toBeUndefined();
    expect(other?.properties?.['rel']).toBe('nofollow');
  });

  it('handles inline MDX JSX <a> elements, preserving dynamic expressions', () => {
    const [plain, merged, optOut, internal, dynamicHref, dynamicRel] = run([
      jsxLink([attr('href', 'https://example.com')]),
      jsxLink([attr('href', 'https://example.com'), attr('rel', 'sponsored')], 'mdxJsxFlowElement'),
      jsxLink([attr('href', 'https://example.com'), attr('rel', 'dofollow')]),
      jsxLink([attr('href', '/docs/cli')]),
      jsxLink([attr('href', { type: 'mdxJsxAttributeValueExpression', value: 'url' })]),
      jsxLink([
        attr('href', 'https://example.com'),
        attr('rel', { type: 'mdxJsxAttributeValueExpression', value: 'rel' }),
      ]),
    ]);
    const relOf = (node: ExternalLinkNode | undefined): unknown =>
      node?.attributes?.find((item) => item.name === 'rel')?.value;

    expect(relOf(plain)).toBe('nofollow');
    expect(relOf(merged)).toBe('sponsored nofollow');
    expect(relOf(optOut)).toBeUndefined();
    expect(relOf(internal)).toBeUndefined();
    expect(relOf(dynamicHref)).toBeUndefined();
    expect(relOf(dynamicRel)).toEqual({ type: 'mdxJsxAttributeValueExpression', value: 'rel' });
  });
});

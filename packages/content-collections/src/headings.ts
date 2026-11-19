/**
 * The headings of an entry, computed in its MDX compilation: the ids in the HTML and the ids in the data come from
 * the same pass, so a table of contents always links real anchors. Prerendered, its links work without JavaScript.
 *
 * Invariants: ids unique per document, an existing id kept, empty headings out, document order (`headings.test.ts`).
 */
import type { Heading } from '@figatellultimate/toc';
import GithubSlugger from 'github-slugger';

/** The part of a hast node this plugin reads and writes: structural, so that no hast types are required. */
export interface HastNode {
  readonly type: string;
  readonly tagName?: string | undefined;
  readonly value?: string | undefined;
  properties?: Record<string, unknown> | undefined;
  readonly children?: readonly HastNode[] | undefined;
}

const HEADING = /^h([1-6])$/;

/** A node's text, as a reader sees it: every text node below it, joined. */
const textOf = (node: HastNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('');

/**
 * A rehype plugin for the MDX compilation: the headings' ids, and the headings themselves.
 *
 * @param options - `into`: the list the document's headings are pushed into.
 * @returns The plugin: it gives every non-empty heading an id (github-slugger, unique within the document, as
 *   rehype-slug; an id already set is kept) and pushes `{ id, text, depth }` into `into`, in document order. One
 *   slugger per document: ids never depend on other documents.
 *
 * @example
 * const headings: Heading[] = [];
 * const code = await compileMDX(context, document, { rehypePlugins: [[rehypeHeadings, { into: headings }]] });
 * return { ...document, mdx: code, headings };
 */
export function rehypeHeadings(options: { readonly into: Heading[] }): (tree: HastNode) => void {
  return (tree) => {
    const slugger = new GithubSlugger();
    const visit = (node: HastNode): void => {
      const depth = node.type === 'element' ? HEADING.exec(node.tagName ?? '')?.[1] : undefined;

      if (depth !== undefined) {
        const text = textOf(node).trim().replaceAll(/\s+/g, ' ');

        if (text !== '') {
          const own = node.properties?.['id'];
          const id = typeof own === 'string' && own !== '' ? own : slugger.slug(text);

          node.properties = { ...node.properties, id };
          options.into.push({ id, text, depth: Number(depth) });
        }

        return;
      }

      for (const child of node.children ?? []) visit(child);
    };

    visit(tree);
  };
}

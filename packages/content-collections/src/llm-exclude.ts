/**
 * `<llm-exclude>` in a page: what it holds is for its readers only, left out of what the site exposes to LLMs
 * (`llmsMarkdownOf` of `@figatellultimate/site` reads the source). A rehype plugin of the MDX compilation: the page
 * shows what the tag holds, never the tag.
 *
 *     <llm-exclude>          the page:  its content, unwrapped
 *       For humans only.      llms:      nothing (the source, read by `llmsMarkdownOf`)
 *     </llm-exclude>
 *
 * Key design decisions:
 *     - One tag, written in the content, as the Ocarina Holy Book does; a block (its own lines,
 *       blank lines around its Markdown) or within a line.
 *     - Unwrapped, not rendered: a custom element would reach the HTML, unknown to the page and to its styles.
 *     - Structural hast types, as `rehypeCodeGroups`: no dependency for the user's config to load.
 *
 * Invariants (`llm-exclude.test.ts`): the tag gone and its content kept, as a block or within a line, nested in any
 * element; any other JSX element left as it is.
 */

/** The part of a hast node this plugin reads and writes: structural, so that no hast types are required. */
export interface LlmExcludeNode {
  readonly type: string;
  /** An element's tag. */
  readonly tagName?: string | undefined;
  /** An MDX JSX element's name. */
  readonly name?: string | null | undefined;
  readonly value?: string | undefined;
  children?: LlmExcludeNode[] | undefined;
}

const TAG = 'llm-exclude';

const isExclusion = (node: LlmExcludeNode): boolean =>
  (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === TAG;

/**
 * Unwraps every `<llm-exclude>` of a page: its content shown in its place, the tag gone.
 *
 * @returns The rehype plugin; its place among the others does not matter.
 *
 * @example
 * compileMDX(context, document, { rehypePlugins: [rehypeLlmExclude, rehypeShiki] });
 */
export function rehypeLlmExclude(): (tree: LlmExcludeNode) => void {
  const visit = (parent: LlmExcludeNode): void => {
    if (parent.children === undefined) return;

    parent.children = parent.children.flatMap((child) => {
      visit(child);

      return isExclusion(child) ? (child.children ?? []) : [child];
    });
  };

  return visit;
}

// prettier-ignore
/**
 * An MDX compilation that gives its headings too: the code and the table of contents from the same pass, cached
 * together by Content Collections.
 *
 *     context.cache(document, under its own key) ──> compile(pass-through cache, the headings plugin)
 *                                                       └─> { mdx, headings }, cached as one value
 *
 * Key design decision: `compileMDX` caches its code by content, so on its own a cached document would skip the
 * plugins and lose its headings. Both are cached here, as one value, and the compiler gets a cache that always
 * computes: the plugins run whenever the code is compiled.
 *
 * Invariants (`mdx.test.ts`): the code and its headings in one pass; a cached document keeps its headings, never
 * compiled again, the compiler's own cache passed through.
 */
import { rehypeHeadings } from './headings.js';

/** Content Collections' cache, as a transform's context carries it (`context.cache`). */
export type CacheFn = <I, O>(
  input: I,
  compute: (input: I) => Promise<O> | O,
  options?: { readonly key: string },
) => Promise<O>;

/** A heading as Content Collections stores it: a plain object type, which its serializable data accepts. */
export type MdxHeading = { id: string; text: string; depth: number };

/** The headings plugin with its list, ready for `rehypePlugins`. */
export type HeadingsPlugin = [typeof rehypeHeadings, { readonly into: MdxHeading[] }];

/** The key the code and its headings are cached under. */
const KEY = '__figatellultimate_mdx';

/**
 * Compiles a document's MDX with its headings, both cached together.
 *
 * @param context - The transform's context: its `cache`.
 * @param document - The document: its `content` and `_meta`, what its cache entry depends on.
 * @param compile - Compiles it, e.g. `compileMDX` of `@content-collections/mdx`, with the cache and the headings plugin
 *   given: put the plugin among `rehypePlugins` where the ids should be set (before a plugin linking headings).
 * @returns The compiled code and the document's headings, in document order.
 *
 * @example
 * transform: async (document, context) => ({
 *   ...document,
 *   ...(await compileWithHeadings(context, document, (cache, headings) =>
 *     compileMDX(cache, document, { rehypePlugins: [headings, rehypeShiki] }),
 *   )),
 * }),
 */
export async function compileWithHeadings<R>(
  context: { readonly cache: CacheFn },
  document: { readonly content: string; readonly _meta: unknown },
  compile: (passThrough: { readonly cache: CacheFn }, headings: HeadingsPlugin) => Promise<R>,
): Promise<{ readonly mdx: R; readonly headings: MdxHeading[] }> {
  return context.cache(
    { content: document.content, _meta: document._meta },
    async () => {
      const headings: MdxHeading[] = [];
      const mdx = await compile({ cache: async (input, compute) => compute(input) }, [
        rehypeHeadings,
        { into: headings },
      ]);

      return { mdx, headings };
    },
    { key: KEY },
  );
}

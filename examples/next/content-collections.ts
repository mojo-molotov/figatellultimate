/** The delegated content tool's configuration: schemas, MDX compilation and headings per collection. */
import { defineCollection, defineConfig, type Meta } from '@content-collections/core';
import rehypeShiki from '@shikijs/rehype';
import { compileMDX } from '@content-collections/mdx';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkGfm from 'remark-gfm';
import { rehypeHeadings, withFigatellultimate } from '@figatellultimate/content-collections/config';
import { rehypeImageSizes } from '@figatellultimate/content-collections/images';
import { resolve } from 'node:path';
import * as v from 'valibot';

import { rehypeCodeGroups } from './rehype-code-groups';

// MDX is compiled by the delegated tool: figatellultimate hands the compiled code over as `data.mdx`.
const common = {
  title: v.string(),
  metadescription: v.string(),
  featuredPictureUrl: v.optional(v.string()),
  draft: v.optional(v.boolean(), false),
  // SEO: checked by figatellultimate as metadata fields.
  updated: v.optional(v.string()),
  robots: v.optional(v.string()),
  canonical: v.optional(v.string()),
  // A page's place among its siblings (the documentation's reading order).
  order: v.optional(v.number()),
  content: v.string(),
};
// The headings are computed with the compiled code, in the same pass that sets their ids. Both are
// cached together: `compileMDX` caches its code by content, so on its own a cached document would skip the plugin and
// lose its headings; inside, it gets a pass-through cache.
const transform = async <D extends { content: string; _meta: Meta }>(
  document: D,
  context: Parameters<typeof compileMDX>[0],
) => ({
  ...document,
  ...(await context.cache(
    { content: document.content, _meta: document._meta },
    async () => {
      // A plain object type, not `Heading` (an interface): Content Collections only accepts serializable types.
      const headings: { id: string; text: string; depth: number }[] = [];
      const passThrough: Parameters<typeof compileMDX>[0] = {
        cache: async (input, compute) => compute(input),
      };
      const mdx = await compileMDX(passThrough, document, {
        // GitHub's Markdown: tables, task lists, strikethrough, autolinks.
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          // Consecutive blocks marked npm, pnpm, yarn, bun: one block in tabs.
          rehypeCodeGroups,
          [rehypeHeadings, { into: headings }],
          // Each local image's width and height, from its file in `public/`: `next/image` reserves its room. The
          // build runs from the example's folder (`figatellultimate build`), as Next serves `public/` from it.
          [rehypeImageSizes, { publicDirectory: resolve('public') }],
          // After the ids: each section heading links to itself, its text the link's name.
          [rehypeAutolinkHeadings, { behavior: 'wrap', test: ['h2', 'h3', 'h4'] }],
          // Code highlighted at build time, both themes as CSS variables picked by the stylesheet.
          [rehypeShiki, { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false }],
        ],
      });

      return { mdx, headings };
    },
    { key: '__figatellultimate_mdx' },
  )),
});

const pages = withFigatellultimate(
  defineCollection({
    name: 'pages',
    directory: 'content/pages',
    include: '**/*.mdx',
    schema: v.object(common),
    transform,
  }),
);
const blog = withFigatellultimate(
  defineCollection({
    name: 'blog',
    directory: 'content/blog',
    include: '**/*.mdx',
    schema: v.object({ ...common, date: v.string(), tags: v.array(v.string()), authors: v.array(v.string()) }),
    transform,
  }),
);
const landingPages = withFigatellultimate(
  defineCollection({
    name: 'landingPages',
    directory: 'content/landing-pages',
    include: '**/*.mdx',
    schema: v.object(common),
    transform,
  }),
);

// Each author's long bio, shown on their page under the short one: no page of its own.
const authorBios = withFigatellultimate(
  defineCollection({
    name: 'authorBios',
    directory: 'content/authors',
    include: '**/*.mdx',
    schema: v.object({ content: v.string() }),
    transform,
  }),
);

export default defineConfig({ content: [pages, blog, landingPages, authorBios] });

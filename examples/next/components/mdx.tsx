/** The MDX components: every element the content produces, styled by the maquis theme (`@figatellultimate/themes/maquis.css`). */
import { MDXContent } from '@content-collections/mdx/react';
import { ScrollRegion } from '@figatellultimate/ui';
import NextLink from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { Code, CodeGroup } from './code';
import { Zoom } from './zoom';

/**
 * The MDX registry, one for every collection: every
 * primitive the content may produce, overridden the way shadcn's `mdx-components.tsx` did, its caller's props (and
 * `className`) passed through; each carries a `data-slot` that the maquis theme (`@figatellultimate/themes/maquis.css`) styles with the design system's tokens.
 * Interactive blocks come from `@figatellultimate/ui`: `CodeBlock` for `pre`, `ImageZoom` for `img`.
 */
const components = {
  h1: (props: ComponentProps<'h1'>): ReactNode => <h1 data-slot="mdx-h1" {...props} />,
  h2: (props: ComponentProps<'h2'>): ReactNode => <h2 data-slot="mdx-h2" {...props} />,
  h3: (props: ComponentProps<'h3'>): ReactNode => <h3 data-slot="mdx-h3" {...props} />,
  h4: (props: ComponentProps<'h4'>): ReactNode => <h4 data-slot="mdx-h4" {...props} />,
  h5: (props: ComponentProps<'h5'>): ReactNode => <h5 data-slot="mdx-h5" {...props} />,
  h6: (props: ComponentProps<'h6'>): ReactNode => <h6 data-slot="mdx-h6" {...props} />,
  p: (props: ComponentProps<'p'>): ReactNode => <p data-slot="mdx-p" {...props} />,
  // An internal link navigates client-side, the layout kept; an external link or an anchor stays an `<a>`.
  a: ({ href, ...props }: ComponentProps<'a'>): ReactNode =>
    href?.startsWith('/') === true && !href.startsWith('//') ? (
      <NextLink data-slot="mdx-a" href={href} {...props} />
    ) : (
      <a data-slot="mdx-a" href={href} {...props} />
    ),
  ul: (props: ComponentProps<'ul'>): ReactNode => <ul data-slot="mdx-ul" {...props} />,
  ol: (props: ComponentProps<'ol'>): ReactNode => <ol data-slot="mdx-ol" {...props} />,
  li: (props: ComponentProps<'li'>): ReactNode => <li data-slot="mdx-li" {...props} />,
  blockquote: (props: ComponentProps<'blockquote'>): ReactNode => <blockquote data-slot="mdx-blockquote" {...props} />,
  // A wide table scrolls on its own, never the whole page; in the Tab order only while it overflows (ScrollRegion).
  table: (props: ComponentProps<'table'>): ReactNode => (
    <ScrollRegion data-slot="mdx-table">
      <table {...props} />
    </ScrollRegion>
  ),
  tr: (props: ComponentProps<'tr'>): ReactNode => <tr data-slot="mdx-tr" {...props} />,
  th: (props: ComponentProps<'th'>): ReactNode => <th data-slot="mdx-th" {...props} />,
  td: (props: ComponentProps<'td'>): ReactNode => <td data-slot="mdx-td" {...props} />,
  hr: (props: ComponentProps<'hr'>): ReactNode => <hr data-slot="mdx-hr" {...props} />,
  // A group of code blocks (`rehype-code-groups.ts`) as tabs; any other `div` as is (a group's labelled panels too).
  div: ({
    'data-code-group': group,
    ...props
  }: ComponentProps<'div'> & { readonly 'data-code-group'?: string }): ReactNode =>
    group === undefined ? <div {...props} /> : <CodeGroup>{props.children}</CodeGroup>,
  // Inline code and a block's code alike: the theme styles the inline one only.
  code: (props: ComponentProps<'code'>): ReactNode => <code data-slot="mdx-code" {...props} />,
  pre: Code,
  img: Zoom,
} satisfies ComponentProps<typeof MDXContent>['components'];

/** Renders an entry's body, compiled by the delegated tool (`@content-collections/mdx`). */
export function Body({ code }: { readonly code: string }): ReactNode {
  return (
    <div data-slot="mdx">
      <MDXContent code={code} components={components} />
    </div>
  );
}

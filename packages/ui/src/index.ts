/**
 * A minimal design system on top of figatellultimate: a navbar generated from the content, a locale switcher that never
 * leads to a 404, a theme toggle, entry cards, a breadcrumb, a table of contents, code blocks, an image zoom, and one
 * stylesheet of tokens (`@figatellultimate/ui/styles.css`) styling every figatellultimate component through its `data-slot`.
 *
 * Entries:
 *     @figatellultimate/ui              the components: client ones marked each in its own module, the others (Breadcrumb,
 *                                       Pager, EntryCard) rendered on the server, so that a page ships only what it uses
 *     @figatellultimate/ui/scripts      inline scripts for the `<head>` (server-callable)
 *     @figatellultimate/ui/styles.css   the stylesheet
 *
 * Key design decisions:
 *     - shadcn-like anatomy on Radix UI: composable parts, each with a `data-slot`, its props and `className`
 *       forwarded; no text of its own: every visible label and aria attribute is a required, typed label.
 *     - Plain CSS with tokens (custom properties), light and dark; no CSS tool imposed, every token overridable.
 *     - Opaque, minimal surfaces: decorative styles (glass, glows, effects) belong to a theme (`@figatellultimate/themes`)
 *       or the app's stylesheet, targeting the same `data-slot`s.
 *     - Internal links through the app's link component (`LinkProvider`): client-side navigations without importing a
 *       framework.
 *     - Images through the app's image component (`ImageProvider`): resized, modern formats (`next/image`) without
 *       importing a framework; plain `<img>` without one.
 */

export * from './breadcrumb.js';
export * from './code-block.js';
export * from './code-tabs.js';
export * from './entry-card.js';
export * from './entry-card-author.js';
export * from './image-zoom.js';
export { ImageProvider, type ImageComponent, type ImageProps } from './image.js';
export { LinkProvider, type LinkComponent, type LinkProps } from './link.js';
export * from './locale-switcher.js';
export * from './navbar.js';
export * from './pager.js';
export * from './table-of-contents.js';
export * from './theme-toggle.js';

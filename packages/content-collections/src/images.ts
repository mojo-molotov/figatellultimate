/**
 * `@figatellultimate/content-collections/images`: the rehype plugin measuring an entry's local images
 * (`image-sizes.ts`), for the user's Content Collections config.
 *
 * Key design decision: an entry of its own, out of `/config`: it reads files (Node's `fs`), while `/config` stays free
 * of any import, so that a config typechecks and loads without Node's types or the builder.
 */
export { rehypeImageSizes } from './image-sizes.js';

/**
 * The size of every local image of an entry, measured in its MDX compilation: an app's image component (`next/image`,
 * given to `@figatellultimate/ui`'s `ImageProvider`) needs each image's width and height to reserve its room (no
 * layout shift) and to serve it resized.
 *
 *     ![Map](/covers/map.png) ──> <img src="/covers/map.png" width="640" height="480"> ──> ImageZoom ──> next/image
 *                                  └─ read from public/covers/map.png's header (image-size)
 *
 * Key design decisions:
 *     - At build time, from the file: the author writes plain Markdown, never a size; a size the author wrote is
 *       kept. Rejected: measuring in the browser, which shifts the page once the image arrives.
 *     - Local images only, inside the public folder: a remote image, an inline one, a missing file or a path out of
 *       the folder is left unmeasured, and stays a plain `<img>` (the zoom gives an image component no image without
 *       its size). Nothing fails the build: the page still shows the image.
 *
 * Invariants (`image-sizes.test.ts`): a local image gets its file's size, its URL decoded; an author's size, a
 * remote, inline or missing image and a path out of the public folder are left as they are.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

import { imageSize } from 'image-size';

import type { HastNode } from './headings.js';

/** The file a local image's URL names, inside the public folder; `undefined` for any other image. */
function fileOf(src: string, publicDirectory: string): string | undefined {
  // A local URL: one leading slash, no scheme, never `//host`.
  if (!src.startsWith('/') || src.startsWith('//')) return undefined;

  let path: string;

  try {
    path = decodeURIComponent(src.split(/[?#]/)[0] ?? '');
  } catch {
    return undefined;
  }

  const file = join(publicDirectory, path);
  const inside = relative(publicDirectory, file);

  return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? undefined : file;
}

/** An image's width and height, read from its file's header; `undefined` when it is missing or no image. */
function sizeOf(file: string): { readonly width: number; readonly height: number } | undefined {
  try {
    const { width, height } = imageSize(readFileSync(file));

    return width > 0 && height > 0 ? { width, height } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A rehype plugin for the MDX compilation: every local image's width and height, read from its file.
 *
 * @param options - `publicDirectory`: the folder local URLs are served from (Next's `public/`), absolute.
 * @returns The plugin: it gives every `img` whose `src` is a local URL (`/covers/map.png`) the `width` and `height`
 *   of its file in that folder, unless the author wrote them; any other image is left as it is.
 *
 * @example
 * compileMDX(context, document, {
 *   rehypePlugins: [[rehypeImageSizes, { publicDirectory: join(import.meta.dirname, 'public') }]],
 * });
 */
export function rehypeImageSizes(options: { readonly publicDirectory: string }): (tree: HastNode) => void {
  return (tree) => {
    const visit = (node: HastNode): void => {
      if (node.type === 'element' && node.tagName === 'img') {
        const { src, width, height } = node.properties ?? {};
        const file =
          typeof src === 'string' && width === undefined && height === undefined
            ? fileOf(src, options.publicDirectory)
            : undefined;
        const size = file === undefined ? undefined : sizeOf(file);

        if (size !== undefined) node.properties = { ...node.properties, width: size.width, height: size.height };

        return;
      }

      for (const child of node.children ?? []) visit(child);
    };

    visit(tree);
  };
}

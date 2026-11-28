// prettier-ignore
/**
 * The content's local images: every image a page shows from the app's own files (`/covers/map.png`), with where it
 * is referenced, for the CLI to check that each one exists in the public folder (`missing-image`).
 *
 *     collection.folderPages.images ──┐
 *     entry.data[metadata.image]  ────┼─> localImageReferences ──> { collection, sourcePath, field, image }[]
 *     entry.body (MDX)            ────┘        └─ the CLI: each image in `publicDirectory`, else `missing-image`
 *
 * Key design decisions:
 *     - Pure, from what the build already has: the core reads no file; the CLI checks the disk.
 *     - Local images only, a path from the site's root: a remote image (`https://…`, `//…`) is not the app's file.
 *     - The body's images in Markdown (`![alt](/a.png)`) and as an `<img src>`, out of code: a fenced block or inline
 *       code shows an example, never an image of the page.
 *     - The path alone, without its query or fragment (`/sprite.svg#icon`): the file it names.
 *
 * Invariant (`images.test.ts`): a collection's folder images, an entry's declared metadata image and its body's local
 * images, each once per place, code and remote images left out.
 *
 * Limitation: an image a component of the app shows, outside the content, is the app's to check.
 */
import type { Collection } from '../declarations/collection.js';

/** Where a local image is referenced, and the image: a path from the site's root. */
export interface ImageReference {
  readonly collection: string;
  /** The entry referencing it; `null` for the collection's declaration (a folder's image). */
  readonly sourcePath: string | null;
  /** The frontmatter field, or the declaration (`folderPages.images["news"]`); `null` for the entry's body. */
  readonly field: string | null;
  readonly image: string;
}

/** What `localImageReferences` reads of an entry: where it is, its frontmatter and its MDX body. */
export interface ImageSource {
  readonly descriptor: { readonly collection: string; readonly sourcePath: string };
  readonly data: Readonly<Record<string, unknown>>;
  readonly body: string;
}

/** `/covers/a.png`, the path alone: a local image; anything else (remote, protocol-relative, not text) is not. */
function localPathOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return undefined;

  const path = value.split(/[?#]/)[0] ?? '';

  return path === '' ? undefined : path;
}

/** The body without its code: fenced blocks and inline code show examples, never the page's images. */
const withoutCode = (body: string): string =>
  body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');

/** The images of an MDX body, in order: Markdown's `![alt](src "title")` and `<img src="…">`. */
function bodyImages(body: string): string[] {
  const prose = withoutCode(body);
  const found = [
    ...[...prose.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].map((match) => ({
      at: match.index,
      src: match[1] ?? '',
    })),
    ...[...prose.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/g)].map((match) => ({
      at: match.index,
      src: match[1] ?? '',
    })),
  ];

  return found.sort((a, b) => a.at - b.at).map(({ src }) => src);
}

/**
 * Every local image the content references: each collection's folder images, then, entry by entry, its metadata image
 * (the field its collection declares) and its body's images, each once per place.
 *
 * @param collections - The declared collections: their folder images and metadata image fields.
 * @param entries - The entries, with their frontmatter and MDX body.
 * @returns The references, deterministic: folders first, then entries in the given order.
 *
 * @example
 * localImageReferences(config.collections, assembly.entries);
 * // [{ collection: 'blog', sourcePath: 'news/launch.mdx', field: 'cover', image: '/covers/launch.jpeg' }, …]
 */
export function localImageReferences(
  collections: Readonly<Record<string, Collection>>,
  entries: readonly ImageSource[],
): readonly ImageReference[] {
  const references: ImageReference[] = [];

  for (const [collection, declared] of Object.entries(collections)) {
    for (const [path, image] of Object.entries(declared.folderPages?.images ?? {})) {
      const local = localPathOf(image);

      if (local !== undefined)
        references.push({ collection, sourcePath: null, field: `folderPages.images["${path}"]`, image: local });
    }
  }

  for (const { descriptor, data, body } of entries) {
    const { collection, sourcePath } = descriptor;
    const field = collections[collection]?.metadata.image;
    const cover = field === undefined ? undefined : localPathOf(data[field]);
    const seen = new Set<string>();

    if (field !== undefined && cover !== undefined) references.push({ collection, sourcePath, field, image: cover });

    for (const src of bodyImages(body)) {
      const local = localPathOf(src);

      if (local === undefined || seen.has(local)) continue;

      seen.add(local);
      references.push({ collection, sourcePath, field: null, image: local });
    }
  }

  return Object.freeze(references.map((reference) => Object.freeze(reference)));
}

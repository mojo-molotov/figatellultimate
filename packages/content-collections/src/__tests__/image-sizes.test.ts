import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { FileSystem } from '@japa/file-system';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HastNode } from '../headings.js';
import { rehypeImageSizes } from '../image-sizes.js';

const PACKAGE = join(import.meta.dirname, '..', '..');
const site = new FileSystem(join(PACKAGE, '.tmp', randomUUID()));

/** The header of a PNG of that size: all an image reader needs to measure it. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);

  return bytes;
}

const put = async (path: string, bytes: Uint8Array): Promise<void> => {
  const file = join(site.basePath, path);

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
};

beforeAll(async () => {
  await put('public/covers/map.png', png(640, 480));
  await put('public/covers/a b.png', png(320, 200));
  await put('secret.png', png(10, 10));
});

afterAll(() => site.cleanup());

const img = (properties: Record<string, unknown>): HastNode => ({ type: 'element', tagName: 'img', properties });

/** The images of a paragraph, measured: each one's width and height after the plugin ran. */
function measured(...images: HastNode[]): unknown[][] {
  const tree: HastNode = { type: 'root', children: [{ type: 'element', tagName: 'p', children: images }] };

  rehypeImageSizes({ publicDirectory: join(site.basePath, 'public') })(tree);

  return images.map((image) => [image.properties?.['width'], image.properties?.['height']]);
}

describe('rehypeImageSizes', () => {
  it("gives every local image its file's width and height, its URL decoded", () => {
    // Precondition: the images have no size before the plugin, so that a no-op cannot pass.
    const images = [img({ src: '/covers/map.png' }), img({ src: '/covers/a%20b.png' })];

    expect(images.map((image) => image.properties?.['width'])).toEqual([undefined, undefined]);
    expect(measured(...images)).toEqual([
      [640, 480],
      [320, 200],
    ]);
  });

  it.each([
    ['a size the author wrote', { src: '/covers/map.png', width: 100, height: 50 }, [100, 50]],
    ['a remote image', { src: 'https://cdn.example.com/map.png' }, [undefined, undefined]],
    ['a protocol-relative one', { src: '//cdn.example.com/map.png' }, [undefined, undefined]],
    ['an inline one', { src: 'data:image/png;base64,iVBORw0KGgo=' }, [undefined, undefined]],
    ['a missing file', { src: '/covers/nowhere.png' }, [undefined, undefined]],
    ['a path out of the public folder', { src: '/../secret.png' }, [undefined, undefined]],
    ['a file that is no image', { src: '/' }, [undefined, undefined]],
  ])('leaves %s as it is', (_, properties, expected) => {
    expect(measured(img(properties))).toEqual([expected]);
  });
});

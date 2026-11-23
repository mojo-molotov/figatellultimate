import { describe, expect, it } from 'vitest';

import { defineCollection } from '../../declarations/collection.js';
import { locale, segment, slug } from '../../declarations/grammar.js';
import { localImageReferences } from '../images.js';

const blog = defineCollection({
  entry: 'blogPost',
  base: 'blog',
  grammar: [segment('category'), locale({ optional: true }), slug()],
  metadata: { image: 'cover' },
  folderPages: { levels: ['category'], images: { news: '/covers/news.jpeg' } },
});
const pages = defineCollection({ entry: 'page', base: '', grammar: [locale({ optional: true }), slug()] });

/** An entry as `localImageReferences` reads it: where it is, its frontmatter and its MDX body. */
const entry = (collection: string, sourcePath: string, data: Record<string, unknown>, body = '') => ({
  descriptor: { collection, sourcePath },
  data,
  body,
});

describe('localImageReferences', () => {
  it("lists an entry's metadata image, the local images of its body, and the folders' images", () => {
    const references = localImageReferences({ blog, pages }, [
      entry(
        'blog',
        'news/launch.mdx',
        { cover: '/covers/launch.jpeg' },
        [
          'A map: ![The map](/content/map.png "Our map") and <img src="/content/photo.webp" alt="" />.',
          '',
          '```md',
          '![In a code block, an example](/covers/example.jpeg)',
          '```',
          '',
          'Inline code: `![not an image](/covers/inline.jpeg)`.',
          '![Remote](https://cdn.example.com/a.png) ![Protocol-relative](//cdn.example.com/b.png)',
          '![Twice](/content/map.png)',
        ].join('\n'),
      ),
      // A page whose collection declares no metadata image: its frontmatter is not read for one.
      entry('pages', 'about.mdx', { cover: '/covers/not-read.jpeg' }, '![Logo](/logo.svg)'),
    ]);

    expect(references).toEqual([
      { collection: 'blog', sourcePath: null, field: 'folderPages.images["news"]', image: '/covers/news.jpeg' },
      { collection: 'blog', sourcePath: 'news/launch.mdx', field: 'cover', image: '/covers/launch.jpeg' },
      { collection: 'blog', sourcePath: 'news/launch.mdx', field: null, image: '/content/map.png' },
      { collection: 'blog', sourcePath: 'news/launch.mdx', field: null, image: '/content/photo.webp' },
      { collection: 'pages', sourcePath: 'about.mdx', field: null, image: '/logo.svg' },
    ]);
  });

  it('reads the path alone, without its query or fragment', () => {
    const [reference] = localImageReferences({ pages }, [
      entry('pages', 'about.mdx', {}, '![Sprite](/img/sprite.svg#icon) ![Versioned](/img/a.png?v=2)'),
    ]);

    expect(reference?.image).toBe('/img/sprite.svg');
    expect(
      localImageReferences({ pages }, [entry('pages', 'about.mdx', {}, '![Versioned](/img/a.png?v=2)')])[0]?.image,
    ).toBe('/img/a.png');
  });
});

import { describe, expect, it } from 'vitest';

import { withMarkers } from '../markers.js';

describe('withMarkers', () => {
  // The sort key as written, escaped; a backtick is a diacritic (the grave accent), left out as every accent.
  it.each([
    ['$$', '$$'],
    ['$&', '$&amp;'],
    ['$`', '$'],
    ["$'", "$'"],
  ])('keeps %s in a title as written: a replacement string reads it as a pattern', (pattern, key) => {
    const html = withMarkers({
      url: '/prix',
      locale: 'fr',
      collection: 'blog',
      html: '<html><body><main data-pagefind-body>Prix</main></body></html>',
      sort: { title: `Prix ${pattern} fin` },
    });

    expect(html).toContain(`data-pagefind-sort="title:prix ${key} fin"`);
    // The markers once, before the body's end, the rest of the page untouched.
    expect(html.match(/<\/body>/g)).toHaveLength(1);
    expect(html.endsWith('</span></body></html>')).toBe(true);
  });
});

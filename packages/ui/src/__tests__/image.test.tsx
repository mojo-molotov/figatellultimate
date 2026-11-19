// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { pixelsOf } from '../image.js';
import { EntryCard, EntryCardAuthor, ImageProvider, ImageZoom, type ImageProps } from '../index.js';

/** The app's image component, e.g. `next/image`: an image marked as the app's, showing the `fill` it was given. */
const AppImage = ({ fill, ...props }: ImageProps): ReactNode => (
  <img data-app="" {...(fill === true ? { 'data-fill': '' } : {})} {...props} />
);

/** Every image figatellultimate's components render, inside a provider or not. */
function renderAll(provided: boolean): void {
  const components = (
    <>
      <EntryCard
        href="/blog/post"
        title="«Un billet»"
        image="/covers/post.jpeg"
        locale="fr"
        labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
      />
      <EntryCardAuthor author={{ key: 'gustave', name: '«Gustave»', avatar: '/authors/gustave.jpeg' }} />
      <ImageZoom
        src="/content/map.png"
        alt="«Carte»"
        width={640}
        height={480}
        labels={{ open: (alt) => `«Agrandir ${alt}»`, close: '«Fermer»' }}
      />
    </>
  );

  render(<main>{provided ? <ImageProvider component={AppImage}>{components}</ImageProvider> : components}</main>);
}

/** The images on the page: their source, whether the app renders them, and the props that size them. */
const images = (): (string | boolean | null)[][] =>
  [...document.querySelectorAll('img')].map((image) => [
    image.getAttribute('src'),
    image.hasAttribute('data-app'),
    image.hasAttribute('data-fill'),
    image.getAttribute('width'),
    image.getAttribute('sizes'),
  ]);

afterEach(() => {
  cleanup();
});

describe('ImageProvider', () => {
  it("renders every image through the app's component: the cover filling its box, the others at their size", () => {
    renderAll(true);

    expect(images()).toEqual([
      ['/covers/post.jpeg', true, true, null, '(max-width: 36rem) 100vw, 12rem'],
      ['/authors/gustave.jpeg', true, false, '24', null],
      ['/content/map.png', true, false, '640', null],
    ]);
  });

  it('keeps a content image without its size a plain image: an image component fails without one', () => {
    render(
      <ImageProvider component={AppImage}>
        <ImageZoom
          src="https://cdn.example.com/map.png"
          alt="«Carte»"
          labels={{ open: (alt) => `«Agrandir ${alt}»`, close: '«Fermer»' }}
        />
      </ImageProvider>,
    );

    expect(images()).toEqual([['https://cdn.example.com/map.png', false, false, null, null]]);
  });

  it('renders plain images without one, never with a `fill` the browser does not know', () => {
    renderAll(false);

    expect(images()).toEqual([
      ['/covers/post.jpeg', false, false, null, '(max-width: 36rem) 100vw, 12rem'],
      ['/authors/gustave.jpeg', false, false, '24', null],
      ['/content/map.png', false, false, '640', null],
    ]);
    expect(document.querySelector('img[fill]')).toBeNull();
  });
});

describe('pixelsOf', () => {
  it.each<[string | number | undefined, number | undefined]>([
    [640, 640],
    ['480', 480],
    ['50%', undefined],
    ['auto', undefined],
    ['', undefined],
    [0, undefined],
    [Number.NaN, undefined],
    [undefined, undefined],
  ])('reads %o as %o pixels: an image component reads no relative size', (value, pixels) => {
    expect(pixelsOf(value)).toBe(pixels);
  });
});

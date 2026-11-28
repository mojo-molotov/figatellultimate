import { describe, expect, it, vi } from 'vitest';

import { cardImagePriority, DEFAULT_DESKTOP_MEDIA } from '../images.js';

describe('cardImagePriority', () => {
  const makeSeams = () => {
    const getImageProps = vi.fn(({ src, sizes }: { readonly src: string; readonly sizes: string }) => ({
      props: { src: `/_next/image?url=${encodeURIComponent(src)}&w=640`, srcSet: `${src} 1x, ${src} 2x`, sizes },
    }));
    const preload = vi.fn();

    return { getImageProps, preload };
  };

  it('returns true for ranks below the mobile count without emitting a desktop preload', () => {
    const seams = makeSeams();
    const eager = cardImagePriority(
      { rank: 0, mobile: 1, desktop: 4, src: '/covers/a.jpg', sizes: '(max-width: 36rem) 100vw, 14rem' },
      seams,
    );

    expect(eager).toBe(true);
    expect(seams.getImageProps).not.toHaveBeenCalled();
    expect(seams.preload).not.toHaveBeenCalled();
  });

  it('preloads with next/image srcset and sizes for ranks between mobile and desktop, returning false', () => {
    const seams = makeSeams();
    const eager = cardImagePriority(
      { rank: 2, mobile: 1, desktop: 4, src: '/covers/b.jpg', sizes: '(max-width: 36rem) 5.5rem, 8rem' },
      seams,
    );

    expect(eager).toBe(false);
    expect(seams.getImageProps).toHaveBeenCalledWith({
      src: '/covers/b.jpg',
      alt: '',
      fill: true,
      sizes: '(max-width: 36rem) 5.5rem, 8rem',
    });
    expect(seams.preload).toHaveBeenCalledWith('/_next/image?url=%2Fcovers%2Fb.jpg&w=640', {
      as: 'image',
      fetchPriority: 'high',
      media: DEFAULT_DESKTOP_MEDIA,
      imageSrcSet: '/covers/b.jpg 1x, /covers/b.jpg 2x',
      imageSizes: '(max-width: 36rem) 5.5rem, 8rem',
    });
  });

  it('skips preloading when there is no image or the rank is past the desktop count', () => {
    const seams = makeSeams();

    expect(cardImagePriority({ rank: 1, mobile: 1, desktop: 4, src: undefined, sizes: '8rem' }, seams)).toBe(false);
    expect(cardImagePriority({ rank: 4, mobile: 1, desktop: 4, src: '/covers/c.jpg', sizes: '8rem' }, seams)).toBe(
      false,
    );
    expect(seams.preload).not.toHaveBeenCalled();
  });
});

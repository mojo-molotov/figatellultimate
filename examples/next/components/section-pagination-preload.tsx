'use client';

/**
 * Lazy loader and desktop-only idle preloader for `section-pagination.tsx`: keeps `@figatellultimate/facets-react` and
 * Radix Select out of the initial root-route bundle, while preloading them on desktop idle so navigating to `/docs`
 * paints `PageSelect` and `Pagination` on the first frame (never preloaded on phones, which use scroll loading).
 */
import { useEffect } from 'react';

const PHONE_MEDIA = '(max-width: 36rem)';

/** Shared dynamic import for both `React.lazy` in `section-list.tsx` and desktop idle preloading. */
export const loadSectionPagination = () => import('./section-pagination');

/**
 * Preloads the desktop section-pagination chunk once the page is idle on non-phone viewports.
 *
 * @returns Nothing rendered.
 */
export function SectionPaginationPreload(): null {
  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia(PHONE_MEDIA).matches) return;

    const load = (): void => {
      void loadSectionPagination();
    };

    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(load);

      return () => {
        cancelIdleCallback(handle);
      };
    }

    const handle = setTimeout(load, 1000);

    return () => {
      clearTimeout(handle);
    };
  }, []);

  return null;
}

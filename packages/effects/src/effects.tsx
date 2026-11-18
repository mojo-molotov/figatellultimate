'use client';

/**
 * The effects, loaded where they can show: the cursor glow with a mouse, the sparkles with a mouse and
 * room for margins. Neither is rendered on the server nor fetched on a phone; a theme's stylesheet still decides
 * where they show (e.g. the dark theme only).
 *
 * Invariants (`effects.test.tsx`): nothing rendered without a mouse; the glow with one; the sparkles only when the
 * screen is wide too; each follows the media query's changes.
 */
import { lazy, Suspense, useSyncExternalStore, type ReactNode } from 'react';

// Chunks of their own (`React.lazy`): their code is fetched only on a device that shows them.
const CursorGlow = lazy(() => import('./cursor-glow.js').then((module) => ({ default: module.CursorGlow })));
const Sparkles = lazy(() => import('./sparkles.js').then((module) => ({ default: module.Sparkles })));

/** A mouse (or a trackpad): the glow follows it. */
const POINTER = '(hover: hover) and (pointer: fine)';
/** A mouse and room for margins beside the 48rem column: the sparkles' place. */
const WIDE = `${POINTER} and (min-width: 64rem)`;

/** Whether a media query holds, following its changes (a window resized, a mouse plugged in); `false` on the server. */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);

      media.addEventListener('change', onChange);

      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The decorative effects: put once in the layout that client-side navigations keep.
 *
 * @returns The cursor glow on a device with a mouse, the sparkles on one with room for margins too, each loaded on
 *   demand; nothing on the server or on a phone.
 *
 * @example
 * <body>{children}<Effects /></body>
 */
export function Effects(): ReactNode {
  const pointer = useMedia(POINTER);
  const wide = useMedia(WIDE);

  return (
    <Suspense fallback={null}>
      {pointer ? <CursorGlow /> : null}
      {wide ? <Sparkles /> : null}
    </Suspense>
  );
}

'use client';

/**
 * The cursor glow: a glow of `--fig-glow-color` following the mouse behind the content. `Effects` loads it
 * on demand, on devices with a mouse only: decorative code has no business on a phone. Styled by `styles.css`.
 *
 * Invariants (`cursor-glow.test.tsx`, `cursor-glow-layout.test.tsx` in real browsers): decorative, follows the mouse
 * once per frame, a mouse only, hidden when it leaves (even mid-reveal, a frame still pending), never catching a
 * click.
 */
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';

/**
 * A glow following the mouse behind the content: put once in the layout; decorative.
 *
 * @param props - A div's props.
 * @returns An `aria-hidden` element the stylesheet shows with a mouse, motion allowed (a theme may restrict it). It
 *   moves through its ref once per frame (no React state, no render per move); in a layout kept by client-side
 *   navigations, it stays put from page to page.
 *
 * @example
 * <CursorGlow /> // or let `Effects` load it on demand
 */
export function CursorGlow(props: ComponentProps<'div'>): ReactNode {
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = glow.current;

    if (element === null) return undefined;

    // One frame to place it, one to reveal it: a move during the reveal is never lost.
    let frame = 0;
    let reveal = 0;
    let x = 0;
    let y = 0;
    // Whether the mouse is over the page: a reveal still pending when it leaves never shows the glow.
    let inside = false;
    const place = (): void => {
      frame = 0;
      element.style.setProperty('--glow-x', `${String(x)}px`);
      element.style.setProperty('--glow-y', `${String(y)}px`);

      // Shown the frame after its first place, so that it never slides in from where it was hidden.
      if (!element.hasAttribute('data-visible') && reveal === 0)
        reveal = requestAnimationFrame(() => {
          reveal = 0;

          if (inside) element.setAttribute('data-visible', '');
        });
    };
    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;

      inside = true;
      x = event.clientX;
      y = event.clientY;

      if (frame === 0) frame = requestAnimationFrame(place);
    };
    // Gone at once, whatever is pending: a place or a reveal scheduled before the mouse left never brings it back.
    const onLeave = (): void => {
      inside = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(reveal);
      frame = 0;
      reveal = 0;
      element.removeAttribute('data-visible');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(reveal);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <div ref={glow} aria-hidden data-slot="cursor-glow" {...props} />;
}

'use client';

/**
 * The footer revealed from under the page: while it scrolls into view, the page slides up like a curtain and the
 * footer seems to wait at the bottom of the screen, underneath. A scroll-driven animation (`styles.css`), played
 * only where the page has the room for it.
 *
 *     [data-slot='reveal']          in the flow, as tall as its content; clips it; its view timeline `--fig-reveal`;
 *       │                           `data-revealing` once measured below the screen before any scroll
 *       └─ [data-slot='reveal-content']  translated up by the part of the slot still below the screen:
 *                                        `translate: 0 -100%` as the slot starts entering, `0` once it is in full,
 *                                        so its bottom stays on the screen's bottom while it is revealed
 *
 * Key design decisions:
 *     - A scroll-driven animation (`animation-timeline`), not a fixed footer under an opaque page: nothing measured
 *       frame by frame, and the page stays transparent, so what lies behind it (the cursor glow, the sparkles) still
 *       shows.
 *     - Only with the room for it: the slot must start below the screen before any scroll, or a page barely taller
 *       than the screen would show its footer half revealed from the start. One measure (the slot's place in the
 *       page against the screen's height), taken again when the page or the screen resizes; otherwise the footer
 *       stays in its place, with no effect. Rejected: forcing every page to be a screen tall, which makes a short page
 *       scroll for its footer.
 *     - Static until measured: the server's footer sits in its place, and the reveal starts once the browser has
 *       found the room, while the slot is still below the screen, so nothing moves.
 *     - Never the browser's scroll anchor (`overflow-anchor: none`): its content moves with the scroll, and a page
 *       changing above it (a list's next page) would otherwise be scrolled to keep it in place.
 *     - Above the page's docked panels (a sidebar, the table of contents) as it rises, below popups and dialogs
 *       (`--fig-reveal-layer`): the footer covers what stays docked, never the other way round.
 *     - Progressive: without scroll-driven animations, or with `prefers-reduced-motion`, the footer scrolls in as any
 *       content.
 *
 * Invariants (`reveal.test.tsx`; `reveal-layout.test.tsx`, in real browsers): revealed only when it starts below the
 * screen, in its place otherwise (a short page, a page scrolling less than its height); while revealed, the
 * content's bottom stays on the screen's bottom; once in full, it sits in its place; it comes above a docked panel;
 * never a scroll anchor (the example's `scripts/browse.ts`, on Next's real navigation).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Whether the slot starts below the screen before any scroll: room to reveal it. */
const hasRoom = (slot: HTMLElement): boolean => slot.getBoundingClientRect().top + window.scrollY >= window.innerHeight;

/**
 * Reveals what it holds (a footer) from under the page as it scrolls into view, where the page has the room.
 *
 * @param props - What it reveals: an opaque element, such as a footer with its background.
 * @returns The clipping slot and its sliding content; `data-revealing` on the slot while it has the room.
 *
 * @example
 * <Reveal><footer>figatellultimate · Made with <Hearts label="love" /></footer></Reveal>
 */
export function Reveal({ children }: { readonly children: ReactNode }): ReactNode {
  const slot = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const element = slot.current;

    if (element === null) return;

    const measure = (): void => {
      setRevealing(hasRoom(element));
    };

    measure();
    // The page grows or shrinks (a listing filtered, images loaded), or the screen does.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);

    observer?.observe(document.body);
    window.addEventListener('resize', measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div ref={slot} data-slot="reveal" {...(revealing ? { 'data-revealing': '' } : {})}>
      <div data-slot="reveal-content">{children}</div>
    </div>
  );
}

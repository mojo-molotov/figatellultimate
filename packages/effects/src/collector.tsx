'use client';

/**
 * A preview card lighting up under the mouse, styled by `styles.css`.
 *
 * Invariants (`collector.test.tsx`): the mouse's place in the card set once per frame, a mouse only.
 */
import { useRef, type PointerEvent, type ReactNode } from 'react';

/**
 * A preview (a post, a category, a documentation page) standing out while hovered, fully while its link is: its rim
 * lights up under the mouse and it takes a tint. The mouse's place in the card goes to `--collector-x` and
 * `--collector-y` through the ref, once per frame; `styles.css` draws the rest.
 *
 * @param props - The card it wraps.
 * @returns A `data-slot="collector"` box around the card.
 *
 * @example
 * <Collector><EntryCard href={post.url} title={post.title} … /></Collector>
 */
export function Collector({ children }: { readonly children: ReactNode }): ReactNode {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const follow = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse') return;

    const { clientX, clientY } = event;

    if (frame.current !== 0) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const element = box.current;

      if (element === null) return;

      const bounds = element.getBoundingClientRect();

      element.style.setProperty('--collector-x', `${String(clientX - bounds.left)}px`);
      element.style.setProperty('--collector-y', `${String(clientY - bounds.top)}px`);
    });
  };

  return (
    <div ref={box} data-slot="collector" onPointerMove={follow}>
      {children}
    </div>
  );
}

'use client';

/**
 * A region that scrolls on its own (a wide code block, a wide table), in the Tab order only while it overflows: the
 * keyboard reaches it then, to scroll it with the arrows (WCAG 2.1.1), and passes it by otherwise, Tab reserved for
 * what a reader acts on.
 *
 * Key design decisions, as chosen with the user:
 *     - Measured in the browser, again as it resizes: a code block or a table that fits takes no Tab stop, one wider
 *       than its column takes one. Rejected: always focusable (a stop before every copy button, every table), and
 *       never (a wide one could no longer be scrolled with the keyboard).
 *     - Prerendered without the stop: the common case, and the one a measure only adds to.
 *
 * Invariants (`scroll-region.test.tsx`, in real browsers): a region that fits takes no Tab stop; one that overflows
 * takes one, and loses it once it fits again.
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';

/**
 * Whether an element overflows its box, measured now and again as it resizes.
 *
 * @param ref - The scrolling element.
 * @returns `0` while it overflows (a Tab stop), `undefined` otherwise (none).
 *
 * @example
 * const pre = useRef<HTMLPreElement>(null);
 * return <pre ref={pre} tabIndex={useOverflowFocus(pre)}>…</pre>;
 */
export function useOverflowFocus(ref: RefObject<HTMLElement | null>): 0 | undefined {
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (element === null) return undefined;

    // A pixel aside: fractional sizes round either way.
    const measure = (): void => {
      setOverflows(element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);

    observer?.observe(element);

    return () => {
      observer?.disconnect();
    };
  }, [ref]);

  return overflows ? 0 : undefined;
}

/** A scroll region's props: a `div`'s, its Tab stop and its ref the region's own. */
export type ScrollRegionProps = Omit<ComponentProps<'div'>, 'tabIndex' | 'ref'>;

/**
 * A `div` that scrolls on its own, in the Tab order only while it overflows (`useOverflowFocus`), e.g. around a table.
 *
 * @param props - A `div`'s props, but its Tab stop and its ref.
 * @returns The region.
 *
 * @example
 * <ScrollRegion data-slot="mdx-table"><table>…</table></ScrollRegion>
 */
export function ScrollRegion(props: ScrollRegionProps): ReactNode {
  const region = useRef<HTMLDivElement>(null);

  return <div {...props} ref={region} tabIndex={useOverflowFocus(region)} />;
}

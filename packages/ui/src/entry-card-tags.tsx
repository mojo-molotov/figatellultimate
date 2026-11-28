'use client';

/**
 * A card's tags, on one row: the ones that fit whole, then a « +N » pill opening a popover of the others.
 *
 *     [data-slot='entry-card-tags']       one row, its overflow clipped; `data-measured` once measured
 *       ├─ [data-slot='entry-card-tag']   each tag; `data-hidden` past the room, moved after the pill and invisible
 *       └─ [data-slot='entry-card-tags-more']  the pill, a Radix Popover listing the hidden tags; invisible when none
 *
 * Key design decisions:
 *     - Measured in the browser (`fittingTags`, again as the row resizes): the tags that fit whole, never a tag cut.
 *       Rejected: a fixed count, which cuts a long tag and leaves room unused beside short ones.
 *     - Prerendered as every tag, the overflow faded out (the stylesheet), until measured: the row's height never
 *       changes, so nothing shifts once hydrated.
 *     - Hidden tags stay in the row, invisible and after the pill: their widths are still measured, and the pill
 *       follows the last tag shown.
 *     - A popover opened by a tap, a click or the keyboard, and on hover with a mouse (`MoreTags`), as chosen with the
 *       user: a mouse shows the hidden tags as it passes, a phone, which has no hover, on a tap. Rejected: a tooltip
 *       on a desktop beside the popover, two components for one list. Opened by hover, the list leaves the focus
 *       where it is, closes once the pointer has left the pill and the list, and a click pins it open.
 *
 * Invariants (`entry-card-tags.test.tsx`; `entry-card-layout.test.tsx`, in real browsers): whole tags only, the pill
 * within the room, as many as fit; every tag listed before any measure; the hidden ones in the popover, opened by a
 * mouse's hover (never a touch's), kept open by a click.
 */
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

/** A tag: a taxonomy term and its translated label. */
export interface EntryTag {
  readonly key: string;
  readonly label: string;
}

/**
 * How many tags fit whole: all of them when they fit alone, else as many as fit beside the pill.
 *
 * @param widths - Each tag's width, in order.
 * @param room - The row's width.
 * @param gap - The space between two items.
 * @param pill - The pill's width.
 * @returns The number of tags shown, from 0 (the pill alone) to all of them (no pill).
 */
export function fittingTags(widths: readonly number[], room: number, gap: number, pill: number): number {
  const width = (count: number): number =>
    widths.slice(0, count).reduce((sum, w) => sum + w, 0) + gap * Math.max(0, count - 1);

  if (width(widths.length) <= room) return widths.length;

  let shown = 0;

  while (shown < widths.length && width(shown + 1) + gap + pill <= room) shown += 1;

  return shown;
}

/**
 * A card's tags on one row, the overflow behind a « +N » pill. Internal to the package (`EntryCard`'s).
 *
 * @param props - The tags, the labels (the list's name, the pill's), and the locale (the pill's number).
 * @returns The list: every tag before it is measured; then the ones that fit, and the pill listing the others.
 */
export function EntryCardTags({
  tags,
  labels,
  locale,
}: {
  readonly tags: readonly EntryTag[];
  readonly labels: { readonly tags: string; readonly more: string };
  readonly locale: string;
}): ReactNode {
  const list = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const pill = useRef<HTMLLIElement>(null);
  const [shown, setShown] = useState<number | undefined>(undefined);

  useEffect(() => {
    const row = list.current;

    if (row === null) return undefined;

    const measure = (): void => {
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const widths = items.current.map((item) => item?.getBoundingClientRect().width ?? 0);

      setShown(fittingTags(widths, row.clientWidth, gap, pill.current?.getBoundingClientRect().width ?? 0));
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);

    observer?.observe(row);

    return () => {
      observer?.disconnect();
    };
  }, [tags.length]);

  const count = shown ?? tags.length;
  const hidden = tags.slice(count);
  // `+2`, the sign and digits the locale's: no text of the card's own.
  const plus = new Intl.NumberFormat(locale, { signDisplay: 'always' });

  return (
    <ul
      ref={list}
      data-slot="entry-card-tags"
      aria-label={labels.tags}
      {...(shown === undefined ? {} : { 'data-measured': '' })}
    >
      {tags.map((tag, index) => (
        <li
          key={tag.key}
          ref={(item) => {
            items.current[index] = item;
          }}
          data-slot="entry-card-tag"
          data-tag={tag.key}
          {...(index >= count ? { 'data-hidden': '' } : {})}
        >
          {tag.label}
        </li>
      ))}
      {/* Sized for every tag hidden at most, so that its width never grows once measured. */}
      <li ref={pill} data-slot="entry-card-tags-more" {...(hidden.length === 0 ? { 'data-hidden': '' } : {})}>
        {hidden.length === 0 ? (
          <span aria-hidden>{plus.format(tags.length)}</span>
        ) : (
          <MoreTags label={labels.more} count={plus.format(hidden.length)} tags={hidden} />
        )}
      </li>
    </ul>
  );
}

/** How long the pointer rests on the pill before the list opens, and leaves it before the list closes, in ms. */
const OPEN_DELAY = 150;
const CLOSE_DELAY = 250;

/**
 * The pill and its popover of the hidden tags: opened by a click, a tap or the keyboard, and on hover with a mouse.
 *
 * @param props - The pill's accessible name, its count (`+2`), and the hidden tags.
 * @returns The trigger and its popover.
 */
function MoreTags({
  label,
  count,
  tags,
}: {
  readonly label: string;
  readonly count: string;
  readonly tags: readonly EntryTag[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  // How it opened: a hover keeps the focus and closes as the pointer leaves; a press stays until dismissed.
  const via = useRef<'hover' | 'press'>('press');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (delay: number, action: () => void): void => {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  };

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // A mouse only: a touch fires pointer events too, and its tap already opens the popover.
  const enter = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;

    if (open) {
      clearTimeout(timer.current);

      return;
    }

    later(OPEN_DELAY, () => {
      via.current = 'hover';
      setOpen(true);
    });
  };
  const leave = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;

    if (!open) clearTimeout(timer.current);
    else if (via.current === 'hover')
      later(CLOSE_DELAY, () => {
        setOpen(false);
      });
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        clearTimeout(timer.current);

        if (next) via.current = 'press';

        setOpen(next);
      }}
    >
      <Popover.Trigger
        data-slot="entry-card-tags-more-trigger"
        aria-label={label}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onClick={(event) => {
          // Open by hover, a click pins the list rather than closing it.
          if (open && via.current === 'hover') {
            event.preventDefault();
            clearTimeout(timer.current);
            via.current = 'press';
          }
        }}
      >
        {count}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-slot="entry-card-tags-more-content"
          sideOffset={6}
          aria-label={label}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onOpenAutoFocus={(event) => {
            // A hover leaves the focus where it is: the reader was not asking for the list.
            if (via.current === 'hover') event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            if (via.current === 'hover') event.preventDefault();
          }}
        >
          <ul data-slot="entry-card-tags-more-list">
            {tags.map((tag) => (
              <li key={tag.key} data-slot="entry-card-tag" data-tag={tag.key}>
                {tag.label}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

'use client';

/**
 * The page select: a compact pagination, the list's pages as a Radix Select (a select-only combobox), for a place
 * with no room for every link (a toolbar, beside the filters). The full pagination (`Pagination`) stays the one with
 * real links.
 *
 * Key design decisions:
 *     - A select, not links: compact, one control whatever the count of pages; the full pagination keeps the links
 *       (shareable, opened in a new tab).
 *     - No text of its own: the trigger shows the labels' `current` (e.g. "3 / 10"), each option the page's
 *       number formatted for the locale.
 *     - Nothing for a single page, as the pagination.
 *
 * Invariants (`components.test.tsx`): axe open and closed; the current page shown; Enter opens on it, arrows and
 * Enter go to another, focus back to the trigger; Escape changes nothing; none for a single page; the locale's digits;
 * the current page read by its spoken text when given one; each page of the list named by its label when given one.
 */
import { Select, VisuallyHidden } from 'radix-ui';
import { useMemo, type ComponentProps, type ReactNode } from 'react';

import { useTapToClose } from './tap-to-close.js';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { numberFormat } from './context.js';

/** Every text of the page select: no default, no English. */
export interface PageSelectLabels {
  /** The select's accessible name, e.g. "Go to page". */
  readonly trigger: string;
  /** What the trigger shows, from the current page and the count of pages, e.g. "3 / 10". */
  readonly current: (page: number, pages: number) => string;
  /**
   * What a screen reader says of it, when the shown text reads badly aloud ("3 / 10", read "3 slash 10"), e.g.
   * "Page 3 of 10". Default: the shown text.
   */
  readonly spoken?: ((page: number, pages: number) => string) | undefined;
  /**
   * A page's name in the list, its number shown, e.g. "Page 3" (as the full pagination's `page`): a screen reader
   * says more than "3", the number in the name (WCAG 2.5.3). Default: the number.
   */
  readonly page?: ((page: number) => string) | undefined;
}

/** The page select's props: a Radix Select root's, plus the binding, the labels and the locale. */
export interface PageSelectProps extends Omit<
  ComponentProps<typeof Select.Root>,
  'children' | 'value' | 'defaultValue' | 'onValueChange'
> {
  readonly binding: FacetedCollectionBinding;
  readonly labels: PageSelectLabels;
  /** Formats the page numbers, e.g. the page's locale. */
  readonly locale: string;
}

/**
 * The list's pages as a Radix Select: a compact pagination.
 *
 * @param props - The binding, the labels, the locale (for page numbers) and the reading direction.
 * @returns The select, showing the current page; choosing one dispatches it. Nothing for a single page.
 *
 * @example
 * <PageSelect binding={binding} labels={{ trigger: 'Go to page', current: (p, n) => `${p} / ${n}` }} locale="en" />
 */
export function PageSelect({ binding, labels, locale, ...props }: PageSelectProps): ReactNode {
  const format = useMemo(() => numberFormat(locale), [locale]);
  const { trigger, closesOnTrigger, swallowsReopen } = useTapToClose();
  const { page } = binding.state;
  const { pages } = binding.view;

  if (pages <= 1) return null;

  return (
    <Select.Root
      value={String(page)}
      onValueChange={(value) => {
        binding.dispatch({ type: 'page', page: Number(value) });
      }}
      {...props}
    >
      <Select.Trigger
        ref={trigger}
        data-slot="page-select-trigger"
        aria-label={labels.trigger}
        onClick={swallowsReopen}
      >
        <Select.Value data-slot="page-select-value">
          {labels.spoken === undefined ? (
            labels.current(page, pages)
          ) : (
            <>
              <span aria-hidden>{labels.current(page, pages)}</span>
              <VisuallyHidden.Root>{labels.spoken(page, pages)}</VisuallyHidden.Root>
            </>
          )}
        </Select.Value>
        <Select.Icon asChild data-slot="page-select-icon">
          <span />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          data-slot="page-select-content"
          position="popper"
          sideOffset={4}
          onPointerDownOutside={closesOnTrigger}
        >
          <Select.Viewport data-slot="page-select-viewport">
            {Array.from({ length: pages }, (_, index) => (
              <Select.Item key={index} data-slot="page-select-item" value={String(index + 1)}>
                <Select.ItemText>
                  {labels.page === undefined ? (
                    format(index + 1)
                  ) : (
                    <>
                      <span aria-hidden>{format(index + 1)}</span>
                      <VisuallyHidden.Root>{labels.page(index + 1)}</VisuallyHidden.Root>
                    </>
                  )}
                </Select.ItemText>
                <Select.ItemIndicator data-slot="page-select-indicator" />
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

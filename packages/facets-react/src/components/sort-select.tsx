'use client';

/**
 * The sort select: the sort registry as a Radix Select (a select-only combobox), every name from the labels.
 *
 * Key design decision: the trigger shows the current sort's name from its first render, prerendered included
 * (`labels.sort`), never filled by Radix a render later: its width never changes as it mounts, and a toolbar that
 * wraps on a narrow screen never moves the page below it (the pagination keeps its place across a page change).
 *
 * Key design decision, as chosen with the user: a sort may have a spoken name (`labels.spoken`) apart from its display
 * name, shown short (`A → Z`) and read whole ("alphabetical order"), in the trigger and in its list alike.
 *
 * Invariants (`components.test.tsx`): axe open and closed; Enter opens on the current sort, arrows and Enter choose,
 * focus back to the trigger; Escape closes without changing the sort; the current sort's name in the first render;
 * each sort read by its spoken name, shown by its display name.
 */
import { Select, VisuallyHidden } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { createPartContext } from './context.js';

/** Every text of the sort select: no default, no English. */
export interface SortSelectLabels {
  /** The select's accessible name. */
  readonly trigger: string;
  /** A sort's display name, from its name in the registry. */
  readonly sort: (sort: string) => string;
  /**
   * A sort's spoken name, when its display name reads badly aloud (`A → Z`, read "A right arrow Z"): the screen
   * reader's, its display name the screen's. Default: the display name.
   */
  readonly spoken?: ((sort: string) => string) | undefined;
}

/** A sort's text: its display name shown, its spoken name read, when they differ. */
function SortText({ labels, sort }: { readonly labels: SortSelectLabels; readonly sort: string }): ReactNode {
  const shown = labels.sort(sort);
  const spoken = labels.spoken?.(sort) ?? shown;

  return spoken === shown ? (
    shown
  ) : (
    <>
      <span aria-hidden>{shown}</span>
      <VisuallyHidden.Root>{spoken}</VisuallyHidden.Root>
    </>
  );
}

interface SortSelectContext {
  readonly binding: FacetedCollectionBinding;
  readonly labels: SortSelectLabels;
}

const { context: Context, use } = createPartContext<SortSelectContext>('SortSelect');

/** The sort select's props: a Radix Select root's, plus the binding and the labels. */
export interface SortSelectProps extends Omit<
  ComponentProps<typeof Select.Root>,
  'children' | 'value' | 'defaultValue' | 'onValueChange'
> {
  readonly binding: FacetedCollectionBinding;
  readonly labels: SortSelectLabels;
  /** The parts; default: trigger, then content with one item per sort. */
  readonly children?: ReactNode;
}

/**
 * The sort registry as a Radix Select (a select-only combobox).
 *
 * @param props - The binding, the labels, the reading direction, and optionally the parts to compose instead of the
 *   default trigger and content.
 * @returns The select, showing the current sort; choosing one dispatches it.
 *
 * @example
 * <SortSelect binding={binding} labels={{ trigger: 'Sort posts', sort: (s) => t(`sort.${s}`) }} dir="ltr" />
 *
 * // composed:
 * <SortSelect binding={binding} labels={labels.sort}>
 *   <SortSelectTrigger><SortSelectIcon /></SortSelectTrigger>
 *   <SortSelectContent><SortSelectItem value="newest">Newest first</SortSelectItem></SortSelectContent>
 * </SortSelect>
 */
export function SortSelect({ binding, labels, children, ...props }: SortSelectProps): ReactNode {
  return (
    <Context value={{ binding, labels }}>
      <Select.Root
        value={binding.state.sort}
        onValueChange={(sort) => {
          binding.dispatch({ type: 'sort', sort });
        }}
        {...props}
      >
        {children ?? (
          <>
            <SortSelectTrigger />
            <SortSelectContent />
          </>
        )}
      </Select.Root>
    </Context>
  );
}

/**
 * The select's trigger: the current sort's name, then its icon.
 *
 * @param props - The Radix trigger's props; `children` replace the value and icon.
 * @returns The combobox, named by the labels' `trigger`.
 */
export function SortSelectTrigger({ children, ...props }: ComponentProps<typeof Select.Trigger>): ReactNode {
  const { binding, labels } = use('SortSelectTrigger');

  return (
    <Select.Trigger data-slot="sort-select-trigger" aria-label={labels.trigger} {...props}>
      {children ?? (
        <>
          {/* Its text given, not left to Radix, which fills it a render later: the trigger has its width from the
              first render (the prerendered page's included), and the toolbar never rewraps under the pagination. */}
          <Select.Value data-slot="sort-select-value">
            <SortText labels={labels} sort={binding.state.sort} />
          </Select.Value>
          <SortSelectIcon />
        </>
      )}
    </Select.Trigger>
  );
}

/**
 * An empty element for the app's chevron, hidden from assistive technologies (Radix's default is a "▼").
 *
 * @param props - The Radix icon's props.
 * @returns The icon.
 */
export function SortSelectIcon({ children, ...props }: ComponentProps<typeof Select.Icon>): ReactNode {
  return (
    <Select.Icon asChild data-slot="sort-select-icon" {...props}>
      {children ?? <span />}
    </Select.Icon>
  );
}

/**
 * The select's popup.
 *
 * @param props - The Radix content's props; `children` replace the default item per sort.
 * @returns The listbox, in a portal.
 */
export function SortSelectContent({ children, ...props }: ComponentProps<typeof Select.Content>): ReactNode {
  const { binding } = use('SortSelectContent');

  return (
    <Select.Portal>
      <Select.Content data-slot="sort-select-content" {...props}>
        <Select.Viewport data-slot="sort-select-viewport">
          {children ?? binding.sorts.map((sort) => <SortSelectItem key={sort} value={sort} />)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  );
}

/**
 * One sort.
 *
 * @param props - The Radix item's props; `children` replace the sort's name.
 * @returns The option, with its indicator while it is the current sort.
 */
export function SortSelectItem({ children, value, ...props }: ComponentProps<typeof Select.Item>): ReactNode {
  const { labels } = use('SortSelectItem');

  return (
    <Select.Item data-slot="sort-select-item" value={value} {...props}>
      <Select.ItemText>{children ?? <SortText labels={labels} sort={value} />}</Select.ItemText>
      <Select.ItemIndicator data-slot="sort-select-indicator" />
    </Select.Item>
  );
}

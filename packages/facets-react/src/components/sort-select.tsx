'use client';

/**
 * The sort select: the sort registry as a Radix Select (a select-only combobox), every name from the labels.
 *
 * Invariants (`components.test.tsx`): axe open and closed; Enter opens on the current sort, arrows and Enter choose,
 * focus back to the trigger; Escape closes without changing the sort.
 */
import { Select } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { createPartContext } from './context.js';

/** Every text of the sort select: no default, no English. */
export interface SortSelectLabels {
  /** The select's accessible name. */
  readonly trigger: string;
  /** A sort's display name, from its name in the registry. */
  readonly sort: (sort: string) => string;
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
  const { labels } = use('SortSelectTrigger');

  return (
    <Select.Trigger data-slot="sort-select-trigger" aria-label={labels.trigger} {...props}>
      {children ?? (
        <>
          <Select.Value data-slot="sort-select-value" />
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
      <Select.ItemText>{children ?? labels.sort(value)}</Select.ItemText>
      <Select.ItemIndicator data-slot="sort-select-indicator" />
    </Select.Item>
  );
}

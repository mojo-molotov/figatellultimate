'use client';

/**
 * A listing's options behind one button: the facets and the sort in a panel, opened by a gear, so that a toolbar
 * keeps one line whatever the screen and the sort's name, its compact pagination beside the gear.
 *
 *     [data-slot='listing-options-trigger']   the button: the app's icon, then the count of selected terms
 *       ├─ [data-slot='listing-options-icon']   the app's icon (`icon`), hidden from assistive technologies
 *       └─ [data-slot='listing-options-count']  how many terms are selected, in the locale's digits; absent at 0
 *     [data-slot='listing-options-content']   the panel, a Radix Popover holding the app's widgets (`children`)
 *
 * Key design decisions, as chosen with the user:
 *     - On every screen: one toolbar, never wrapping, rather than a row on a desktop and a gear on a phone (two
 *       instances of every widget).
 *     - The panel holds the widgets as they are (`FacetOptions`, `SortSelect`, `FacetsReset`): each opens its own list
 *       over the panel, a nested layer that never closes it. Rejected: lists unfolded in the panel, new components
 *       for the same choices.
 *     - The count of selected terms on the gear, its name saying it too (`labels.trigger`): the filters hidden, the
 *       reader still sees some are on.
 *     - No icon and no text of its own: the app gives the gear (`icon`) and every text.
 *
 * Invariants (`components.test.tsx`): axe closed and open; the count of selected terms, absent without any, in the
 * name; a widget's list opened inside never closes the panel; Escape closes it, focus back on the gear; no text of its
 * own.
 */
import { Direction, Popover } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { numberFormat } from './context.js';

/** Every text of the listing's options: no default, no English. */
export interface ListingOptionsLabels {
  /** The gear's accessible name, from the count of selected terms, e.g. "List options, 2 filters on". */
  readonly trigger: (selected: number) => string;
  /** The panel's accessible name. */
  readonly content: string;
}

/** The listing options' props: a Radix Popover root's, plus the binding, the labels, the locale and the icon. */
export interface ListingOptionsProps extends Omit<ComponentProps<typeof Popover.Root>, 'children'> {
  readonly binding: FacetedCollectionBinding;
  readonly labels: ListingOptionsLabels;
  /** The count's digits: some locales do not use Latin ones. */
  readonly locale: string;
  /** The gear, the app's (e.g. Heroicons' `Cog6ToothIcon`): the library draws none. */
  readonly icon?: ReactNode;
  /** The reading direction, for the widgets' arrow keys. */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /** The widgets the panel holds: the facets, the sort, the reset. */
  readonly children: ReactNode;
}

/**
 * The facets and the sort behind a gear: a button showing how many terms are selected, opening a panel of the widgets.
 *
 * @param props - The binding, the labels, the locale, the app's icon, the reading direction, and the widgets.
 * @returns The gear and its panel; the widgets inside keep their own lists, opened over the panel.
 *
 * @example
 * <ListingOptions binding={binding} labels={labels.options} locale="fr" icon={<Cog6ToothIcon />}>
 *   <FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr" />
 *   <SortSelect binding={binding} labels={labels.sort} />
 * </ListingOptions>
 */
export function ListingOptions({
  binding,
  labels,
  locale,
  icon,
  dir,
  children,
  ...props
}: ListingOptionsProps): ReactNode {
  const selected = Object.values(binding.state.facets).reduce((sum, values) => sum + values.length, 0);
  const panel = (
    <Popover.Root {...props}>
      <Popover.Trigger data-slot="listing-options-trigger" aria-label={labels.trigger(selected)}>
        {icon === undefined ? null : (
          <span data-slot="listing-options-icon" aria-hidden>
            {icon}
          </span>
        )}
        {selected === 0 ? null : (
          <span data-slot="listing-options-count" aria-hidden>
            {numberFormat(locale)(selected)}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-slot="listing-options-content" aria-label={labels.content} align="start" sideOffset={4}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  return dir === undefined ? panel : <Direction.Provider dir={dir}>{panel}</Direction.Provider>;
}

'use client';

/**
 * A listing's filters behind one button: the facets in a panel, opened by a gear, so that a listing's controls keep
 * one line whatever the screen.
 *
 *     [data-slot='listing-options-trigger']   the button: the app's icon, then the count of selected terms
 *       ├─ [data-slot='listing-options-icon']   the app's icon (`icon`), hidden from assistive technologies
 *       └─ [data-slot='listing-options-count']  how many terms are selected, in the locale's digits; absent at 0
 *     [data-slot='listing-options-content']   the panel, a Radix Popover holding the app's widgets (`children`)
 *
 * Key design decisions:
 *     - On every screen: one toolbar, never wrapping, rather than a row on a desktop and a gear on a phone (two
 *       instances of every widget).
 *     - The panel holds the widgets as they are (`FacetOptions`, `FacetsReset`): each opens its own list over the
 *       panel, a nested layer that never closes it. Rejected: lists unfolded in the panel, new components for the
 *       same choices. The sort stays beside the gear, the app's to place: what the list shows, always in view.
 *     - ↑ ↓ (Home, End) move from a widget to the next, as in a menu, wrapping around; a key inside a widget's own
 *       list (its filter, its options) stays the widget's.
 *     - The count of selected terms on the gear, its name saying it too (`labels.trigger`): the filters hidden, the
 *       reader still sees some are on.
 *     - No icon and no text of its own: the app gives the gear (`icon`) and every text.
 *     - A gear from two facets on: a single one is shown in place of the gear (a panel holding
 *       one list is a click for nothing); its own list's "clear" stands for the reset, left out. The facets are its
 *       `FacetOptions` children: one wrapped in an app's component is not counted, the gear kept.
 *
 * Invariants (`components.test.tsx`): axe closed and open; a single facet in place of the gear, without the reset; the
 * count of selected terms, absent without any, in the name; a widget's list opened inside never closes the panel; ↑ ↓
 * Home End between its widgets, a widget's own keys left to it; Escape closes it, focus back on the gear; no text of
 * its own.
 */
import { Direction, Popover } from 'radix-ui';
import { Children, isValidElement, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { numberFormat } from './context.js';
import { FacetOptions } from './facet-options.js';

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
  /** The widgets the panel holds: the facets and their reset. */
  readonly children: ReactNode;
}

/**
 * The facets behind a gear: a button showing how many terms are selected, opening a panel of the widgets.
 *
 * @param props - The binding, the labels, the locale, the app's icon, the reading direction, and the widgets.
 * @returns The gear and its panel; the widgets inside keep their own lists, opened over the panel.
 *
 * @example
 * <ListingOptions binding={binding} labels={labels.options} locale="fr" icon={<Cog6ToothIcon />}>
 *   <FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr" />
 *   <FacetsReset binding={binding} labels={labels.reset} />
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
  const content = useRef<HTMLDivElement>(null);
  const facets = Children.toArray(children).filter((child) => isValidElement(child) && child.type === FacetOptions);
  // ↑ ↓ (Home, End) move from a widget to the next, as in a menu, wrapping around; a key in a widget's own list
  // (its filter, its options), which bubbles here through React's tree, is the widget's.
  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const panel = content.current;
    const steps: Readonly<Record<string, (index: number, count: number) => number>> = {
      ArrowDown: (index, count) => (index + 1) % count,
      ArrowUp: (index, count) => (index - 1 + count) % count,
      Home: () => 0,
      End: (_, count) => count - 1,
    };
    const step = steps[event.key];

    if (panel === null || step === undefined || !(event.target instanceof HTMLElement)) return;

    if (event.target.parentElement !== panel) return;

    const items = [...panel.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.tabIndex >= 0 && !child.hidden,
    );
    const index = items.indexOf(event.target);

    if (index === -1) return;

    event.preventDefault();
    items[step(index, items.length)]?.focus();
  };
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
        <Popover.Content
          ref={content}
          data-slot="listing-options-content"
          aria-label={labels.content}
          align="end"
          sideOffset={4}
          onKeyDown={move}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  // A single facet: nothing to group, shown in place of the gear; its own list clears it, no reset needed.
  if (facets.length === 1) return facets[0];

  return dir === undefined ? panel : <Direction.Provider dir={dir}>{panel}</Direction.Provider>;
}

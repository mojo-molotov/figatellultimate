'use client';

/**
 * The facet options' parts that hold the cmdk list: the content, the filter, the terms and "clear". Their own module
 * (and chunk), loaded when the popover opens: a listing page ships the trigger alone until the reader filters.
 *
 * Key design decisions:
 *     - No term active on opening, as chosen with the user. cmdk makes the first one active as its list mounts,
 *       highlighted without the field telling it (no `aria-activedescendant`): a screen reader said nothing of it,
 *       and Enter toggled a term never heard. Its value is held here, from one no term has (`NONE`): ↓, typing (the
 *       first match) or the pointer make a term active, told to assistive technologies.
 *     - "clear" is the list's last option, never a sibling of the list: cmdk's arrows, Home and End move only through
 *       the options inside its list, so a "clear" beside it was out of the keyboard's reach.
 *
 * Invariants (`components.test.tsx`, in happy-dom and in real browsers): axe, keyboard (Enter opens and focuses the
 * filter, none active, arrows move, Enter toggles, "clear" reached by the arrows, Escape closes back to the trigger),
 * no text of its own, slots and props.
 */
import { Command } from 'cmdk';
import { Popover, VisuallyHidden } from 'radix-ui';
import { useState, type ComponentProps, type ReactNode } from 'react';

import { selectedOf, useFacetOptions as use } from './facet-options-context.js';

/** No term's value (term keys never start with a control character): no term active. */
const NONE = '\u0000none';

/**
 * The popover's content: a cmdk list, the filter field first.
 *
 * @param props - The Radix content's props; `children` replace the default filter and list (its terms, then "clear").
 * @returns The content, labelled by the trigger; no term active until ↓, typing or the pointer makes one.
 *
 * @example
 * <FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr">
 *   <FacetOptionsTrigger />
 *   <FacetOptionsContent>
 *     <FacetOptionsInput />
 *     <FacetOptionsList>
 *       <FacetOptionsItem term="guide" count={4}><FacetOptionsIndicator /> Guide</FacetOptionsItem>
 *       <FacetOptionsClear />
 *     </FacetOptionsList>
 *   </FacetOptionsContent>
 * </FacetOptions>
 */
export function FacetOptionsContent({ children, ...props }: ComponentProps<typeof Popover.Content>): ReactNode {
  const context = use('FacetOptionsContent');
  // Unmounted with the popover: none active again on each opening.
  const [active, setActive] = useState(NONE);

  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        aria-labelledby={context.triggerId}
        data-slot="facet-options-content"
        data-facet={context.facet}
        {...props}
      >
        {/* cmdk names the filter field by the command's label, and the list by its own (default: English). */}
        <Command
          label={context.labels.filter}
          value={active}
          onValueChange={setActive}
          data-slot="facet-options-command"
        >
          {children ?? (
            <>
              <FacetOptionsInput />
              <FacetOptionsList />
            </>
          )}
        </Command>
      </Popover.Content>
    </Popover.Portal>
  );
}

/**
 * The filter field: narrows the terms by their display name, arrows move through them.
 *
 * @param props - cmdk's input props.
 * @returns The field, its placeholder and accessible name from the labels.
 */
export function FacetOptionsInput(props: ComponentProps<typeof Command.Input>): ReactNode {
  const { labels } = use('FacetOptionsInput');

  return (
    <Command.Input data-slot="facet-options-input" placeholder={labels.filter} aria-label={labels.filter} {...props} />
  );
}

/** The list's props: cmdk's, its terms rendered by default. */
export interface FacetOptionsListProps extends ComponentProps<typeof Command.List> {
  /** Custom items; default: one `FacetOptionsItem` per term of the view, with its count. */
  readonly children?: ReactNode;
}

/**
 * The terms, each with its count, then "clear" while something is selected.
 *
 * @param props - cmdk's list props; `children` replace the default items and "clear".
 * @returns The listbox, named by the labels; the empty label when no term matches.
 */
export function FacetOptionsList({ children, ...props }: FacetOptionsListProps): ReactNode {
  const context = use('FacetOptionsList');
  const counts = context.binding.view.counts[context.facet] ?? {};

  return (
    <Command.List data-slot="facet-options-list" label={context.labels.list} {...props}>
      <Command.Empty data-slot="facet-options-empty">{context.labels.empty}</Command.Empty>
      {children ?? (
        <>
          {Object.entries(counts).map(([term, count]) => (
            <FacetOptionsItem key={term} term={term} count={count} />
          ))}
          <FacetOptionsClear />
        </>
      )}
    </Command.List>
  );
}

/** One term's props: cmdk's item's, plus the term and its count. */
export interface FacetOptionsItemProps extends Omit<ComponentProps<typeof Command.Item>, 'value' | 'onSelect'> {
  readonly term: string;
  readonly count: number;
}

/**
 * One term, toggled with Enter or a click; the list stays open (multiple selection).
 *
 * @param props - The term, its count, and cmdk's item props; `children` replace the default indicator, name and count.
 * @returns An option, `aria-selected` while active, `data-state="checked"` while selected.
 */
export function FacetOptionsItem({ term, count, children, ...props }: FacetOptionsItemProps): ReactNode {
  const context = use('FacetOptionsItem');
  const selected = selectedOf(context).includes(term);
  const name = context.labels.term(term);
  const state = selected ? 'checked' : 'unchecked';

  return (
    <Command.Item
      // The key identifies the item; the display name is what the filter matches.
      value={term}
      keywords={[name]}
      onSelect={() => {
        context.binding.dispatch({ type: 'toggle', facet: context.facet, value: term });
      }}
      // The accessible name is the visible text, term and count (WCAG 2.5.3), then the count's unit, heard only; the
      // state is aria-checked.
      aria-checked={selected}
      data-slot="facet-options-item"
      data-state={state}
      data-count={count}
      {...props}
    >
      {children ?? (
        <>
          <FacetOptionsIndicator data-state={state} />
          <span data-slot="facet-options-term">{name}</span>{' '}
          <span data-slot="facet-options-count">
            {context.format(count)}
            {context.labels.unit === undefined ? null : (
              <VisuallyHidden.Root> {context.labels.unit(count)}</VisuallyHidden.Root>
            )}
          </span>
        </>
      )}
    </Command.Item>
  );
}

/**
 * An empty element for the app's check mark, hidden from assistive technologies.
 *
 * @param props - A span's props.
 * @returns The span, styled from its `data-state`.
 */
export function FacetOptionsIndicator(props: ComponentProps<'span'>): ReactNode {
  return <span data-slot="facet-options-indicator" aria-hidden {...props} />;
}

/**
 * Clears the facet's selection. Its place is in the list, after the terms: cmdk's arrows reach only the list's
 * options.
 *
 * @param props - cmdk's item props; `children` replace the label.
 * @returns An option rendered only while something is selected, whatever the filter.
 */
export function FacetOptionsClear({
  children,
  ...props
}: Omit<ComponentProps<typeof Command.Item>, 'value' | 'onSelect'>): ReactNode {
  const context = use('FacetOptionsClear');

  if (selectedOf(context).length === 0) return null;

  return (
    <Command.Item
      // Not a term key: term keys never start with a control character.
      value={'\u0000clear'}
      forceMount
      onSelect={() => {
        context.binding.dispatch({ type: 'clear', facet: context.facet });
      }}
      data-slot="facet-options-clear"
      {...props}
    >
      {children ?? context.labels.clear}
    </Command.Item>
  );
}

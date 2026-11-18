'use client';

/**
 * The reset button: every facet cleared at once, the sort kept.
 *
 * Key design decision: rendered only while something is selected; its click hands focus to the control before it,
 * so that keyboard focus is never lost when it disappears.
 *
 * Invariants (`components.test.tsx`): hidden without a selection, clears every facet and keeps the sort, focus handed
 * back, Enter and Space, no text of its own.
 */
import type { ComponentProps, ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';

/** Every text of the reset button: no default, no English. */
export interface FacetsResetLabels {
  /** The button's text, e.g. "Reset filters". */
  readonly reset: string;
}

/** The reset's props: a button's, plus the binding and the labels. */
export interface FacetsResetProps extends Omit<ComponentProps<'button'>, 'onClick' | 'disabled' | 'type'> {
  readonly binding: FacetedCollectionBinding;
  readonly labels: FacetsResetLabels;
}

/** The nearest focusable element before this one among its siblings: where focus goes once the button is gone. */
function focusableBefore(element: Element): HTMLElement | null {
  for (let sibling = element.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
    if (sibling instanceof HTMLElement && sibling.tabIndex >= 0 && !sibling.hidden) return sibling;
  }

  return null;
}

/**
 * Clears every facet's selection at once: the sort is kept, the reading position before the first selection
 * restored.
 *
 * @param props - The binding, the labels, and a button's props; `children` replace the label.
 * @returns A button rendered only while something is selected; since it then disappears, its click hands focus to
 *   the focusable control placed before it (e.g. the sort select), so that focus is never lost.
 *
 * @example
 * <FacetsReset binding={binding} labels={{ reset: 'Reset filters' }} />
 */
export function FacetsReset({ binding, labels, children, ...props }: FacetsResetProps): ReactNode {
  const selected = Object.values(binding.state.facets).some((values) => values.length > 0);

  if (!selected) return null;

  return (
    <button
      type="button"
      data-slot="facets-reset"
      onClick={(event) => {
        const next = focusableBefore(event.currentTarget);

        binding.dispatch({ type: 'clear' });
        next?.focus();
      }}
      {...props}
    >
      {children ?? labels.reset}
    </button>
  );
}

'use client';

/**
 * Facet options: a facet's terms with their counts, in a Radix Popover holding a filterable cmdk list.
 *
 * Key design decisions:
 *     - A popover with a filterable list: it scales to long taxonomies; cmdk gives the
 *       combobox and listbox pattern (Radix has none).
 *     - Multiple selection: a term toggles, the list stays open.
 *     - shadcn-like anatomy: a root providing the binding and labels through context, composable parts each with a
 *       `data-slot`, its props and `className` forwarded; no style, no text of its own (every label required).
 *     - Counts formatted for the locale.
 *     - The default list (cmdk and the parts, `facet-options-parts.tsx`) is a chunk of its own, loaded when the
 *       popover opens and fetched ahead as soon as the pointer or the focus reaches the trigger (a dynamic
 *       `import()`, no framework); composed parts are the app's own imports.
 *
 * Invariants (`components.test.tsx`, in happy-dom and in real browsers): axe, keyboard (Enter opens and focuses the
 * filter, arrows move, Enter toggles, Escape closes back to the trigger), no text of its own, slots and props.
 */
import { Direction, Popover } from 'radix-ui';
import { useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { numberFormat } from './context.js';
import {
  FacetOptionsContextValue as Context,
  selectedOf,
  useFacetOptions as use,
  type FacetOptionsLabels,
} from './facet-options-context.js';
import type * as Parts from './facet-options-parts.js';

export type { FacetOptionsLabels } from './facet-options-context.js';

type PartsModule = typeof Parts;

/** The parts' module once loaded, shared by every facet of the page. */
let loaded: PartsModule | undefined;

async function loadParts(): Promise<PartsModule> {
  loaded ??= await import('./facet-options-parts.js');

  return loaded;
}

const preload = (): void => {
  void loadParts();
};

/** The default content: the parts' module, fetched when the popover opens unless the trigger already did. */
function DefaultContent({ open }: { readonly open: boolean }): ReactNode {
  const [parts, setParts] = useState<PartsModule | undefined>(loaded);

  useEffect(() => {
    if (!open || parts !== undefined) return;

    let live = true;

    void loadParts().then((module) => {
      if (live) setParts(module);
    });

    return () => {
      live = false;
    };
  }, [open, parts]);

  return parts === undefined ? null : <parts.FacetOptionsContent />;
}

/** The facet options' props: a Radix Popover root's, plus the binding, the facet, the labels and the locale. */
export interface FacetOptionsProps extends Omit<ComponentProps<typeof Popover.Root>, 'children'> {
  readonly binding: FacetedCollectionBinding;
  /** The facet's name in the engine (e.g. `tags`). */
  readonly facet: string;
  readonly labels: FacetOptionsLabels;
  /** Formats the counts, e.g. the page's locale. */
  readonly locale: string;
  /** Reading direction of the arrow keys (e.g. the locale's). */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /** The parts; default: trigger, then content with the filter, the list and "clear". */
  readonly children?: ReactNode;
}

/**
 * A facet's terms with their counts, in a popover holding a filterable list.
 *
 * @param props - The binding, the facet's name, the labels, the locale (for counts), the reading direction, and
 *   optionally the parts to compose instead of the default (trigger, then content with the filter, the list and
 *   "clear").
 * @returns The popover; its trigger shows how many terms are selected.
 *
 * @example
 * <FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr" dir="ltr" />
 * // composed:
 * <FacetOptions binding={binding} facet="tags" labels={labels.tags} locale="fr">
 *   <FacetOptionsTrigger className="pill" />
 *   <FacetOptionsContent>
 *     <FacetOptionsInput />
 *     <FacetOptionsList>
 *       <FacetOptionsItem term="guide" count={4}><FacetOptionsIndicator /> Guide</FacetOptionsItem>
 *       <FacetOptionsClear />
 *     </FacetOptionsList>
 *   </FacetOptionsContent>
 * </FacetOptions>
 */
export function FacetOptions({
  binding,
  facet,
  labels,
  locale,
  dir,
  children,
  ...props
}: FacetOptionsProps): ReactNode {
  const triggerId = useId();
  const format = useMemo(() => numberFormat(locale), [locale]);
  const [uncontrolled, setUncontrolled] = useState(props.defaultOpen ?? false);
  const open = props.open ?? uncontrolled;
  const root = (
    <Context value={{ binding, facet, labels, triggerId, format }}>
      <Popover.Root
        {...props}
        onOpenChange={(next) => {
          setUncontrolled(next);
          props.onOpenChange?.(next);
        }}
      >
        {children ?? (
          <>
            <FacetOptionsTrigger />
            <DefaultContent open={open} />
          </>
        )}
      </Popover.Root>
    </Context>
  );

  return dir === undefined ? root : <Direction.Provider dir={dir}>{root}</Direction.Provider>;
}

/**
 * The popover's trigger, named by the number of selected terms.
 *
 * @param props - The Radix trigger's props; `children` replace the default text.
 * @returns A button carrying `data-slot="facet-options-trigger"` and `data-count`.
 */
export function FacetOptionsTrigger({ children, ...props }: ComponentProps<typeof Popover.Trigger>): ReactNode {
  const context = use('FacetOptionsTrigger');
  const selected = selectedOf(context).length;

  return (
    <Popover.Trigger
      id={context.triggerId}
      onPointerEnter={preload}
      onFocus={preload}
      data-slot="facet-options-trigger"
      data-facet={context.facet}
      data-count={selected}
      {...props}
    >
      {children ?? context.labels.trigger(selected)}
    </Popover.Trigger>
  );
}

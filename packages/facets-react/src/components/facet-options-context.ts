/**
 * What the facet options' parts share: the labels, the root's context, and the selected terms. Its own module, so
 * that the root and the parts loaded on demand (`facet-options-parts.tsx`) both read it.
 */
import type { Context } from 'react';

import type { FacetedCollectionBinding } from '../use-faceted-collection.js';
import { createPartContext } from './context.js';

/** Every text of the facet options, visible or for assistive technologies: no default, no English. */
export interface FacetOptionsLabels {
  /** The trigger's text and accessible name, from the number of selected terms. */
  readonly trigger: (selected: number) => string;
  /** The filter field's placeholder and accessible name. */
  readonly filter: string;
  /** The list of terms' accessible name. */
  readonly list: string;
  /** Shown when no term matches the filter. */
  readonly empty: string;
  /** A term's display name (e.g. its translation under `taxonomies.<taxonomy>.<term>`). */
  readonly term: (term: string) => string;
  /**
   * What a term's count counts, read after it and hidden from sight, e.g. "posts" (`Harp 17` heard "Harp, 17 posts"):
   * the shown text stays in the option's name (WCAG 2.5.3). None: the count alone.
   */
  readonly unit?: ((count: number) => string) | undefined;
  /** The "clear the selection" option. */
  readonly clear: string;
}

/** What the root provides to its parts. */
export interface FacetOptionsContext {
  readonly binding: FacetedCollectionBinding;
  readonly facet: string;
  readonly labels: FacetOptionsLabels;
  readonly triggerId: string;
  readonly format: (value: number) => string;
}

const parts = createPartContext<FacetOptionsContext>('FacetOptions');

/** The root's context. */
export const FacetOptionsContextValue: Context<FacetOptionsContext | null> = parts.context;

/** Reads the root's context from a part; throws for a part rendered outside its root. */
export const useFacetOptions: (part: string) => FacetOptionsContext = parts.use;

/**
 * The facet's selected terms.
 *
 * @param context - The root's context.
 * @returns The selected terms, none by default.
 */
export const selectedOf = ({ binding, facet }: FacetOptionsContext): readonly string[] =>
  binding.state.facets[facet] ?? [];

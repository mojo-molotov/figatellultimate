/**
 * The React layer of faceted collections: the binding (`useFacetedCollection`), the History API URL adapter, and
 * unstyled, accessible components on Radix UI and cmdk (facet options, sort select, pagination, page select, reset).
 *
 * Layers: `@figatellultimate/facets` (pure engine) ──> a URL adapter ──> the binding (`usePagedCollection` when
 * paginated in its path, its index loaded on demand) ──> these components; styles come from the app or
 * `@figatellultimate/ui/styles.css`, through each part's `data-slot`.
 */

export * from './components/facet-options.js';
export * from './components/facet-options-parts.js';
export * from './components/facets-reset.js';
export * from './components/listing-options.js';
export * from './components/page-select.js';
export * from './components/pagination.js';
export * from './components/sort-select.js';
export * from './use-faceted-collection.js';
export * from './use-paged-collection.js';

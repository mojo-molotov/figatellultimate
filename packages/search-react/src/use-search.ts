'use client';

/**
 * The React binding of the headless search: rendering stays the app's, or the search box's.
 *
 * Invariants (`hook.test.ts`): idle without a term; preload then search; a late answer never replaces a newer one;
 * results kept while searching; `more()` appends; options alone search at once.
 */
import type { QueryOptions, Search, SearchPage, SearchResult } from '@figatellu/search';
import { useCallback, useEffect, useRef, useState } from 'react';

/** What the binding is doing: idle without a term, then searching, done, or why not. */
export type SearchBindingStatus = 'idle' | 'too-short' | 'searching' | 'done' | 'unavailable';

/** What the hook gives a search UI. */
export interface SearchBinding<C extends string> {
  readonly status: SearchBindingStatus;
  /** The results loaded so far; kept while a newer query searches, so the list does not flicker. */
  readonly results: readonly SearchResult<C>[];
  readonly total: number;
  /** Loads the next batch ("see more"); `undefined` when every result is shown. */
  readonly more: (() => void) | undefined;
}

/** The latest answer, and the query it answers: a different current query means "searching". */
interface Answer<C extends string> {
  readonly search: Search<C>;
  readonly key: string;
  readonly page: SearchPage<C>;
}

/**
 * The React binding of a headless search.
 *
 * @param search - The search (`createSearch`).
 * @param term - What the reader typed.
 * @param options - The collections and the sort; a change of options alone searches at once.
 * @returns The status, the results loaded so far (kept while a newer query searches, so the list never flickers),
 *   the total and `more`. Superseded answers are ignored; the term is preloaded.
 *
 * @example
 * const { status, results, more } = useSearch(search, term, { sort: 'date-desc' });
 */
export function useSearch<C extends string>(
  search: Search<C>,
  term: string,
  options: QueryOptions<C> = {},
): SearchBinding<C> {
  const [answer, setAnswer] = useState<Answer<C> | undefined>(undefined);
  // The latest query: an answer to any older one is ignored (the client may also answer it with null).
  const latest = useRef(0);
  const trimmed = term.trim();
  // A stable identity for the list: a new but equal array does not search again (state adjusted while rendering).
  const requested = options.collections ?? [];
  const [list, setList] = useState(requested);
  const collections = requested.join('\u0000');

  if (list.join('\u0000') !== collections) setList(requested);

  const sort = options.sort ?? 'relevance';
  const key = `${trimmed}\u0001${collections}\u0001${sort}`;

  // The term of the previous query: when it did not change (a new sort or filter), search at once.
  const previous = useRef<string | undefined>(undefined);

  useEffect(() => {
    const current = ++latest.current;
    const immediate = previous.current === trimmed;

    previous.current = trimmed;

    if (trimmed === '') return;

    void search.preload(trimmed, { collections: list });
    void search.query(trimmed, { collections: list, sort, ...(immediate ? { immediate } : {}) }).then((page) => {
      if (page !== null && current === latest.current) setAnswer({ search, key, page });
    });
  }, [search, trimmed, list, sort, key]);

  // Derived, never stored: idle without a term, searching until the current query is answered.
  const answered = answer !== undefined && answer.search === search && answer.key === key;
  const status: SearchBindingStatus = trimmed === '' ? 'idle' : answered ? answer.page.status : 'searching';
  const page = trimmed === '' ? undefined : answer?.page;

  const loadMore = answered ? answer.page.more : undefined;
  const more = useCallback(() => {
    if (loadMore === undefined) return;

    const current = latest.current;

    void loadMore().then((next) => {
      if (current === latest.current) setAnswer({ search, key, page: next });
    });
  }, [loadMore, search, key]);

  return {
    status,
    results: page?.results ?? [],
    total: page?.total ?? 0,
    more: status === 'done' && loadMore !== undefined ? more : undefined,
  };
}

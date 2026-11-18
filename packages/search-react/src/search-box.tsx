'use client';

/**
 * The search box: a combobox over the headless client, its results a listbox (cmdk), with an optional collection
 * filter, a sort select inside the field, a spinner, a polite status and "see more".
 *
 * Key design decisions:
 *     - Focus stays in the field; arrows move through results (the ARIA combobox pattern, by cmdk): a result is a
 *       listbox option, not a link, so a modifier opens it in a new tab instead.
 *     - Results are already filtered by the index: cmdk only handles the keyboard and the active result.
 *     - A new sort searches at once, its first result active; a typed term waits the client's quiet time.
 *     - No style, no text of its own: every label required, dates formatted for the given locale.
 *
 * Invariants (`search-box.test.tsx`, in happy-dom and in real browsers): axe empty and with results, the keyboard
 * flow, new tabs, the sort, dates, the highlight announced once per change, no text of its own.
 */
import type { Search, SearchResult, SearchSort } from '@figatellu/search';
import { Command } from 'cmdk';
import { Direction, Select, ToggleGroup } from 'radix-ui';
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { useSearch, type SearchBinding } from './use-search.js';

/** Every text of the search box, visible or for assistive technologies: no default, no English. */
export interface SearchBoxLabels<C extends string> {
  /** The search field's accessible name. */
  readonly input: string;
  readonly placeholder: string;
  /** A collection's display name: each result's collection, and each toggle of the filter. */
  readonly collection: (collection: C) => string;
  /** The results list's accessible name. */
  readonly results: string;
  /** The polite live region, by status (nothing is announced while idle). */
  readonly status: {
    readonly tooShort: (minimum: number) => string;
    readonly searching: string;
    readonly unavailable: string;
    /** Results found, 0 included. */
    readonly found: (total: number) => string;
  };
  /** The "see more" button. */
  readonly more: string;
}

interface SearchBoxContext {
  readonly binding: SearchBinding<string>;
  readonly labels: Omit<SearchBoxLabels<string>, 'collection'>;
  readonly collectionLabel: (collection: string) => string;
  /** The URL of the page being read: its own result is marked. */
  readonly current: string | undefined;
  /** A result's trail (e.g. its breadcrumb), by URL; `undefined` shows its collection instead. */
  readonly trailOf: (url: string) => string | undefined;
  readonly filter: SearchBoxFilter<string> | undefined;
  readonly sortBy: SearchBoxSort | undefined;
  /** A result's date for the box's locale, `undefined` without a locale or a valid date. */
  readonly dateOf: (date: string) => string | undefined;
  readonly sort: SearchSort;
  readonly setSort: (sort: SearchSort) => void;
  readonly only: readonly string[];
  readonly setOnly: (only: readonly string[]) => void;
  readonly term: string;
  readonly setTerm: (term: string) => void;
  readonly minLength: number;
  readonly navigate: (url: string) => void;
  readonly openInNewTab: (url: string) => void;
  /** The active result's URL (`''` when none). */
  readonly active: string;
  readonly input: RefObject<HTMLInputElement | null>;
  readonly autoFocus: boolean;
  /** Makes the first result of the next batch active ("see more"). */
  readonly activateFrom: (index: number) => void;
  readonly dir: 'ltr' | 'rtl' | undefined;
}

const Context = createContext<SearchBoxContext | null>(null);

function use(part: string): SearchBoxContext {
  const value = useContext(Context);

  if (value === null) throw new Error(`<${part}> must be rendered inside <SearchBox>.`);

  return value;
}

/** An optional filter by collection: the toggles offered, and the group's accessible name. */
export interface SearchBoxFilter<C extends string> {
  readonly collections: readonly C[];
  readonly label: string;
}

/** The sorts offered in the field, the first one by default, and their texts. */
export interface SearchBoxSort {
  readonly sorts: readonly [SearchSort, ...SearchSort[]];
  readonly labels: {
    /** The select's accessible name. */
    readonly trigger: string;
    /** A sort's display name. */
    readonly sort: (sort: SearchSort) => string;
  };
}

/** The search box's props: cmdk's root's, plus the search, its labels and its options. */
export interface SearchBoxProps<C extends string> extends Omit<
  ComponentProps<typeof Command>,
  'children' | 'label' | 'shouldFilter' | 'filter' | 'value' | 'onValueChange'
> {
  readonly search: Search<C>;
  /** Toggles to search some collections only (none selected: every collection); no filter when absent. */
  readonly filter?: SearchBoxFilter<C> | undefined;
  /** A select of sorts inside the field; none when absent (Pagefind's relevance). */
  readonly sort?: SearchBoxSort | undefined;
  /** The locale dated results show their date in (a long date); no date without it. */
  readonly locale?: string | undefined;
  readonly labels: SearchBoxLabels<C>;
  /**
   * Where a result sits, shown under its title instead of its collection: e.g. its breadcrumb, from the page's
   * metadata (`result.meta`). `undefined` for a result keeps its collection; absent, every result shows it.
   */
  readonly trail?: ((result: SearchResult<C>) => string | undefined) | undefined;
  /** The URL of the page being read: its result is marked (`aria-current="page"`, `data-current`), dimmed by the stylesheet. */
  readonly current?: string | undefined;
  /** Opens a result (Enter or a click); default: `location.assign`. E.g. Next's `router.push`. */
  readonly onNavigate?: ((url: string) => void) | undefined;
  /** Opens a result in a new tab (Ctrl, ⌘ or Shift + Enter, a modified or middle click); default: `window.open`. */
  readonly onOpenInNewTab?: ((url: string) => void) | undefined;
  /** The result that became the active one (arrow keys, the pointer, a query's first): e.g. to prefetch it. */
  readonly onHighlight?: ((url: string) => void) | undefined;
  /** A controlled term; uncontrolled otherwise. */
  readonly term?: string | undefined;
  readonly onTermChange?: ((term: string) => void) | undefined;
  /** Reading direction of the arrow keys in the collection filter (e.g. the locale's). */
  readonly dir?: 'ltr' | 'rtl' | undefined;
  /** Focuses the field when the box mounts (e.g. in a dialog); default `false`. */
  readonly autoFocus?: boolean | undefined;
  /** The parts; default: input, the filter (when given), status, results, "see more". */
  readonly children?: ReactNode;
}

type Active = { readonly kind: 'value'; readonly value: string } | { readonly kind: 'index'; readonly index: number };

/**
 * A search box over the headless client.
 *
 * @param props - The search (`createSearch`), the labels, and optionally a collection filter, a sort select, the
 *   locale for results' dates, a trail per result (e.g. its breadcrumb), the page being read (its own result
 *   dimmed), a controlled term, what opening, opening in a new tab and highlighting a result do, the reading
 *   direction, autofocus, and the parts to compose instead of the default.
 * @returns A combobox whose results are a listbox (cmdk), focus staying in the field; the filter as a toolbar of
 *   toggles, the sort as a select inside the field, a polite status, and "see more".
 *
 * @example
 * <SearchBox
 *   search={search}
 *   labels={labels}
 *   locale="fr"
 *   sort={{ sorts: SEARCH_SORTS, labels: { trigger: 'Trier', sort: (s) => t(`sort.${s}`) } }}
 *   onNavigate={(url) => router.push(url)}
 *   onHighlight={(url) => router.prefetch(url)}
 * />
 *
 * // composed:
 * <SearchBox search={search} labels={labels} locale="fr" onNavigate={(url) => router.push(url)}>
 *   <SearchBoxField><SearchBoxInput /><SearchBoxSpinner /><SearchBoxSort /></SearchBoxField>
 *   <SearchBoxCollections />
 *   <SearchBoxStatus />
 *   <SearchBoxResults /> // renders each result as <SearchBoxResult result={result} />
 *   <SearchBoxMore />
 * </SearchBox>
 */
export function SearchBox<C extends string>({
  search,
  filter,
  sort: sortBy,
  locale,
  labels,
  onNavigate,
  onOpenInNewTab,
  onHighlight,
  term: controlled,
  onTermChange,
  dir,
  autoFocus = false,
  trail,
  current,
  children,
  ...props
}: SearchBoxProps<C>): ReactNode {
  const [own, setOwn] = useState('');
  const term = controlled ?? own;
  const setTerm = (next: string): void => {
    if (controlled === undefined) setOwn(next);

    onTermChange?.(next);
  };
  const [only, setOnly] = useState<readonly C[]>([]);
  const [sort, setSortState] = useState<SearchSort>(sortBy?.sorts[0] ?? 'relevance');
  const binding = useSearch(search, term, { collections: only, sort });
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Active>({ kind: 'value', value: '' });
  const value = active.kind === 'value' ? active.value : (binding.results[active.index]?.url ?? '');
  // The active result, once each time it changes: the latest callback, never a reason to call again.
  const highlighted = binding.results.some((result) => result.url === value) ? value : '';
  const announce = useEffectEvent((url: string) => {
    onHighlight?.(url);
  });

  useEffect(() => {
    if (highlighted !== '') announce(highlighted);
  }, [highlighted]);

  const { collection, ...rest } = labels;
  const context: SearchBoxContext = {
    binding,
    labels: rest,
    current,
    // Computed here, where results are still `SearchResult<C>`: the parts only see strings.
    trailOf: (url) => {
      const result = binding.results.find((candidate) => candidate.url === url);

      return result === undefined ? undefined : trail?.(result);
    },
    // Labelled here, where names are still `C`: the filter's toggles and the results' collections.
    collectionLabel: (name) => {
      const known = [...(filter?.collections ?? []), ...binding.results.map((result) => result.collection)].find(
        (candidate) => candidate === name,
      );

      return known === undefined ? name : collection(known);
    },
    filter,
    sortBy,
    dateOf: (date) => (locale === undefined ? undefined : formatDate(date, locale)),
    sort,
    // A new order: its first result becomes the active one.
    setSort: (next) => {
      setSortState(next);
      setActive({ kind: 'index', index: 0 });
    },
    only,
    // The toggles' values, read back from the filter's own collections.
    setOnly: (next) => {
      setOnly((filter?.collections ?? []).filter((name) => next.includes(name)));
    },
    term,
    setTerm,
    minLength: search.minLength,
    navigate:
      onNavigate ??
      ((url) => {
        globalThis.location.assign(url);
      }),
    openInNewTab:
      onOpenInNewTab ??
      ((url) => {
        globalThis.open(url, '_blank', 'noopener');
      }),
    active: value,
    input,
    autoFocus,
    activateFrom: (index) => {
      setActive({ kind: 'index', index });
    },
    dir,
  };
  const root = (
    <Context value={context}>
      <Command
        // Results come filtered from the index: cmdk only handles the keyboard and the active result.
        shouldFilter={false}
        label={labels.input}
        value={value}
        onValueChange={(next) => {
          setActive({ kind: 'value', value: next });
        }}
        data-slot="search-box"
        data-status={binding.status}
        {...props}
      >
        {children ?? (
          <>
            <SearchBoxField />
            <SearchBoxCollections />
            <SearchBoxStatus />
            <SearchBoxResults />
            <SearchBoxMore />
          </>
        )}
      </Command>
    </Context>
  );

  return dir === undefined ? root : <Direction.Provider dir={dir}>{root}</Direction.Provider>;
}

/**
 * A date as a long date for a locale: a date alone, or a date and time without a time zone, read as UTC so
 * that it never shifts by a day; `undefined` when it is not a date.
 */
function formatDate(value: string, locale: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(value);

  if (match === null) return undefined;

  const date = new Date(`${match[1] ?? ''}T${match[2] ?? '00:00'}${match[3] ?? 'Z'}`);

  return Number.isNaN(date.getTime())
    ? undefined
    : new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

const hasModifier = (event: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): boolean => event.ctrlKey || event.metaKey || event.shiftKey;

/**
 * The field's row: the input, the spinner, and the sort select when the box offers one.
 *
 * @param props - A div's props; `children` replace the default input, spinner and select.
 * @returns The row, styled as one field.
 */
export function SearchBoxField({ children, ...props }: ComponentProps<'div'>): ReactNode {
  return (
    <div data-slot="search-box-field" {...props}>
      {children ?? (
        <>
          <SearchBoxInput />
          <SearchBoxSpinner />
          <SearchBoxSort />
        </>
      )}
    </div>
  );
}

/**
 * A spinner at the end of the field, decorative: the status line announces the search.
 *
 * @param props - A span's props.
 * @returns An `aria-hidden` span, always rendered, shown by the stylesheet while the box searches
 *   (`data-status="searching"` on the root).
 */
export function SearchBoxSpinner(props: ComponentProps<'span'>): ReactNode {
  return <span data-slot="search-box-spinner" aria-hidden {...props} />;
}

/**
 * The sort select, inside the field.
 *
 * @param props - The Radix trigger's props.
 * @returns A Radix Select of the offered sorts, named by its label; nothing when the box offers none. Its arrow keys
 *   open it, never move the list's active result.
 */
export function SearchBoxSort(props: ComponentProps<typeof Select.Trigger>): ReactNode {
  const { sortBy, sort, setSort, dir } = use('SearchBoxSort');

  if (sortBy === undefined) return null;

  return (
    <Select.Root
      value={sort}
      onValueChange={(next) => {
        const chosen = sortBy.sorts.find((candidate) => candidate === next);

        if (chosen !== undefined) setSort(chosen);
      }}
      {...(dir === undefined ? {} : { dir })}
    >
      <Select.Trigger
        data-slot="search-box-sort"
        aria-label={sortBy.labels.trigger}
        // Its arrow keys open the select, never move the active result of the list around it.
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        {...props}
      >
        <Select.Value data-slot="search-box-sort-value" />
        <Select.Icon asChild data-slot="search-box-sort-icon">
          <span />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content data-slot="search-box-sort-content" position="popper" align="end">
          <Select.Viewport>
            {sortBy.sorts.map((name) => (
              <Select.Item key={name} value={name} data-slot="search-box-sort-item">
                <Select.ItemText>{sortBy.labels.sort(name)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/**
 * The field: ↑ ↓ move through the results with focus staying here, Enter opens the active one (with a modifier, in
 * a new tab), Escape clears the term.
 *
 * @param props - cmdk's input props.
 * @returns The combobox, named and placeheld by the labels.
 */
export function SearchBoxInput({ onKeyDown, ...props }: ComponentProps<typeof Command.Input>): ReactNode {
  const { labels, term, setTerm, input, autoFocus, active, openInNewTab } = use('SearchBoxInput');

  return (
    <Command.Input
      ref={input}
      autoFocus={autoFocus}
      data-slot="search-box-input"
      placeholder={labels.placeholder}
      value={term}
      onValueChange={setTerm}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(event);

        if (event.defaultPrevented) return;

        if (event.key === 'Escape' && term !== '') {
          event.preventDefault();
          setTerm('');
        }

        // With a modifier, Enter opens the active result in a new tab instead (cmdk skips prevented events).
        if (event.key === 'Enter' && hasModifier(event) && active !== '') {
          event.preventDefault();
          openInNewTab(active);
        }
      }}
      {...props}
    />
  );
}

/**
 * The collection filter, when the box has one: one Tab stop, ← → between toggles (roving focus), Space or Enter
 * toggles; none selected searches every collection.
 *
 * @param props - The Radix ToggleGroup's props.
 * @returns The toolbar, named by the filter's label; nothing without a filter.
 */
export function SearchBoxCollections(
  props: Omit<ComponentProps<typeof ToggleGroup.Root>, 'type' | 'value' | 'defaultValue' | 'onValueChange'>,
): ReactNode {
  const { filter, collectionLabel, only, setOnly, dir } = use('SearchBoxCollections');

  if (filter === undefined) return null;

  return (
    <ToggleGroup.Root
      type="multiple"
      value={[...only]}
      onValueChange={setOnly}
      aria-label={filter.label}
      data-slot="search-box-collections"
      {...(dir === undefined ? {} : { dir })}
      {...props}
    >
      {filter.collections.map((name) => (
        <ToggleGroup.Item key={name} value={name} data-slot="search-box-collection">
          {collectionLabel(name)}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/**
 * A polite live region: what the search is doing, how many results it found.
 *
 * @param props - A div's props.
 * @returns The status line; nothing announced while idle.
 */
export function SearchBoxStatus(props: ComponentProps<'div'>): ReactNode {
  const { binding, labels, minLength } = use('SearchBoxStatus');
  const text = {
    idle: '',
    'too-short': labels.status.tooShort(minLength),
    searching: labels.status.searching,
    unavailable: labels.status.unavailable,
    done: labels.status.found(binding.total),
  }[binding.status];

  return (
    <div role="status" data-slot="search-box-status" data-status={binding.status} {...props}>
      {text}
    </div>
  );
}

/** The results list's props: cmdk's list's. */
export interface SearchBoxResultsProps extends ComponentProps<typeof Command.List> {
  /** Custom items; default: one `SearchBoxResult` per result. */
  readonly children?: ReactNode;
}

/**
 * The results.
 *
 * @param props - cmdk's list props; `children` replace the default result per item.
 * @returns The listbox, named by the labels.
 */
export function SearchBoxResults({ children, ...props }: SearchBoxResultsProps): ReactNode {
  const { binding, labels } = use('SearchBoxResults');

  return (
    <Command.List data-slot="search-box-results" label={labels.results} {...props}>
      {children ?? binding.results.map((result) => <SearchBoxResult key={result.url} result={result} />)}
    </Command.List>
  );
}

/** One result's props: cmdk's item's, plus the result. */
export interface SearchBoxResultProps extends Omit<ComponentProps<typeof Command.Item>, 'value' | 'onSelect'> {
  readonly result: SearchResult<string>;
}

/**
 * One result: its title, where it sits (its trail, or its collection) and its date, then Pagefind's excerpt.
 *
 * @param props - The result, and cmdk's item props; `children` replace the default content.
 * @returns An option: Enter or a click opens it, a modified or middle click opens it in a new tab; the page being
 *   read is marked `aria-current="page"`.
 */
export function SearchBoxResult({ result, children, ...props }: SearchBoxResultProps): ReactNode {
  const { navigate, openInNewTab, collectionLabel, trailOf, current, dateOf } = use('SearchBoxResult');
  const trail = trailOf(result.url);
  const date = result.date === undefined ? undefined : dateOf(result.date);
  const here = result.url === current;

  return (
    <Command.Item
      value={result.url}
      onSelect={() => {
        navigate(result.url);
      }}
      onClickCapture={(event) => {
        if (!hasModifier(event)) return;

        // Before cmdk's own click: a modified click opens a new tab, not the result in place.
        event.preventDefault();
        event.stopPropagation();
        openInNewTab(result.url);
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;

        event.preventDefault();
        openInNewTab(result.url);
      }}
      data-slot="search-box-result"
      data-collection={result.collection}
      // The page being read: still a result to open, told apart (dimmed by the stylesheet).
      aria-current={here ? 'page' : undefined}
      data-current={here ? '' : undefined}
      {...props}
    >
      {children ?? (
        <>
          <span data-slot="search-box-result-title">{result.title}</span>
          {/* Where it sits, then its date, on one line. */}
          <span data-slot="search-box-result-line">
            {trail === undefined ? (
              <span data-slot="search-box-result-collection">{collectionLabel(result.collection)}</span>
            ) : (
              <span data-slot="search-box-result-trail">{trail}</span>
            )}
            {date === undefined || result.date === undefined ? null : (
              <time data-slot="search-box-result-date" dateTime={result.date}>
                {date}
              </time>
            )}
          </span>
          {/* Pagefind escapes the page's text and only adds <mark> around the matches. */}
          <span data-slot="search-box-result-excerpt" dangerouslySetInnerHTML={{ __html: result.excerpt }} />
        </>
      )}
    </Command.Item>
  );
}

/**
 * "See more": loads the next batch.
 *
 * @param props - A button's props; `children` replace the label.
 * @returns A button rendered while more results exist; the first new result becomes active, focus back in the field.
 */
export function SearchBoxMore({ children, onClick, ...props }: ComponentProps<'button'>): ReactNode {
  const { binding, labels, input, activateFrom } = use('SearchBoxMore');

  if (binding.more === undefined) return null;

  const more = binding.more;

  return (
    <button
      type="button"
      data-slot="search-box-more"
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) return;

        activateFrom(binding.results.length);
        more();
        input.current?.focus();
      }}
      {...props}
    >
      {children ?? labels.more}
    </button>
  );
}

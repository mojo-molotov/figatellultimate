'use client';

/**
 * The search box: a combobox over the headless client, its results a listbox (cmdk), with an optional collection
 * filter, a sort select inside the field, a spinner, a polite status and "see more".
 *
 * Key design decisions:
 *     - Focus stays in the field; arrows move through results (the ARIA combobox pattern, by cmdk): a result is a
 *       listbox option, not a link, so a modifier opens it in a new tab instead.
 *     - The arrows go on past the results' ends: ↓ on the last one reaches "see more" (the only time focus leaves the
 *       field, clearing the active result so Enter activates the button instead of opening a result), ↑ from it comes
 *       back to the last one; ↑ on the first one leaves the results for the field alone, none active, and scrolls it
 *       back into view; ↓ comes back to the first. Without "see more", ↓ stays on the last.
 *     - Results are already filtered by the index: cmdk only handles the keyboard and the active result.
 *     - A new sort searches at once, its first result active; a typed term waits the client's quiet time.
 *     - No style, no text of its own: every label required, dates formatted for the given locale.
 *     - A placeholder that reads badly aloud has a spoken text (`labels.spoken.placeholder`), as the sorts' names do:
 *       the placeholder is then drawn over the field, `aria-hidden`, never the input's `placeholder` (which a screen
 *       reader reads after the name, VoiceOver its ellipsis too), and the field described by the spoken text.
 *       Rejected: an `aria-placeholder`, which a native input's placeholder overrides.
 *
 * Invariants (`search-box.test.tsx`, in happy-dom and in real browsers): axe empty and with results, the keyboard flow
 * (past the results' ends included), new tabs, the sort, its spoken names, dates, the highlight announced once per
 * change, no text of its own; a result named by its title, place and date, its excerpt its description, a trail's
 * chevrons not heard.
 */
import type { Search, SearchResult, SearchSort } from '@figatellultimate/search';
import { Command } from 'cmdk';
import { Direction, Select, ToggleGroup, VisuallyHidden } from 'radix-ui';
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';

import { useTapToClose } from './tap-to-close.js';
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
  /**
   * Heard between a result's title, its place's steps and its date, never seen: a screen reader's pause, e.g. ", ".
   * None: they run on.
   */
  readonly pause?: string | undefined;
  /** The "see more" button. */
  readonly more: string;
  /**
   * What a screen reader hears instead of a text that reads badly aloud. `placeholder`: the field's description,
   * the placeholder then shown and never heard (an ellipsis, or the field's name said again). None: the placeholder
   * is shown and heard, as the browser reads it.
   */
  readonly spoken?: { readonly placeholder: string } | undefined;
}

interface SearchBoxContext {
  readonly binding: SearchBinding<string>;
  readonly labels: Omit<SearchBoxLabels<string>, 'collection'>;
  readonly collectionLabel: (collection: string) => string;
  /** The URL of the page being read: its own result is marked. */
  readonly current: string | undefined;
  /** A result's trail (e.g. its breadcrumb), by URL; `undefined` shows its collection instead. */
  readonly trailOf: (url: string) => string | readonly string[] | undefined;
  /** Optional decorative media (e.g. a cover image) rendered inside a result, by URL; `undefined` renders none. */
  readonly mediaOf: (url: string) => ReactNode;
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
  /** The active result's navigation URL, with its section anchor when matched (`''` when none). */
  readonly activeHref: string;
  readonly field: RefObject<HTMLDivElement | null>;
  readonly input: RefObject<HTMLInputElement | null>;
  /** "See more", while rendered: ↓ on the last result reaches it. */
  readonly more: RefObject<HTMLButtonElement | null>;
  readonly autoFocus: boolean;
  /** Makes the first result of the next batch active ("see more"). */
  readonly activateFrom: (index: number) => void;
  /** Leaves no result active (e.g. when focus moves to "see more"). */
  readonly clearActive: () => void;
  /** Registers a result option's element so `aria-activedescendant` stays in sync with controlled `value`. */
  readonly registerItem: (url: string, element: HTMLDivElement | null) => void;
  readonly dir: 'ltr' | 'rtl' | undefined;
}

/** A result's navigation URL: with its best matching section's anchor when Pagefind found one. */
const hrefOf = (result: SearchResult<string>): string =>
  result.anchor === undefined ? result.url : `${result.url}#${result.anchor}`;

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
    /**
     * A sort's spoken name, when its display name reads badly aloud (`A → Z`, read "A right arrow Z"): the closed
     * select shows the display name and reads this one; its list shows this one (WCAG 2.5.3). Default: the display
     * name.
     */
    readonly spoken?: ((sort: SearchSort) => string) | undefined;
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
   * metadata (`result.meta`). Its steps, drawn with chevrons (the reading way's) a screen reader does not say, or a
   * text shown as is. `undefined` for a result keeps its collection; absent, every result shows it.
   */
  readonly trail?: ((result: SearchResult<C>) => string | readonly string[] | undefined) | undefined;
  /**
   * Optional decorative media (e.g. a cover thumbnail) rendered inside each result before its title (`data-slot="search-box-result-media"`,
   * `aria-hidden`); `undefined` or `null` omits the media slot.
   */
  readonly media?: ((result: SearchResult<C>) => ReactNode) | undefined;
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
  media,
  current,
  children,
  onKeyDown,
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
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>());
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

  // cmdk only updates `selectedItemId` from its own `setState`, leaving `aria-activedescendant` stale when controlled
  // `value` changes externally (cleared on ↓ to "see more" or ↑ past the first result, or restored on ↑ from "see more").
  useLayoutEffect(() => {
    const element = input.current;

    if (element === null) return;

    const id = highlighted === '' ? '' : (items.current.get(highlighted)?.id ?? '');

    if (id === '') element.removeAttribute('aria-activedescendant');
    else element.setAttribute('aria-activedescendant', id);
  }, [highlighted, binding.results]);

  /** Number of cards sharing the first row (`1` in a vertical list, `2+` in a multi-column grid). */
  const gridColumns = (): number => {
    const results = binding.results;
    const first = results[0] === undefined ? undefined : items.current.get(results[0].url);

    if (first === undefined) return 1;

    const firstRect = first.getBoundingClientRect();

    // Unlaid-out environments (e.g. happy-dom without mocked geometry) report zero widths: stay 1D.
    if (firstRect.width === 0) return 1;

    let cols = 1;

    for (let i = 1; i < results.length; i += 1) {
      const candidate = results[i];
      const element = candidate === undefined ? undefined : items.current.get(candidate.url);

      if (element === undefined) break;

      const rect = element.getBoundingClientRect();

      if (Math.abs(rect.top - firstRect.top) >= 5) break;

      cols += 1;
    }

    return cols;
  };

  // Arrow keys: 1D vertical list (`↓` past the last to "see more", `↑` past the first to the field), and full 4-way
  // navigation (`←`/`→`/`↑`/`↓`) when the stylesheet arranges results in a multi-column grid.
  const navigateArrows = (event: KeyboardEvent<HTMLDivElement>): void => {
    const results = binding.results;
    const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
    const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';

    if ((!vertical && !horizontal) || hasModifier(event) || event.altKey || results.length === 0) return;

    if (more.current !== null && event.target === more.current) {
      if (!vertical) return;

      // Its end: ↓ stays on it, moving no result behind it.
      event.preventDefault();

      if (event.key === 'ArrowUp') {
        const last = results.length - 1;

        setActive({ kind: 'index', index: last });
        items.current.get(results[last]?.url ?? '')?.scrollIntoView({ block: 'nearest' });
        // Focus returns to the field without scrolling the dialog back to the top (away from the last result).
        input.current?.focus({ preventScroll: true });
      }

      return;
    }

    if (event.target !== input.current) return;

    const cols = gridColumns();

    if (cols <= 1) {
      if (!vertical) return;

      if (event.key === 'ArrowDown' && more.current !== null && value === results.at(-1)?.url) {
        event.preventDefault();
        setActive({ kind: 'value', value: '' });
        more.current.focus();
      }

      if (event.key === 'ArrowUp' && (value === results[0]?.url || value === '')) {
        event.preventDefault();

        if (value !== '') setActive({ kind: 'value', value: '' });

        // Stepping down the results may have scrolled the field off the top: bring it back on screen.
        (field.current ?? input.current).scrollIntoView({ block: 'nearest' });
      }

      return;
    }

    const currentIndex = results.findIndex((result) => result.url === value);
    const selectAt = (index: number): void => {
      setActive({ kind: 'index', index });
      items.current.get(results[index]?.url ?? '')?.scrollIntoView({ block: 'nearest' });
    };

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (currentIndex === -1) {
        selectAt(0);

        return;
      }

      if (currentIndex + cols < results.length) {
        selectAt(currentIndex + cols);

        return;
      }

      const currentRow = Math.floor(currentIndex / cols);
      const lastRow = Math.floor((results.length - 1) / cols);

      if (currentRow < lastRow) {
        selectAt(results.length - 1);

        return;
      }

      if (more.current !== null) {
        setActive({ kind: 'value', value: '' });
        more.current.focus();
      }

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (currentIndex === -1 || currentIndex < cols) {
        if (value !== '') setActive({ kind: 'value', value: '' });

        (field.current ?? input.current).scrollIntoView({ block: 'nearest' });

        return;
      }

      selectAt(currentIndex - cols);

      return;
    }

    // Horizontal arrows in a multi-column grid: navigate between cards while a card is active and the caret sits at
    // the end of the query; leave text editing alone otherwise, and release the caret when backing past card 0.
    const element = input.current;
    const caretAtEnd = element.selectionStart === element.value.length && element.selectionEnd === element.value.length;

    if (currentIndex === -1 || !caretAtEnd) return;

    const rtl = dir === 'rtl' || getComputedStyle(element).direction === 'rtl';
    const step = (event.key === 'ArrowRight') !== rtl ? 1 : -1;

    if (step === -1 && currentIndex === 0) {
      setActive({ kind: 'value', value: '' });

      return;
    }

    event.preventDefault();
    selectAt(Math.min(results.length - 1, Math.max(0, currentIndex + step)));
  };

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
    mediaOf: (url) => {
      if (media === undefined) return undefined;

      const result = binding.results.find((candidate) => candidate.url === url);

      return result === undefined ? undefined : media(result);
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
    activeHref: (() => {
      const match = binding.results.find((result) => result.url === value);

      return match === undefined ? '' : hrefOf(match);
    })(),
    field,
    input,
    more,
    autoFocus,
    activateFrom: (index) => {
      setActive({ kind: 'index', index });
    },
    clearActive: () => {
      setActive({ kind: 'value', value: '' });
    },
    registerItem: (url, element) => {
      if (element === null) items.current.delete(url);
      else items.current.set(url, element);
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
        // Before cmdk's own keys (it skips prevented events): 2D grid arrows and stepping past the results' ends.
        onKeyDown={(event) => {
          onKeyDown?.(event);

          if (!event.defaultPrevented) navigateArrows(event);
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
  const { field } = use('SearchBoxField');

  return (
    <div ref={field} data-slot="search-box-field" {...props}>
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

/** A sort's text: its display name shown, its spoken name read, when they differ. */
function SortText({
  labels,
  sort,
}: {
  readonly labels: SearchBoxSort['labels'];
  readonly sort: SearchSort;
}): ReactNode {
  const shown = labels.sort(sort);
  const spoken = labels.spoken?.(sort) ?? shown;

  return spoken === shown ? (
    shown
  ) : (
    <>
      <span aria-hidden>{shown}</span>
      <VisuallyHidden.Root>{spoken}</VisuallyHidden.Root>
    </>
  );
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
  const { trigger, closesOnTrigger, swallowsReopen } = useTapToClose();

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
        ref={trigger}
        onClick={swallowsReopen}
        data-slot="search-box-sort"
        aria-label={sortBy.labels.trigger}
        // Its arrow keys open the select, never move the active result of the list around it.
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        {...props}
      >
        {/* Its text from the first render, not filled by Radix a render later: the field never resizes. */}
        <Select.Value data-slot="search-box-sort-value">
          <SortText labels={sortBy.labels} sort={sort} />
        </Select.Value>
        <Select.Icon asChild data-slot="search-box-sort-icon">
          <span />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          data-slot="search-box-sort-content"
          position="popper"
          align="end"
          onPointerDownOutside={closesOnTrigger}
        >
          <Select.Viewport>
            {sortBy.sorts.map((name) => (
              <Select.Item key={name} value={name} data-slot="search-box-sort-item">
                {/* The list has the room: the spoken name, shown and read alike (WCAG 2.5.3). */}
                <Select.ItemText>{sortBy.labels.spoken?.(name) ?? sortBy.labels.sort(name)}</Select.ItemText>
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
 * @returns The combobox in its frame, named and placeheld by the labels; with a spoken placeholder, the shown one
 *   drawn over it and never heard, the field described by the spoken one.
 */
export function SearchBoxInput({ onKeyDown, ...props }: ComponentProps<typeof Command.Input>): ReactNode {
  const { labels, term, setTerm, input, autoFocus, activeHref, openInNewTab } = use('SearchBoxInput');
  const description = useId();
  const spoken = labels.spoken?.placeholder;

  return (
    <span data-slot="search-box-input-frame">
      <Command.Input
        ref={input}
        autoFocus={autoFocus}
        data-slot="search-box-input"
        // A spoken placeholder: the shown one drawn below, never heard; the field described by the spoken one.
        {...(spoken === undefined ? { placeholder: labels.placeholder } : { 'aria-describedby': description })}
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
          if (event.key === 'Enter' && hasModifier(event) && activeHref !== '') {
            event.preventDefault();
            openInNewTab(activeHref);
          }
        }}
        {...props}
      />
      {spoken === undefined || term !== '' ? null : (
        <span data-slot="search-box-placeholder" aria-hidden>
          {labels.placeholder}
        </span>
      )}
      {/* Hidden, still its description: a referenced element is read even hidden. */}
      {spoken === undefined ? null : (
        <span id={description} hidden>
          {spoken}
        </span>
      )}
    </span>
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

/** The labels' pause, heard and not seen; nothing without one. */
function Pause(): ReactNode {
  const { labels } = use('SearchBoxResult');

  return labels.pause === undefined ? null : <VisuallyHidden.Root>{labels.pause}</VisuallyHidden.Root>;
}

function assignRef<T>(target: Ref<T> | undefined, value: T | null): void {
  if (typeof target === 'function') target(value);
  else if (target !== undefined && target !== null) target.current = value;
}

/**
 * One result: its title, where it sits (its trail, or its collection) and its date, then Pagefind's excerpt. Named
 * by the first three, short as the arrows move through them; the excerpt its description,
 * heard after a pause.
 *
 * @param props - The result, and cmdk's item props; `children` replace the default content.
 * @returns An option: Enter or a click opens it, a modified or middle click opens it in a new tab; the page being
 *   read is marked `aria-current="page"`.
 */
export function SearchBoxResult({ result, children, ref, ...props }: SearchBoxResultProps): ReactNode {
  const { navigate, openInNewTab, collectionLabel, trailOf, mediaOf, current, dateOf, dir, registerItem } =
    use('SearchBoxResult');
  const excerptId = useId();
  const trail = trailOf(result.url);
  const cover = mediaOf(result.url);
  const date = result.date === undefined ? undefined : dateOf(result.date);
  const here = result.url === current;
  const href = hrefOf(result);

  return (
    <Command.Item
      ref={(element) => {
        registerItem(result.url, element);
        assignRef(ref, element);
      }}
      value={result.url}
      onSelect={() => {
        navigate(href);
      }}
      onClickCapture={(event) => {
        if (!hasModifier(event)) return;

        // Before cmdk's own click: a modified click opens a new tab, not the result in place.
        event.preventDefault();
        event.stopPropagation();
        openInNewTab(href);
      }}
      onAuxClick={(event) => {
        if (event.button !== 1) return;

        event.preventDefault();
        openInNewTab(href);
      }}
      data-slot="search-box-result"
      data-collection={result.collection}
      // The page being read: still a result to open, told apart (dimmed by the stylesheet).
      aria-current={here ? 'page' : undefined}
      // The default content's excerpt; composed parts describe it themselves.
      {...(children === undefined ? { 'aria-describedby': excerptId } : {})}
      data-current={here ? '' : undefined}
      {...props}
    >
      {children ?? (
        <>
          {cover === undefined || cover === null || cover === false ? null : (
            <span data-slot="search-box-result-media" aria-hidden>
              {cover}
            </span>
          )}
          <span data-slot="search-box-result-title">{result.title}</span>
          {/* Where it sits, then its date, on one line; heard after a comma, the chevrons only seen. */}
          <span data-slot="search-box-result-line">
            <Pause />
            {trail === undefined ? (
              <span data-slot="search-box-result-collection">{collectionLabel(result.collection)}</span>
            ) : (
              <span data-slot="search-box-result-trail">
                {typeof trail === 'string'
                  ? trail
                  : trail.map((step, index) => (
                      <Fragment key={index}>
                        {index === 0 ? null : (
                          <>
                            <span data-slot="search-box-result-separator" aria-hidden>
                              {dir === 'rtl' ? ' ‹ ' : ' › '}
                            </span>
                            <Pause />
                          </>
                        )}
                        {step}
                      </Fragment>
                    ))}
              </span>
            )}
            {date === undefined || result.date === undefined ? null : (
              <>
                <Pause />
                <time data-slot="search-box-result-date" dateTime={result.date}>
                  {date}
                </time>
              </>
            )}
          </span>
          {/* Pagefind escapes the page's text and only adds <mark> around the matches. Out of the name, which stays
              short: its description, heard after a pause, which moving on cuts. */}
          <span
            id={excerptId}
            data-slot="search-box-result-excerpt"
            aria-hidden
            dangerouslySetInnerHTML={{ __html: result.excerpt }}
          />
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
 *   ↓ on the last result reaches it, ↑ from it comes back to the last result, in the field.
 */
export function SearchBoxMore({
  children,
  onClick,
  onFocus,
  onKeyDown,
  ...props
}: ComponentProps<'button'>): ReactNode {
  const { binding, labels, input, more: button, activateFrom, clearActive } = use('SearchBoxMore');

  if (binding.more === undefined) return null;

  const more = binding.more;

  return (
    <button
      ref={button}
      type="button"
      data-slot="search-box-more"
      onFocus={(event) => {
        onFocus?.(event);
        clearActive();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        // Keep Enter as native button activation: cmdk's root would otherwise call preventDefault().
        if (event.key === 'Enter') event.stopPropagation();
      }}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) return;

        activateFrom(binding.results.length);
        more();
        // Focus returns to the field without scrolling the dialog back to the top before the next batch lands.
        input.current?.focus({ preventScroll: true });
      }}
      {...props}
    >
      {children ?? labels.more}
    </button>
  );
}

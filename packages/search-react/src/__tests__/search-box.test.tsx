// @vitest-environment happy-dom
import { createSearch, type Search } from '@figatellu/search';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchBox, SearchBoxInput, SearchBoxResults, type SearchBoxLabels } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

type Collection = 'pages' | 'blog';

// Seven documents: two batches of five and two; the term matches the text, the filter the collection.
const DOCUMENTS = Array.from({ length: 7 }, (_, i) => ({
  url: `/doc/${String(i)}`,
  title: `«titre ${String(i)}»`,
  text: 'chevaux',
  collection: i < 4 ? 'blog' : 'pages',
}));

/** Pagefind's browser module, simulated: the shape `@figatellu/search` reads. */
const sorts: unknown[] = [];
const pagefind = {
  search: (term: string, options?: { filters?: { collection?: { any?: readonly string[] } }; sort?: unknown }) => {
    sorts.push(options?.sort);
    const allowed = options?.filters?.collection?.any;
    const matching = DOCUMENTS.filter(
      (d) => d.text.includes(term) && (allowed === undefined || allowed.includes(d.collection)),
    );
    // Titles descending: the order reversed, so that a sort that does nothing cannot pass.
    const descending = JSON.stringify(options?.sort) === JSON.stringify({ title: 'desc' });
    const found = descending ? [...matching].reverse() : matching;

    return Promise.resolve({
      results: found.map((d) => ({
        data: () =>
          Promise.resolve({
            url: d.url,
            excerpt: `«extrait <mark>${term}</mark>»`,
            meta: {
              title: d.title,
              // Blog posts are dated and have a trail; pages have neither.
              ...(d.collection === 'blog' ? { breadcrumb: `«blog › ${d.url}»`, date: '2026-11-04' } : {}),
            },
            filters: { collection: [d.collection] },
          }),
      })),
    });
  },
};

const LABELS: SearchBoxLabels<Collection> = {
  input: '«rechercher»',
  placeholder: '«tapez»',
  collection: (c) => `«collection ${c}»`,
  results: '«résultats»',
  status: {
    tooShort: (n) => `«au moins ${String(n)}»`,
    searching: '«recherche»',
    unavailable: '«indisponible»',
    found: (n) => `«${String(n)} trouvés»`,
  },
  more: '«voir plus»',
};

const SORT = {
  sorts: ['relevance', 'title-asc', 'title-desc'],
  labels: { trigger: '«trier»', sort: (sort: string) => `«tri ${sort}»` },
} as const;

function renderBox(
  options: { search?: Search<Collection>; dir?: 'ltr' | 'rtl'; sort?: boolean; locale?: string } = {},
) {
  const opened: string[] = [];
  const highlighted: string[] = [];
  const tabs: string[] = [];
  const search =
    options.search ??
    createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(pagefind),
    });
  const user = userEvent.setup();

  render(
    <main>
      <SearchBox
        search={search}
        filter={{ collections: ['pages', 'blog'], label: '«collections»' }}
        labels={LABELS}
        onNavigate={(url) => opened.push(url)}
        onOpenInNewTab={(url) => tabs.push(url)}
        onHighlight={(url) => highlighted.push(url)}
        {...(options.sort === true ? { sort: SORT } : {})}
        {...(options.locale === undefined ? {} : { locale: options.locale })}
        dir={options.dir}
      />
    </main>,
  );
  const field = (): HTMLElement => screen.getByRole('combobox', { name: '«rechercher»' });

  return { user, opened, tabs, field, highlighted };
}

const status = (): string => screen.getByRole('status').textContent;
const options = (): HTMLElement[] => screen.queryAllByRole('option');
const active = (): string | null =>
  options()
    .find((o) => o.getAttribute('aria-selected') === 'true')
    ?.getAttribute('data-value') ?? null;

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { region: { enabled: false } } });

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

afterEach(() => {
  cleanup();
  sorts.length = 0;
});

describe('SearchBox', () => {
  it('passes axe, empty and with results', async () => {
    const { user, field } = renderBox();

    expect(await violations()).toEqual([]);
    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(status()).toBe('«7 trouvés»');
    });
    expect(await violations()).toEqual([]);
  });

  it('announces its status politely: too short, then found', async () => {
    const { user, field } = renderBox();

    expect(status()).toBe('');
    await user.type(field(), 'ch');
    await waitFor(() => {
      expect(status()).toBe('«au moins 3»');
    });
    await user.type(field(), 'evaux');
    await waitFor(() => {
      expect(status()).toBe('«7 trouvés»');
    });
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('done');
  });

  it('keyboard: ↓ ↑ move through results with focus staying in the field, Enter opens the active one', async () => {
    const { user, field, opened } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    expect(active()).toBe('/doc/0');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(active()).toBe('/doc/1');
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute('aria-activedescendant')).toBe(
      options().find((o) => o.getAttribute('data-value') === '/doc/1')?.id,
    );
    await user.keyboard('{Enter}');
    expect(opened).toEqual(['/doc/1']);
  });

  it('announces the highlighted result, once each time it changes, for the app to prefetch it', async () => {
    const { user, field, highlighted } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    // The query's first result is highlighted by itself.
    expect(highlighted).toEqual(['/doc/0']);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(highlighted).toEqual(['/doc/0', '/doc/1', '/doc/2', '/doc/1']);
    const fourth = options()[3];

    if (fourth === undefined) throw new Error('no fourth result');

    await user.hover(fourth);
    expect(highlighted.at(-1)).toBe('/doc/3');
  });

  it.each([
    ['fr', '4 novembre 2026'],
    ['en', 'November 4, 2026'],
  ])("shows a dated result's date for its locale, %s, on its trail line", async (locale, shown) => {
    const { user, field } = renderBox({ locale });

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    const blog = options()[0];
    const time = blog?.querySelector('time[data-slot="search-box-result-date"]');

    expect(time?.getAttribute('datetime')).toBe('2026-11-04');
    expect(time?.textContent).toBe(shown);
    // A page has no date.
    expect(options()[4]?.querySelector('time')).toBeNull();
  });

  it('shows no date without a locale', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    expect(document.querySelector('time')).toBeNull();
  });

  it('has a decorative spinner in its field, shown by the stylesheet while it searches', async () => {
    const { user, field } = renderBox();
    const spinner = document.querySelector('[data-slot="search-box-spinner"]');

    expect(spinner?.closest('[data-slot="search-box-field"]')).toBe(field().closest('[data-slot="search-box-field"]'));
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(document.querySelector('[data-slot="search-box"]')?.getAttribute('data-status')).toBe('done');
    });
  });

  it('offers no sort unless given one', () => {
    renderBox();
    expect(screen.queryByRole('combobox', { name: '«trier»' })).toBeNull();
  });

  it('sorts in the field: relevance first, then the chosen sort, searched again from the first result', async () => {
    const { user, field } = renderBox({ sort: true });
    const select = screen.getByRole('combobox', { name: '«trier»' });

    // In the field, next to the input.
    expect(select.closest('[data-slot="search-box-field"]')).toBe(field().closest('[data-slot="search-box-field"]'));
    expect(select.textContent).toBe('«tri relevance»');
    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    expect(active()).toBe('/doc/0');
    await user.click(select);
    await user.click(screen.getByRole('option', { name: '«tri title-desc»' }));
    await waitFor(() => {
      expect(active()).toBe('/doc/6');
    });
    expect(sorts.at(-1)).toEqual({ title: 'desc' });
    expect(select.textContent).toBe('«tri title-desc»');
    expect(await violations()).toEqual([]);
  });

  it('a modifier opens the result in a new tab: Ctrl or Shift + Enter, a modified or middle click', async () => {
    const { user, field, opened, tabs } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    const third = options()[2];

    if (third === undefined) throw new Error('no third result');

    await user.keyboard('{Meta>}');
    await user.click(third);
    await user.keyboard('{/Meta}');
    await user.pointer({ keys: '[MouseMiddle]', target: third });
    expect(tabs).toEqual(['/doc/1', '/doc/1', '/doc/2', '/doc/2']);
    // Nothing navigated in place.
    expect(opened).toEqual([]);
  });

  it('keyboard: Home and End go to the first and last result', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    await user.keyboard('{End}');
    expect(active()).toBe('/doc/4');
    await user.keyboard('{Home}');
    expect(active()).toBe('/doc/0');
  });

  it('keyboard: Escape clears the term', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    await user.keyboard('{Escape}');
    expect(field()).toHaveProperty('value', '');
    await waitFor(() => {
      expect(options()).toHaveLength(0);
    });
  });

  it('keyboard: the collections are one Tab stop, ← → move between them, Space toggles', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    const group = screen.getByRole('toolbar', { name: '«collections»' });
    const [pages, blog] = within(group).getAllByRole('button');

    await user.tab();
    expect(document.activeElement).toBe(pages);
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(blog);
    await user.keyboard(' ');
    expect(blog?.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => {
      expect(status()).toBe('«4 trouvés»');
    });
    // One Tab stop: Tab leaves the group.
    await user.tab();
    expect(group.contains(document.activeElement)).toBe(false);
  });

  it('keyboard: in a right-to-left locale, ← moves forward in the collections', async () => {
    const { user, field } = renderBox({ dir: 'rtl' });

    await user.type(field(), 'chevaux');
    const [pages, blog] = within(screen.getByRole('toolbar', { name: '«collections»' })).getAllByRole('button');

    await user.tab();
    expect(document.activeElement).toBe(pages);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(blog);
  });

  it('"see more" loads the next batch, makes its first result active and brings focus back to the field', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    await user.click(screen.getByRole('button', { name: '«voir plus»' }));
    await waitFor(() => {
      expect(options()).toHaveLength(7);
    });
    expect(active()).toBe('/doc/5');
    expect(document.activeElement).toBe(field());
    expect(screen.queryByRole('button', { name: '«voir plus»' })).toBeNull();
  });

  it('says the search is unavailable when the bundle is missing', async () => {
    const search = createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.reject(new Error('404')),
    });
    const { user, field } = renderBox({ search });

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(status()).toBe('«indisponible»');
    });
  });

  it('renders no text of its own, and its parts carry their data-slot', async () => {
    const { user, field } = renderBox();

    await user.type(field(), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (['STYLE', 'SCRIPT'].includes(node.parentElement?.tagName ?? '')) continue;

      const text = node.textContent?.trim() ?? '';

      if (text !== '') found.push(text);
    }

    for (const element of document.body.querySelectorAll('*')) {
      for (const name of ['aria-label', 'placeholder', 'title']) {
        const value = element.getAttribute(name)?.trim();

        if (value !== undefined && value !== '') found.push(value);
      }
    }

    // Every text is a label's marker, or the content: titles, excerpts (split around <mark>), the typed term.
    expect(found.length).toBeGreaterThan(10);
    expect(found.filter((text) => !/^«.*»$/.test(text) && !['«extrait', 'chevaux', '»'].includes(text))).toEqual([]);

    for (const slot of [
      'search-box',
      'search-box-input',
      'search-box-collections',
      'search-box-status',
      'search-box-results',
      'search-box-result',
      'search-box-more',
    ])
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).not.toBeNull();
  });

  it("shows each result's trail when the app gives one, its collection otherwise", async () => {
    const search = createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(pagefind),
    });
    const user = userEvent.setup();

    render(<SearchBox search={search} labels={LABELS} trail={(result) => result.meta['breadcrumb']} />);
    await user.type(screen.getByRole('combobox'), 'chevaux');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    });
    const first = screen.getAllByRole('option')[0];

    // Precondition: the first result is a post, which carries a breadcrumb.
    expect(first?.getAttribute('data-collection')).toBe('blog');
    expect(first?.querySelector('[data-slot="search-box-result-trail"]')?.textContent).toBe('«blog › /doc/0»');
    expect(first?.querySelector('[data-slot="search-box-result-collection"]')).toBeNull();
    // A page carries none: its collection, as without a trail.
    await user.click(screen.getByRole('button', { name: '«voir plus»' }));
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(7);
    });
    const page = screen.getAllByRole('option').find((option) => option.getAttribute('data-collection') === 'pages');

    expect(page?.querySelector('[data-slot="search-box-result-collection"]')?.textContent).toBe('«collection pages»');
  });

  it('marks the result of the page being read (`current`), and only it', async () => {
    const search = createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(pagefind),
    });
    const user = userEvent.setup();

    render(<SearchBox search={search} labels={LABELS} current="/doc/1" />);
    await user.type(screen.getByRole('combobox'), 'chevaux');
    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBe(5);
    });
    const marked = screen.getAllByRole('option').filter((option) => option.hasAttribute('data-current'));

    expect(marked.map((option) => option.getAttribute('data-value') ?? option.textContent)).toHaveLength(1);
    expect(marked[0]?.getAttribute('aria-current')).toBe('page');
    expect(marked[0]?.textContent).toContain('«titre 1»');
  });

  it('without a filter, offers no collection toggles', () => {
    const search = createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(pagefind),
    });

    render(<SearchBox search={search} labels={LABELS} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.querySelector('[data-slot="search-box-collections"]')).toBeNull();
  });

  it('composes from its parts, forwarding className', async () => {
    const search = createSearch<Collection>({
      collections: ['pages', 'blog'],
      locale: 'fr',
      debounce: 0,
      load: () => Promise.resolve(pagefind),
    });
    const user = userEvent.setup();

    render(
      <SearchBox search={search} filter={{ collections: ['blog'], label: '«collections»' }} labels={LABELS}>
        <SearchBoxInput className="field" />
        <SearchBoxResults className="list" />
      </SearchBox>,
    );
    await user.type(screen.getByRole('combobox'), 'chevaux');
    await waitFor(() => {
      expect(options()).toHaveLength(5);
    });
    expect(document.querySelector('[data-slot="search-box-input"]')?.classList.contains('field')).toBe(true);
    expect(document.querySelector('[data-slot="search-box-results"]')?.classList.contains('list')).toBe(true);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

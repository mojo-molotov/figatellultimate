// @vitest-environment happy-dom
import { defineFacetedCollection, type Engine } from '@figatellultimate/facets';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FacetOptions,
  FacetOptionsContent,
  FacetOptionsInput,
  FacetOptionsList,
  FacetOptionsTrigger,
  FacetsReset,
  ListingOptions,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PageSelect,
  SortSelect,
  useFacetedCollection,
  type FacetOptionsLabels,
  type FacetedCollectionBinding,
  type ListingOptionsLabels,
  type PageSelectLabels,
  type PaginationLabels,
  type SortSelectLabels,
} from '../index.js';

interface Post {
  readonly url: string;
  readonly date: string;
  readonly tags: readonly string[];
}
// 20 posts, two per page: ten pages, so the pagination has gaps; three tags with different counts.
const POSTS: readonly Post[] = Array.from({ length: 20 }, (_, i) => ({
  url: `/p/${String(i).padStart(2, '0')}`,
  date: `2026-10-${String(i + 1).padStart(2, '0')}`,
  tags: i % 4 === 0 ? ['bot', 'release'] : [i % 4 === 1 ? 'release' : 'guide'],
}));
const engine: Engine<Post> = defineFacetedCollection<Post>({
  items: POSTS,
  key: (post) => post.url,
  facets: { tags: { values: (post) => post.tags } },
  sorts: {
    'date-desc': (a, b) => (a.date < b.date ? 1 : -1),
    'date-asc': (a, b) => (a.date < b.date ? -1 : 1),
  },
  perPage: 2,
});

// Every text is a unique marker, in French: the DOM must contain nothing else.
const FACET: FacetOptionsLabels = {
  trigger: (n) => `«déclencheur ${String(n)}»`,
  filter: '«filtrer»',
  list: '«liste»',
  empty: '«aucun»',
  term: (term) => `«terme ${term}»`,
  clear: '«effacer»',
};
/** The browser family runs these tests in real browsers, where `react-dom/server` does not run. */
const inBrowser = !navigator.userAgent.includes('HappyDOM');
const OPTIONS: ListingOptionsLabels = {
  trigger: (n) => `«options ${String(n)}»`,
  content: '«options de la liste»',
};
const SORT: SortSelectLabels = { trigger: '«trier»', sort: (sort) => `«tri ${sort}»` };
const JUMP: PageSelectLabels = {
  trigger: '«aller à la page»',
  current: (page, pages) => `«page ${String(page)}/${String(pages)}»`,
};
const PAGES: PaginationLabels = {
  nav: '«pagination»',
  previous: '«précédent»',
  next: '«suivant»',
  page: (n) => `«page ${String(n)}»`,
  current: (n, total) => `«page ${String(n)} sur ${String(total)}»`,
  more: (pages) => `«pages ${pages.join(',')}»`,
};

/** The listing over an in-memory URL; `binding()` reads the latest binding, `history` the URLs navigated to. */
function renderListing(
  initial = '',
  parts?: (binding: FacetedCollectionBinding) => ReactNode,
  dir?: 'ltr' | 'rtl',
  locale = 'fr',
) {
  const history: string[] = [];
  let latest: FacetedCollectionBinding | undefined;

  function Listing(): ReactNode {
    const [search, setSearch] = useState(initial);
    const binding = useFacetedCollection(engine, {
      search,
      navigate(next) {
        history.push(next);
        setSearch(next);
      },
    });

    latest = binding;

    return (
      <main>
        {parts?.(binding) ?? (
          <>
            <FacetOptions binding={binding} facet="tags" labels={FACET} locale={locale} dir={dir} />
            <SortSelect binding={binding} labels={SORT} dir={dir} />
            <Pagination binding={binding} labels={PAGES} locale={locale} dir={dir} />
          </>
        )}
      </main>
    );
  }
  const user = userEvent.setup();

  render(<Listing />);

  return {
    user,
    history,
    binding: (): FacetedCollectionBinding => {
      if (latest === undefined) throw new Error('not rendered');

      return latest;
    },
  };
}

/**
 * axe-core on the whole document, or on an open popup: Radix's modal primitives (Select, DropdownMenu) hide the rest
 * of the page with `aria-hidden` and add focus guards while open, which axe reports although focus is trapped in the
 * popup (accepted, Radix's behavior). `region` is a page-level rule (these are fragments).
 */
async function violations(context: Element = document.body): Promise<string[]> {
  const result = await axe.run(context, { rules: { region: { enabled: false } } });

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

/** Every text node and every text-bearing attribute of the document, trimmed and non-empty. */
function texts(): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    // Stylesheets Radix injects are not text.
    if (['STYLE', 'SCRIPT'].includes(node.parentElement?.tagName ?? '')) continue;

    const text = node.textContent?.trim() ?? '';

    if (text !== '') found.push(text);
  }

  for (const element of document.body.querySelectorAll('*')) {
    for (const name of ['aria-label', 'placeholder', 'title', 'aria-valuetext', 'alt']) {
      const value = element.getAttribute(name)?.trim();

      if (value !== undefined && value !== '') found.push(value);
    }
  }

  return found;
}

/** A text from the labels (a marker), or what the library may render itself: digits, the ellipsis, a count. */
const allowed = (text: string): boolean => /^«[^«»]*»$/.test(text) || /^\d+$/.test(text) || text === '…';

const focused = (): Element | null => document.activeElement;

afterEach(() => {
  cleanup();
});

describe('facet options', () => {
  it('passes axe, closed and open', async () => {
    const { user } = renderListing();

    expect(await violations()).toEqual([]);
    await user.click(screen.getByRole('button', { name: '«déclencheur 0»' }));
    // The list is loaded when the popover opens: it shows once its chunk is there.
    expect(await screen.findByRole('dialog', { name: '«déclencheur 0»' })).toBeDefined();
    expect(await violations()).toEqual([]);
  });

  it('keyboard: Enter opens and focuses the filter, ↓ moves, Enter toggles and keeps the list open, Escape closes back to the trigger', async () => {
    const { user, history, binding } = renderListing();
    const trigger = screen.getByRole('button', { name: '«déclencheur 0»' });

    trigger.focus();
    await user.keyboard('{Enter}');
    // The list is loaded when the popover opens: focus reaches the filter once it is there.
    await waitFor(() => {
      expect(focused()?.getAttribute('aria-label')).toBe('«filtrer»');
    });
    // The first term is active; ↓ moves to the second.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(history.at(-1)).toBe('?tags=release');
    expect(binding().state.facets['tags']).toEqual(['release']);
    // Still open, focus still in the filter field; the option says it is checked.
    expect(focused()?.getAttribute('aria-label')).toBe('«filtrer»');
    const option = screen.getByRole('option', { name: '«terme release» 10' });

    expect(option.getAttribute('aria-checked')).toBe('true');
    expect(option.getAttribute('data-state')).toBe('checked');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(focused()).toBe(screen.getByRole('button', { name: '«déclencheur 1»' }));
  });

  it('keyboard: typing filters on the display name, Home and End move to the ends', async () => {
    const { user } = renderListing();

    await user.click(screen.getByRole('button', { name: '«déclencheur 0»' }));
    await user.keyboard('terme rel');
    const options = screen.getAllByRole('option');

    expect(options.map((o) => o.getAttribute('data-value'))).toEqual(['release']);
    await user.clear(screen.getByRole('combobox', { name: '«filtrer»' }));
    await user.keyboard('{End}');
    expect(screen.getAllByRole('option').at(-1)?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the empty label when nothing matches, and "clear" only while something is selected', async () => {
    const { user, history } = renderListing('?tags=bot');

    await user.click(screen.getByRole('button', { name: '«déclencheur 1»' }));
    expect(screen.getByRole('option', { name: '«effacer»' })).toBeDefined();
    await user.keyboard('zzz');
    expect(screen.getByText('«aucun»')).toBeDefined();
    // "clear" is always mounted, whatever the filter; the page follows the reconciliation.
    await user.click(screen.getByRole('option', { name: '«effacer»' }));
    expect(history.at(-1)).toBe('?page=2');
    expect(screen.queryByRole('option', { name: '«effacer»' })).toBeNull();
  });

  it('shows each term with its count, from the view', async () => {
    const { user } = renderListing();

    await user.click(screen.getByRole('button', { name: '«déclencheur 0»' }));
    const counts = Object.fromEntries(
      screen
        .getAllByRole('option')
        .map((o): [string, string | null] => [o.getAttribute('data-value') ?? '', o.getAttribute('data-count')]),
    );

    expect(counts).toEqual({ bot: '5', release: '10', guide: '10' });
  });
});

describe('facets reset', () => {
  const RESET = { reset: '«réinitialiser»' };
  const withReset = (binding: FacetedCollectionBinding): ReactNode => (
    <>
      <FacetOptions binding={binding} facet="tags" labels={FACET} locale="fr" />
      <SortSelect binding={binding} labels={SORT} />
      <FacetsReset binding={binding} labels={RESET} />
    </>
  );
  const reset = (): HTMLElement | null => screen.queryByRole('button', { name: '«réinitialiser»' });

  it('passes axe with a selection', async () => {
    renderListing('?tags=bot&tags=guide', withReset);
    expect(reset()).not.toBeNull();
    expect(await violations()).toEqual([]);
  });

  it('is not rendered while nothing is selected', () => {
    renderListing('?page=3&sort=date-asc', withReset);
    expect(reset()).toBeNull();
  });

  it('clears every facet at once, keeps the sort, then hands focus to the control before it', async () => {
    const { user, binding, history } = renderListing('?tags=bot&tags=guide&sort=date-asc', withReset);

    // Precondition: something is selected, so the reset has something to do.
    expect(binding().state.facets['tags']).toEqual(['bot', 'guide']);
    const button = reset();

    if (button === null) throw new Error('no reset');

    await user.click(button);
    expect(binding().state.facets['tags']).toEqual([]);
    expect(binding().state.sort).toBe('date-asc');
    expect(history.at(-1)).toBe('?sort=date-asc');
    // Gone with the selection: focus is never lost, it goes to the sort select placed before it.
    expect(reset()).toBeNull();
    expect(focused()).toBe(screen.getByRole('combobox', { name: '«trier»' }));
  });

  it('keyboard: Enter and Space reset', async () => {
    for (const key of ['{Enter}', ' ']) {
      const { user, binding } = renderListing('?tags=bot', withReset);

      reset()?.focus();
      await user.keyboard(key);
      expect(binding().state.facets['tags']).toEqual([]);
      cleanup();
    }
  });

  it('carries its data-slot, forwards className and props, and renders no text of its own', () => {
    renderListing('?tags=bot', (binding) => (
      <FacetsReset binding={binding} labels={RESET} className="r" data-test="reset" />
    ));
    const button = document.querySelector('[data-slot="facets-reset"]');

    expect(button?.classList.contains('r')).toBe(true);
    expect(button?.getAttribute('data-test')).toBe('reset');
    expect(texts()).toEqual(['«réinitialiser»']);
  });
});

describe('sort select', () => {
  it('passes axe, closed and open', async () => {
    const { user } = renderListing();

    expect(await violations()).toEqual([]);
    await user.click(screen.getByRole('combobox', { name: '«trier»' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(await violations(screen.getByRole('listbox'))).toEqual([]);
  });

  it('keyboard: Enter opens on the current sort, ↓ and Enter choose, focus back to the trigger', async () => {
    const { user, history } = renderListing();
    const trigger = screen.getByRole('combobox', { name: '«trier»' });

    expect(trigger.textContent).toContain('«tri date-desc»');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(focused()?.textContent).toContain('«tri date-desc»');
    await user.keyboard('{ArrowDown}{Enter}');
    // The page keeps the post being read in view (`keepReadingPosition`).
    expect(history.at(-1)).toBe('?sort=date-asc&page=10');
    expect(focused()).toBe(screen.getByRole('combobox', { name: '«trier»' }));
    expect(screen.getByRole('combobox', { name: '«trier»' }).textContent).toContain('«tri date-asc»');
  });

  // Server rendering: `react-dom/server` runs in Node (happy-dom), not in the browser family's pages.
  it.skipIf(inBrowser)(
    'shows the current sort’s name from the first render, the prerendered page’s included',
    async () => {
      // Left to Radix, the value fills a render later: the trigger widened as it mounted, and a toolbar wrapping on a
      // phone pushed the page below it, the pagination included, at every page change.
      const { renderToString } = await import('react-dom/server');

      function Prerendered(): ReactNode {
        const binding = useFacetedCollection(engine, { search: '?sort=date-asc', navigate: () => undefined });

        return <SortSelect binding={binding} labels={SORT} />;
      }
      const html = renderToString(<Prerendered />);

      expect(html).toMatch(/data-slot="sort-select-value"[^>]*>«tri date-asc»</);
    },
  );

  it('keyboard: Escape closes without changing the sort', async () => {
    const { user, history } = renderListing();

    screen.getByRole('combobox', { name: '«trier»' }).focus();
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(history).toEqual([]);
    expect(focused()).toBe(screen.getByRole('combobox', { name: '«trier»' }));
  });
});

describe('page select', () => {
  const withSelect = (locale: string) => (binding: FacetedCollectionBinding) => (
    <PageSelect binding={binding} labels={JUMP} locale={locale} />
  );

  it('passes axe, closed and open: one option per page', async () => {
    const { user } = renderListing('?page=3', withSelect('fr'));

    expect(await violations()).toEqual([]);
    await user.click(screen.getByRole('combobox', { name: '«aller à la page»' }));
    expect(screen.getAllByRole('option')).toHaveLength(10);
    expect(await violations(screen.getByRole('listbox'))).toEqual([]);
  });

  it('keyboard: shows the current page, opens on it, ↓ and Enter go to the next, focus back to the trigger', async () => {
    const { user, history } = renderListing('?page=3', withSelect('fr'));
    const trigger = screen.getByRole('combobox', { name: '«aller à la page»' });

    expect(trigger.textContent).toBe('«page 3/10»');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(focused()?.textContent).toBe('3');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(history.at(-1)).toBe('?page=4');
    expect(focused()).toBe(screen.getByRole('combobox', { name: '«aller à la page»' }));
  });

  it('keyboard: Escape closes without changing the page', async () => {
    const { user, history } = renderListing('?page=3', withSelect('fr'));

    screen.getByRole('combobox', { name: '«aller à la page»' }).focus();
    await user.keyboard('{Enter}{ArrowDown}{Escape}');
    expect(history).toEqual([]);
  });

  it('renders nothing for a single page', () => {
    renderListing('', (binding) => (
      <PageSelect binding={{ ...binding, view: { ...binding.view, pages: 1 } }} labels={JUMP} locale="fr" />
    ));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it("formats the pages' numbers for the locale", async () => {
    const { user } = renderListing('?page=3', withSelect('ar-EG'));

    await user.click(screen.getByRole('combobox', { name: '«aller à la page»' }));
    expect(screen.getAllByRole('option')[2]?.textContent).toBe('٣');
  });
});

describe('pagination', () => {
  it('passes axe, closed and with an ellipsis menu open', async () => {
    const { user } = renderListing('?page=5');

    expect(await violations()).toEqual([]);
    await user.click(screen.getByRole('button', { name: '«pages 2,3»' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(await violations(screen.getByRole('menu'))).toEqual([]);
  });

  it('renders real links, the current page marked, gaps as menus of the hidden pages', () => {
    renderListing('?page=5');
    const nav = screen.getByRole('navigation', { name: '«pagination»' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((l) => l.getAttribute('aria-label') ?? l.textContent)).toEqual([
      '«précédent»',
      '«page 1»',
      '«page 4»',
      '«page 5 sur 10»',
      '«page 6»',
      '«page 10»',
      '«suivant»',
    ]);
    expect(within(nav).getByRole('link', { name: '«page 4»' }).getAttribute('href')).toBe('?page=4');
    expect(within(nav).getByRole('link', { name: '«page 5 sur 10»' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('button', { name: '«pages 7,8,9»' })).toBeDefined();
  });

  it('renders nothing for a single page: no landmark, no previous, next or lone page', () => {
    // Bot alone: five posts, two per page… so three pages; a selection of one post gives a single page.
    renderListing('?tags=bot&sort=date-asc');
    expect(screen.queryByRole('navigation', { name: '«pagination»' })).not.toBeNull();
    cleanup();
    renderListing('', (binding) => (
      <Pagination binding={{ ...binding, view: { ...binding.view, pages: 1 } }} labels={PAGES} locale="fr" />
    ));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('[data-slot="pagination"]')).toBeNull();
  });

  it("shows the app's icons beside previous and next, their labels still their names", () => {
    renderListing('?page=5', (binding) => (
      <Pagination
        binding={binding}
        labels={PAGES}
        locale="fr"
        icons={{ previous: <svg data-testid="left" />, next: <svg data-testid="right" /> }}
      />
    ));

    for (const [name, icon] of [
      ['«précédent»', 'left'],
      ['«suivant»', 'right'],
    ] as const) {
      const step = screen.getByRole('link', { name });

      expect(within(step).getByTestId(icon).parentElement?.getAttribute('aria-hidden')).toBe('true');
      expect(within(step).getByText(name).getAttribute('data-slot')).toBe('pagination-step-label');
    }
  });

  it('disables previous on the first page and next on the last, without an href', () => {
    renderListing('');
    const previous = screen.getByRole('link', { name: '«précédent»' });

    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(previous.hasAttribute('href')).toBe(false);
    cleanup();
    renderListing('?page=10');
    expect(screen.getByRole('link', { name: '«suivant»' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('keyboard: Enter on a link navigates without reloading, and focus moves to the new current page', async () => {
    const { user, history } = renderListing('?page=5');

    screen.getByRole('link', { name: '«page 6»' }).focus();
    await user.keyboard('{Enter}');
    expect(history.at(-1)).toBe('?page=6');
    expect(focused()).toBe(screen.getByRole('link', { name: '«page 6 sur 10»' }));
    // "next" stays where it was: focus follows the current page, not the activated link.
    screen.getByRole('link', { name: '«suivant»' }).focus();
    await user.keyboard('{Enter}');
    expect(history.at(-1)).toBe('?page=7');
    expect(focused()).toBe(screen.getByRole('link', { name: '«page 7 sur 10»' }));
  });

  it('keyboard: an ellipsis opens with Enter, ↓ moves, Enter goes, focus on the new current page', async () => {
    const { user, history } = renderListing('?page=5');

    screen.getByRole('button', { name: '«pages 7,8,9»' }).focus();
    await user.keyboard('{Enter}');
    expect(focused()?.getAttribute('aria-label')).toBe('«page 7»');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(history.at(-1)).toBe('?page=8');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(focused()).toBe(screen.getByRole('link', { name: '«page 8 sur 10»' }));
  });

  it('keyboard: Escape closes an ellipsis menu back to its button', async () => {
    const { user, history } = renderListing('?page=5');
    const ellipsis = screen.getByRole('button', { name: '«pages 7,8,9»' });

    ellipsis.focus();
    await user.keyboard('{Enter}{Escape}');
    expect(history).toEqual([]);
    expect(focused()).toBe(ellipsis);
  });

  it('a click with a modifier key is left to the browser (new tab)', async () => {
    const { user, history } = renderListing('?page=5');
    // After the component's handler, keep a real browser from following the link in the test page itself.
    let prevented = false;
    const stop = (event: Event): void => {
      prevented = !event.defaultPrevented;
      event.preventDefault();
    };

    window.addEventListener('click', stop);

    try {
      await user.keyboard('{Control>}');
      await user.click(screen.getByRole('link', { name: '«page 6»' }));
      await user.keyboard('{/Control}');
    } finally {
      window.removeEventListener('click', stop);
    }

    expect(history).toEqual([]);
    // The component left the default action to the browser.
    expect(prevented).toBe(true);
  });

  it('formats page numbers and counts for the locale', async () => {
    const { user } = renderListing('?page=5', undefined, 'rtl', 'ar-EG');
    const nav = screen.getByRole('navigation', { name: '«pagination»' });

    // Arabic-Indic digits: ١ ٤ ٥ ٦ ١٠; accessible names stay the app's labels.
    expect(within(nav).getByRole('link', { name: '«page 10»' }).textContent).toBe('١٠');
    expect(within(nav).getByRole('link', { name: '«page 5 sur 10»' }).textContent).toBe('٥');
    await user.click(screen.getByRole('button', { name: '«déclencheur 0»' }));
    const bot = screen.getAllByRole('option').find((o) => o.getAttribute('data-value') === 'bot');

    expect(bot?.querySelector('[data-slot="facet-options-count"]')?.textContent).toBe('٥');
  });

  it('passes the reading direction to the ellipsis menus', async () => {
    const { user } = renderListing('?page=5', undefined, 'rtl');

    await user.click(screen.getByRole('button', { name: '«pages 7,8,9»' }));
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('rtl');
  });
});

describe('listing options', () => {
  /** The facets and their reset behind the gear, the sort beside it, as a listing holds them. */
  const options = (binding: FacetedCollectionBinding) => (
    <>
      <SortSelect binding={binding} labels={SORT} />
      <ListingOptions binding={binding} labels={OPTIONS} locale="fr" icon={<svg data-test="gear" />}>
        <FacetOptions binding={binding} facet="tags" labels={FACET} locale="fr" />
        <FacetsReset binding={binding} labels={{ reset: '«réinitialiser»' }} />
      </ListingOptions>
    </>
  );

  it('passes axe, closed and open, the app’s icon hidden from assistive technologies', async () => {
    const { user } = renderListing('', options);
    const gear = screen.getByRole('button', { name: '«options 0»' });

    expect(await violations()).toEqual([]);
    expect(gear.querySelector('[data-test="gear"]')?.closest('[aria-hidden]')).not.toBeNull();
    await user.click(gear);
    expect(await violations(screen.getByRole('dialog', { name: '«options de la liste»' }))).toEqual([]);
  });

  it('shows how many terms are selected, in its name too, and no count without any', () => {
    renderListing('?tags=bot&tags=guide', options);
    const gear = screen.getByRole('button', { name: '«options 2»' });

    expect(gear.querySelector('[data-slot="listing-options-count"]')?.textContent).toBe('2');
    cleanup();
    renderListing('', options);
    expect(document.querySelector('[data-slot="listing-options-count"]')).toBeNull();
  });

  it('keeps the panel open while a widget’s list opened in it chooses a term', async () => {
    const { user, history } = renderListing('', options);

    await user.click(screen.getByRole('button', { name: '«options 0»' }));
    const panel = screen.getByRole('dialog', { name: '«options de la liste»' });

    await user.click(within(panel).getByRole('button', { name: '«déclencheur 0»' }));
    await user.click(screen.getByRole('option', { name: /«terme bot»/ }));
    expect(history.at(-1)).toBe('?tags=bot');
    expect(screen.getByRole('dialog', { name: '«options de la liste»' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '«options 1»' })).toBeTruthy();
  });

  it('renders no text of its own, open with a selection: its texts the labels’, its count digits', async () => {
    const { user } = renderListing('?tags=bot', options);

    await user.click(screen.getByRole('button', { name: '«options 1»' }));
    // Precondition: the panel and its widgets rendered their texts.
    expect(texts()).toContain('«options de la liste»');
    expect(texts().filter((text) => !allowed(text))).toEqual([]);
  });

  it('keyboard: ↑ ↓ Home End move from a widget to the next, wrapping; a key in a widget’s list is the list’s', async () => {
    const { user } = renderListing('?tags=bot', options);

    screen.getByRole('button', { name: '«options 1»' }).focus();
    await user.keyboard('{Enter}');
    const tags = screen.getByRole('button', { name: '«déclencheur 1»' });
    const reset = screen.getByRole('button', { name: '«réinitialiser»' });

    expect(focused()).toBe(tags);

    for (const [key, expected] of [
      ['{ArrowDown}', reset],
      ['{ArrowDown}', tags],
      ['{ArrowUp}', reset],
      ['{Home}', tags],
      ['{End}', reset],
    ] as const) {
      await user.keyboard(key);
      expect(focused(), key).toBe(expected);
    }

    // Inside the tags' list, ↓ moves through its options: the panel's focus stays where the list put it.
    reset.focus();
    tags.focus();
    await user.keyboard('{Enter}');
    const input = screen.getByRole('combobox', { name: '«filtrer»' });

    expect(focused()).toBe(input);
    await user.keyboard('{ArrowDown}');
    expect(focused()).toBe(input);
  });

  it('keyboard: Enter opens the panel, Escape closes it, focus back on the gear', async () => {
    const { user } = renderListing('', options);
    const gear = screen.getByRole('button', { name: '«options 0»' });

    gear.focus();
    await user.keyboard('{Enter}');
    const panel = screen.getByRole('dialog', { name: '«options de la liste»' });

    expect(panel.contains(focused())).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '«options de la liste»' })).toBeNull();
    expect(focused()).toBe(gear);
  });
});

describe('conventions', () => {
  it('renders no text of its own: every text and aria attribute comes from the labels', async () => {
    const { user } = renderListing('?tags=bot&page=2');
    const seen = new Set<string>();
    const collect = (): void => {
      for (const text of texts()) seen.add(text);
    };

    collect();
    await user.click(screen.getByRole('button', { name: '«déclencheur 1»' }));
    collect();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('combobox', { name: '«trier»' }));
    collect();
    await user.keyboard('{Escape}');
    // Precondition: the components rendered texts at all.
    expect(seen.size).toBeGreaterThan(10);
    expect([...seen].filter((text) => !allowed(text))).toEqual([]);
  });

  it('every part carries its data-slot and forwards className and props', async () => {
    const { user } = renderListing('?page=5', (binding) => (
      <>
        <FacetOptions binding={binding} facet="tags" labels={FACET} locale="fr">
          <FacetOptionsTrigger className="t" data-test="trigger" />
          <FacetOptionsContent className="c">
            <FacetOptionsInput className="i" />
            <FacetOptionsList className="l" />
          </FacetOptionsContent>
        </FacetOptions>
        <Pagination binding={binding} labels={PAGES} locale="fr" className="n">
          <PaginationContent className="u">
            <PaginationItem className="li">
              <PaginationLink page={1} className="a" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </>
    ));

    await user.click(screen.getByRole('button', { name: '«déclencheur 0»' }));
    const slots: Readonly<Record<string, string>> = {
      'facet-options-trigger': 't',
      'facet-options-content': 'c',
      'facet-options-input': 'i',
      'facet-options-list': 'l',
      pagination: 'n',
      'pagination-content': 'u',
      'pagination-item': 'li',
      'pagination-link': 'a',
    };

    for (const [slot, className] of Object.entries(slots)) {
      const element = document.querySelector(`[data-slot="${slot}"]`);

      expect(element?.classList.contains(className), slot).toBe(true);
    }

    expect(document.querySelector('[data-slot="facet-options-trigger"]')?.getAttribute('data-test')).toBe('trigger');
    expect(document.querySelectorAll('[data-slot="facet-options-item"]')).toHaveLength(3);
  });

  it('a part outside its root is a usage error naming both', () => {
    const silence = console.error;

    console.error = () => undefined;

    try {
      expect(() => act(() => render(<PaginationLink page={1} />))).toThrow(
        '<PaginationLink> must be rendered inside <Pagination>.',
      );
    } finally {
      console.error = silence;
    }
  });
});

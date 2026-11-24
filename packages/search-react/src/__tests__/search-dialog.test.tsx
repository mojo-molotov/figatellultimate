// @vitest-environment happy-dom
import { createSearch } from '@figatellultimate/search';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchDialog, type SearchBoxLabels, type SearchDialogLabels } from '../index.js';
import { searchShortcutScript } from '../scripts.js';

type Collection = 'pages' | 'blog';
const pagefind = {
  search: () =>
    Promise.resolve({
      results: [
        {
          data: () =>
            Promise.resolve({ url: '/a', excerpt: '«x»', meta: { title: '«A»' }, filters: { collection: ['pages'] } }),
        },
      ],
    }),
};
const BOX: SearchBoxLabels<Collection> = {
  input: '«rechercher»',
  placeholder: '«tapez»',
  collection: (c) => `«${c}»`,
  results: '«résultats»',
  status: { tooShort: () => '«court»', searching: '«recherche»', unavailable: '«indispo»', found: () => '«trouvé»' },
  more: '«plus»',
};
const LABELS = { trigger: '«Rechercher»', title: '«Recherche»', close: '«Fermer»' };

const SHORTCUT = { mac: '«⌘ K»', other: '«Ctrl K»' };

function renderDialog(options: { labels?: SearchDialogLabels; hotkey?: boolean } = {}) {
  const opened: string[] = [];
  const search = createSearch<Collection>({
    collections: ['pages', 'blog'],
    locale: 'fr',
    debounce: 0,
    load: () => Promise.resolve(pagefind),
  });
  const user = userEvent.setup();

  render(
    <main>
      <SearchDialog
        search={search}
        filter={{ collections: ['pages', 'blog'], label: '«collections»' }}
        labels={options.labels ?? LABELS}
        boxLabels={BOX}
        onNavigate={(url) => opened.push(url)}
        {...(options.hotkey === undefined ? {} : { hotkey: options.hotkey })}
      />
    </main>,
  );

  return { user, opened, trigger: () => screen.getByRole('button', { name: '«Rechercher»' }) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SearchDialog', () => {
  it('is a button named by its visible text; open, a modal dialog named by its title; axe passes', async () => {
    const { user, trigger } = renderDialog();

    expect((await axe.run(document.body, { rules: { region: { enabled: false } } })).violations).toEqual([]);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: '«Recherche»' });

    // Radix hides the rest of the page while the modal is open: the dialog itself is checked.
    expect((await axe.run(dialog)).violations).toEqual([]);
  });

  it('keyboard: Enter opens it with focus in the field, Escape closes it back to the trigger', async () => {
    const { user, trigger } = renderDialog();

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: '«rechercher»' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('⌘K or Ctrl+K opens it from anywhere', async () => {
    const { user } = renderDialog();

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: '«Recherche»' })).toBeDefined();
  });

  it('opening a result closes the dialog and navigates', async () => {
    const { user, trigger, opened } = renderDialog();

    await user.click(trigger());
    await user.keyboard('abc');
    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1);
    });
    await user.keyboard('{Enter}');
    expect(opened).toEqual(['/a']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['an Apple platform', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'mac'],
    ['any other', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'other'],
  ])(
    'shows its shortcut after its label on %s, from the first paint (the script) and once hydrated',
    (_, agent, platform) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
      const { trigger } = renderDialog({ labels: { ...LABELS, shortcut: SHORTCUT } });
      const shortcut = trigger().querySelector('kbd[data-slot="search-dialog-shortcut"]');

      // Seen, not heard: the button keeps its label as its name, the shortcut told by `aria-keyshortcuts`.
      expect(trigger().getAttribute('aria-keyshortcuts')).toBe('Meta+K Control+K');
      expect(shortcut?.getAttribute('aria-hidden')).toBe('true');
      expect(trigger().lastElementChild).toBe(shortcut);
      expect(shortcut?.getAttribute('data-platform')).toBe(platform);
      expect(shortcut?.textContent).toBe('«⌘ K»«Ctrl K»');
      // Before hydration, the page's inline script marks it the same.
      shortcut?.removeAttribute('data-platform');
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the inline script's own text, run as the page would.
      new Function(searchShortcutScript)();

      expect(shortcut?.getAttribute('data-platform')).toBe(platform);
    },
  );

  it('shows no shortcut without its labels, and announces none with the hotkey off', () => {
    const { trigger } = renderDialog({ labels: { ...LABELS, shortcut: SHORTCUT }, hotkey: false });

    expect(trigger().querySelector('kbd')).toBeNull();
    expect(trigger().hasAttribute('aria-keyshortcuts')).toBe(false);
    cleanup();
    renderDialog();
    expect(screen.getByRole('button', { name: '«Rechercher»' }).querySelector('kbd')).toBeNull();
  });

  it('the close button is named by its label', async () => {
    const { user, trigger } = renderDialog();

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: '«Fermer»' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

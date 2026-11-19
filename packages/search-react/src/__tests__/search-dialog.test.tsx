// @vitest-environment happy-dom
import { createSearch } from '@figatellultimate/search';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchDialog, type SearchBoxLabels } from '../index.js';

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

function renderDialog() {
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
        labels={LABELS}
        boxLabels={BOX}
        onNavigate={(url) => opened.push(url)}
      />
    </main>,
  );

  return { user, opened, trigger: () => screen.getByRole('button', { name: '«Rechercher»' }) };
}

afterEach(() => {
  cleanup();
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

  it('the close button is named by its label', async () => {
    const { user, trigger } = renderDialog();

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: '«Fermer»' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

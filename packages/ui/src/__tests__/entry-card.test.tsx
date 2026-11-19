// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryCard } from '../index.js';

function renderCard(locale = 'fr') {
  const user = userEvent.setup();

  render(
    <main>
      <EntryCard
        href="/blog/news/bot/post-01"
        title="«Le bot démarre»"
        description="«Une description»"
        image="/covers/post-01.svg"
        date="2026-11-12"
        locale={locale}
        tags={[{ key: 'bot', label: '«Bot»' }]}
        authors={[
          { key: 'gustave', name: '«Gustave»', avatar: '/authors/gustave.svg', bio: '«Écrit le bot.»' },
          { key: 'arnaud', name: '«Arnaud»' },
        ]}
        labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
      />
    </main>,
  );

  return { user };
}

afterEach(() => {
  cleanup();
});

describe('EntryCard', () => {
  it('is an article named by its title link, the image decorative, and passes axe', async () => {
    renderCard();
    const article = screen.getByRole('article');

    expect(within(article).getByRole('link', { name: '«Le bot démarre»' }).getAttribute('href')).toBe(
      '/blog/news/bot/post-01',
    );
    // One link for assistive technologies: the image's is hidden and out of the tab order.
    expect(within(article).getAllByRole('link')).toHaveLength(1);
    expect((await axe.run(document.body, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });

  it('shows the date for the locale, without shifting it by a day', () => {
    renderCard('fr');
    expect(screen.getByText('12 novembre 2026').getAttribute('datetime')).toBe('2026-11-12');
    cleanup();
    renderCard('en');
    expect(screen.getByText('November 12, 2026')).toBeDefined();
  });

  it('names its lists by the labels, tags and authors from the app', () => {
    renderCard();
    expect(within(screen.getByRole('list', { name: '«Tags»' })).getByText('«Bot»')).toBeDefined();
    expect(within(screen.getByRole('list', { name: '«Auteurs»' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('keyboard: an author with a bio is focusable and opens its preview on focus', async () => {
    const { user } = renderCard();

    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('«Gustave»');
    expect(await screen.findByText('«Écrit le bot.»')).toBeDefined();
    // An author without a bio is plain text: not in the tab order.
    await user.tab();
    expect(document.activeElement?.textContent).not.toBe('«Arnaud»');
  });

  it('an author with a page is a link to it, still previewing its bio on focus, and passes axe', async () => {
    const user = userEvent.setup();

    render(
      <main>
        <EntryCard
          href="/blog/news/bot/post-01"
          title="«Le bot démarre»"
          locale="fr"
          authors={[
            { key: 'gustave', name: '«Gustave»', bio: '«Écrit le bot.»', href: '/authors/gustave' },
            { key: 'arnaud', name: '«Arnaud»', href: '/authors/arnaud' },
          ]}
          labels={{ tags: '«Tags»', authors: '«Auteurs»' }}
        />
      </main>,
    );
    const gustave = screen.getByRole('link', { name: '«Gustave»' });

    expect(gustave.getAttribute('href')).toBe('/authors/gustave');
    // Without a bio, still a link: the page is the point.
    expect(screen.getByRole('link', { name: '«Arnaud»' }).getAttribute('href')).toBe('/authors/arnaud');
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(gustave);
    expect(await screen.findByText('«Écrit le bot.»')).toBeDefined();
    expect((await axe.run(document.body, { rules: { region: { enabled: false } } })).violations).toEqual([]);
  });

  it('renders no text of its own', () => {
    renderCard();
    const texts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';

      if (text !== '') texts.push(text);
    }

    // Every text is the app's data, or the date the locale formats.
    expect(texts.filter((text) => !/^«[^«»]*»$/.test(text) && text !== '12 novembre 2026')).toEqual([]);
  });
});

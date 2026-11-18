import { describe, expect, it } from 'vitest';

import { breadcrumbOf, type NavigationNode } from '../index.js';

const ITEMS: readonly NavigationNode[] = [
  { kind: 'entry', url: '/', title: 'Accueil', key: '' },
  {
    kind: 'section',
    label: 'content.pages.docs.$.title',
    url: '/docs',
    children: [{ kind: 'entry', url: '/docs/setup', title: 'Installation', key: 'docs/setup' }],
  },
  {
    kind: 'section',
    label: 'nav.blog',
    children: [
      {
        kind: 'section',
        label: 'content.blog.news.$.title',
        children: [{ kind: 'section', label: 'content.blog.news.bot.$.title', url: '/blog/news/bot', children: [] }],
      },
    ],
  },
];

const picture = (crumbs: ReturnType<typeof breadcrumbOf>): string[] =>
  crumbs.map((c) => `${c.label}${c.url === undefined ? '' : ` → ${c.url}`}${c.current ? ' (current)' : ''}`);

describe('breadcrumbOf', () => {
  it('goes from the home down to a listed page', () => {
    expect(picture(breadcrumbOf(ITEMS, '/docs/setup'))).toEqual([
      'Accueil → /',
      'content.pages.docs.$.title → /docs',
      'Installation → /docs/setup (current)',
    ]);
  });

  it('a section page is the last step, sections without a page are text', () => {
    expect(picture(breadcrumbOf(ITEMS, '/blog/news/bot'))).toEqual([
      'Accueil → /',
      'nav.blog',
      'content.blog.news.$.title',
      'content.blog.news.bot.$.title → /blog/news/bot (current)',
    ]);
  });

  it('hangs a page the navigation does not list from the deepest section holding it, then its title', () => {
    expect(picture(breadcrumbOf(ITEMS, '/blog/news/bot/post-01', 'Le bot démarre'))).toEqual([
      'Accueil → /',
      'nav.blog',
      'content.blog.news.$.title',
      'content.blog.news.bot.$.title → /blog/news/bot',
      'Le bot démarre → /blog/news/bot/post-01 (current)',
    ]);
  });

  it('is the home alone on the home page, and never matches a section by a mere prefix of its name', () => {
    expect(picture(breadcrumbOf(ITEMS, '/'))).toEqual(['Accueil → / (current)']);
    // `/docsy` is not under `/docs`.
    expect(picture(breadcrumbOf(ITEMS, '/docsy', 'Docsy'))).toEqual(['Accueil → /', 'Docsy → /docsy (current)']);
  });
});

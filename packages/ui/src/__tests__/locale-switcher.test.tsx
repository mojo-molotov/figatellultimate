// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { LocaleSwitcher, type LocaleLink, type LocaleSwitcherLabels } from '../index.js';

const LINKS: readonly LocaleLink[] = [
  { locale: 'fr', url: '/docs/advanced', kind: 'entry', current: true },
  { locale: 'en', url: '/en/docs', kind: 'ancestor', current: false },
  { locale: 'ar', url: '/ar', kind: 'home', current: false },
];
const NAMES: Readonly<Record<string, string>> = { fr: '«Français»', en: '«English»', ar: '«العربية»' };
const LABELS: LocaleSwitcherLabels = { language: '«Langue»' };

function renderSwitcher(dir?: 'ltr' | 'rtl') {
  const user = userEvent.setup();

  render(
    <header>
      <LocaleSwitcher links={LINKS} names={(locale) => NAMES[locale] ?? locale} labels={LABELS} dir={dir} />
    </header>,
  );

  return { user, trigger: () => screen.getByRole('button', { name: '«Langue» «Français»' }) };
}

async function violations(context: Element = document.body): Promise<string[]> {
  const result = await axe.run(context, { rules: { region: { enabled: false } } });

  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

afterEach(() => {
  cleanup();
});

describe('LocaleSwitcher', () => {
  it('is named by its context and the current locale, the visible name included (WCAG 2.5.3)', () => {
    const { trigger } = renderSwitcher();

    expect(trigger().textContent).toContain('«Français»');
  });

  it('passes axe, closed and open', async () => {
    const { user, trigger } = renderSwitcher();

    expect(await violations()).toEqual([]);
    await user.click(trigger());
    expect(await violations(screen.getByRole('menu'))).toEqual([]);
  });

  it('links every locale, each name in its own language, the current one marked', async () => {
    const { user, trigger } = renderSwitcher();

    await user.click(trigger());
    const items = screen.getAllByRole('menuitem');

    expect(items.map((item) => item.getAttribute('href'))).toEqual(['/docs/advanced', '/en/docs', '/ar']);
    expect(items.map((item) => item.getAttribute('hreflang'))).toEqual(['fr', 'en', 'ar']);
    expect(items[0]?.getAttribute('aria-current')).toBe('page');
    expect(items[2]?.querySelector('[data-slot="locale-switcher-name"]')?.getAttribute('lang')).toBe('ar');
  });

  it('only lists the locales, by their names: no note on an untranslated page', async () => {
    const { user, trigger } = renderSwitcher();

    await user.click(trigger());
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '«Français»',
      '«English»',
      '«العربية»',
    ]);
  });

  it('keyboard: Enter opens on the first item, ↓ moves, Escape closes back to the trigger', async () => {
    const { user, trigger } = renderSwitcher();

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement?.getAttribute('href')).toBe('/docs/advanced');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('href')).toBe('/en/docs');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger());
  });

  it('passes the reading direction to the menu', async () => {
    const { user, trigger } = renderSwitcher('rtl');

    await user.click(trigger());
    expect(screen.getByRole('menu').getAttribute('dir')).toBe('rtl');
  });
});

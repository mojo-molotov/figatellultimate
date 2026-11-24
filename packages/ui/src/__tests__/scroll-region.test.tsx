// @vitest-environment happy-dom
// A region's Tab stop follows its overflow: only a real browser lays it out (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeBlock, CodeTabs, ScrollRegion } from '../index.js';

const inBrowser = !navigator.userAgent.includes('HappyDOM');
const COPY = { copy: '«copier»', copied: '«copié»' };

afterEach(() => {
  cleanup();
});

/** A snippet as the MDX gives it: Shiki's `pre`, its `tabindex="0"` included. */
const snippet = (code: string) => (
  <CodeBlock labels={COPY} tabIndex={0}>
    <code>{code}</code>
  </CodeBlock>
);

describe('ScrollRegion and the code blocks: a Tab stop only while they overflow', () => {
  it('ignores a highlighter’s tabindex, and gives a tab panel no stop of its own', () => {
    render(
      <CodeTabs labels={{ list: '«gestionnaire»' }}>
        <div data-label="npm">{snippet('npm install')}</div>
        <div data-label="pnpm">{snippet('pnpm add')}</div>
      </CodeTabs>,
    );

    for (const pre of document.querySelectorAll('[data-slot="code-block-pre"]'))
      expect(pre.hasAttribute('tabindex')).toBe(false);

    for (const panel of screen.getAllByRole('tabpanel', { hidden: true }))
      expect(panel.getAttribute('tabindex')).toBe('-1');
  });

  it.skipIf(!inBrowser)('takes a stop while it overflows, and loses it once it fits', async () => {
    render(
      <div style={{ width: '200px' }} data-testid="column">
        <ScrollRegion data-testid="region" style={{ overflow: 'auto' }}>
          <div style={{ width: '600px', height: '20px' }} />
        </ScrollRegion>
      </div>,
    );
    const region = screen.getByTestId('region');

    await waitFor(() => {
      expect(region.getAttribute('tabindex')).toBe('0');
    });
    screen.getByTestId('column').style.width = '800px';
    await waitFor(() => {
      expect(region.hasAttribute('tabindex')).toBe(false);
    });
  });

  it.skipIf(!inBrowser)(
    'goes by Tab straight to the copy button of code that fits, and from the tabs to it',
    async () => {
      render(
        <main style={{ width: '700px' }}>
          <button type="button">«avant»</button>
          {snippet('npm install')}
          <CodeTabs labels={{ list: '«gestionnaire»' }}>
            <div data-label="npm">{snippet('npm install')}</div>
            <div data-label="pnpm">{snippet('pnpm add')}</div>
          </CodeTabs>
        </main>,
      );
      const user = userEvent.setup();
      const [plain, tabbed] = screen.getAllByRole('button', { name: '«copier»' });

      // Laid out, measured: no code overflows.
      await new Promise((resolve) => setTimeout(resolve, 100));
      screen.getByRole('button', { name: '«avant»' }).focus();
      await user.tab();
      expect(document.activeElement).toBe(plain);
      await user.tab();
      expect(document.activeElement?.getAttribute('role')).toBe('tab');
      await user.tab();
      expect(document.activeElement).toBe(tabbed);
    },
  );
});

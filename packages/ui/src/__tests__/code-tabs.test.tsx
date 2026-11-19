// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeTabs } from '../index.js';

const LABELS = { list: '«gestionnaire»' };

/** A block of variants, one per label. */
function Block({ name, labels }: { readonly name: string; readonly labels: readonly string[] }) {
  return (
    <section aria-label={name}>
      <CodeTabs labels={LABELS}>
        {labels.map((label) => (
          <div key={label} data-label={label}>
            <pre>{`${label} install`}</pre>
          </div>
        ))}
      </CodeTabs>
    </section>
  );
}

const block = (name: string) => within(screen.getByRole('region', { name }));
const selected = (name: string): string | undefined =>
  block(name)
    .getAllByRole('tab')
    .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent ?? undefined;
/** What a block shows: its active panel's code. */
const shown = (name: string): string | undefined =>
  screen.getByRole('region', { name }).querySelector('[data-slot="code-tabs-content"][data-state="active"] pre')
    ?.textContent ?? undefined;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CodeTabs', () => {
  it('shows a tab per labelled variant, named by its label, the first chosen, every variant prerendered', () => {
    render(<Block name="a" labels={['npm', 'pnpm', 'Yarn']} />);

    expect(block('a').getByRole('tablist', { name: '«gestionnaire»' })).toBeTruthy();
    expect(
      block('a')
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['npm', 'pnpm', 'Yarn']);
    expect(selected('a')).toBe('npm');
    expect(shown('a')).toBe('npm install');
    expect(screen.getByRole('region', { name: 'a' }).querySelectorAll('pre')).toHaveLength(3);
  });

  it('a choice in one block chooses it in every block that has it, and is remembered', async () => {
    const user = userEvent.setup();

    render(
      <>
        <Block name="a" labels={['npm', 'pnpm']} />
        <Block name="b" labels={['npm', 'pnpm', 'Bun']} />
        <Block name="c" labels={['npm', 'Yarn']} />
      </>,
    );
    await user.click(block('a').getByRole('tab', { name: 'pnpm' }));

    expect([selected('a'), selected('b')]).toEqual(['pnpm', 'pnpm']);
    expect(shown('b')).toBe('pnpm install');
    // A block without that variant keeps its first one.
    expect(selected('c')).toBe('npm');

    cleanup();
    render(<Block name="later" labels={['npm', 'pnpm']} />);

    expect(selected('later')).toBe('pnpm');
  });

  it('moves through the tabs with the arrows, and passes axe', async () => {
    const user = userEvent.setup();

    render(<Block name="a" labels={['npm', 'pnpm']} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(document.activeElement?.textContent).toBe('pnpm');

    await user.keyboard('{Enter}');

    expect(selected('a')).toBe('pnpm');

    const results = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(results.violations).toEqual([]);
  });
});

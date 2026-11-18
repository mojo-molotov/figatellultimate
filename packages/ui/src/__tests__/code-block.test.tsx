// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodeBlock } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const LABELS = { copy: '«copier le code»', copied: '«copié»' };
const CODE = 'const a = 1;\nconst b = `<${a}>`;\n';

/** A block as Shiki renders it: a `pre` with its classes and style, a `code` of line spans. */
function Block() {
  return (
    <CodeBlock labels={LABELS} className="shiki shiki-themes" style={{ backgroundColor: 'var(--shiki-light-bg)' }}>
      <code>
        {CODE.split('\n').map((line, index) => (
          <span key={index} className="line">
            {line}
            {index < CODE.split('\n').length - 1 ? '\n' : ''}
          </span>
        ))}
      </code>
    </CodeBlock>
  );
}

const status = (): Element | null => document.querySelector('[data-slot="code-block-status"]');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CodeBlock', () => {
  it('forwards its props to the pre, names its button by the label, and passes axe', async () => {
    render(<Block />);
    const pre = document.querySelector('pre');

    expect(pre?.getAttribute('data-slot')).toBe('code-block-pre');
    expect(pre?.className).toBe('shiki shiki-themes');
    expect(pre?.getAttribute('style')).toContain('--shiki-light-bg');
    const button = screen.getByRole('button', { name: '«copier le code»' });

    expect(button.getAttribute('data-state')).toBe('idle');
    expect(status()?.getAttribute('aria-live')).toBe('polite');
    expect(status()?.textContent).toBe('');
    const result = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(result.violations).toEqual([]);
  });

  it('copies the exact code (not the button), with the keyboard (Enter, Space)', async () => {
    const user = userEvent.setup();

    render(<Block />);
    const button = screen.getByRole('button', { name: '«copier le code»' });

    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard('{Enter}');
    // Precondition: the clipboard did not already hold it, so a no-op cannot pass.
    expect(CODE).not.toBe('');
    expect(await navigator.clipboard.readText()).toBe(CODE);
    await navigator.clipboard.writeText('');
    await user.keyboard(' ');
    expect(await navigator.clipboard.readText()).toBe(CODE);
  });

  /**
   * Fake timeouts from the start (the confirmation's delay is scheduled by the click), clicks in an async `act` that
   * flushes the clipboard's promise; `userEvent.setup()` only installs its clipboard stub.
   */
  const withFakeTimers = () => {
    userEvent.setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    return {
      click: async (element: HTMLElement): Promise<void> => {
        await act(async () => {
          element.click();
          await Promise.resolve();
        });
      },
    };
  };
  const wait = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it('confirms a copy by its state and announces it; after 2 s it lets go, its check kept while it fades, then idle', async () => {
    const user = withFakeTimers();

    render(<Block />);
    const button = screen.getByRole('button', { name: '«copier le code»' });

    await user.click(button);
    expect(button.getAttribute('data-state')).toBe('copied');
    expect(status()?.textContent).toBe('«copié»');
    // The accessible name stays the action: the confirmation is announced, not renamed.
    expect(button.getAttribute('aria-label')).toBe('«copier le code»');
    wait(1999);
    expect(button.getAttribute('data-state')).toBe('copied');
    wait(1);
    // No longer held shown, still its check: a mouse already gone sees it fade out checked, never the clipboard.
    expect(button.getAttribute('data-state')).toBe('done');
    expect(status()?.textContent).toBe('');
    wait(150);
    expect(button.getAttribute('data-state')).toBe('idle');
  });

  it('passes axe once copied', async () => {
    const user = userEvent.setup();

    render(<Block />);
    await user.click(screen.getByRole('button', { name: '«copier le code»' }));
    const result = await axe.run(document.body, { rules: { region: { enabled: false } } });

    expect(result.violations).toEqual([]);
  });

  it('a new copy restarts the delay', async () => {
    const user = withFakeTimers();

    render(<Block />);
    const button = screen.getByRole('button', { name: '«copier le code»' });

    await user.click(button);
    wait(1500);
    await user.click(button);
    wait(1500);
    expect(button.getAttribute('data-state')).toBe('copied');
    wait(650);
    expect(button.getAttribute('data-state')).toBe('idle');
  });

  it('a refused copy changes nothing (no permission)', async () => {
    const user = userEvent.setup();

    render(<Block />);
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const button = screen.getByRole('button', { name: '«copier le code»' });

    await user.click(button);
    expect(button.getAttribute('data-state')).toBe('idle');
    expect(status()?.textContent).toBe('');
  });

  it('has no text of its own: only its labels', () => {
    render(<Block />);
    const block = document.querySelector('[data-slot="code-block"]');
    const own = (block?.textContent ?? '').replace(CODE, '');

    expect(own).toBe('');
  });
});

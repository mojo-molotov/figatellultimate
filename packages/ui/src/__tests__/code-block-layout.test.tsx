// @vitest-environment happy-dom
// Shiki's themes with the stylesheet: only a real browser computes them (`pnpm test:browser`).
import '../styles.css';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { CodeBlock } from '../index.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['theme'];
});

describe('CodeBlock, styled with Shiki’s two themes', () => {
  it.skipIf(!inBrowser)("carries Shiki's background on the block, its tokens only their color", () => {
    render(
      <CodeBlock labels={{ copy: '«copier»', copied: '«copié»' }} className="shiki shiki-themes">
        <code>
          <span>const</span>
        </code>
      </CodeBlock>,
    );
    const pre = document.querySelector('[data-slot="code-block-pre"]');
    const token = document.querySelector('[data-slot="code-block-pre"] span');

    if (!(pre instanceof HTMLElement) || !(token instanceof HTMLElement)) throw new Error('no block');

    // Shiki's output: both themes as custom properties on the block and on each token.
    for (const [name, value] of Object.entries({
      '--shiki-light': '#24292e',
      '--shiki-dark': '#e1e4e8',
      '--shiki-light-bg': '#ffffff',
      '--shiki-dark-bg': '#24292e',
    }))
      pre.style.setProperty(name, value);

    token.style.setProperty('--shiki-light', '#d73a49');
    token.style.setProperty('--shiki-dark', '#f97583');
    const looks = (theme: 'light' | 'dark') => {
      document.documentElement.dataset['theme'] = theme;

      // The theme's colors transition (120ms): measured once they are reached.
      for (const element of [pre, token]) for (const animation of element.getAnimations()) animation.finish();

      return {
        block: getComputedStyle(pre).backgroundColor,
        filter: getComputedStyle(pre).backdropFilter,
        token: getComputedStyle(token).backgroundColor,
        color: getComputedStyle(token).color,
      };
    };
    const light = looks('light');

    expect(light.block).toBe('rgb(255, 255, 255)');
    const dark = looks('dark');

    // Opaque: a translucent block is the app's choice.
    expect(dark.block).toBe('rgb(36, 41, 46)');
    expect(dark.filter === 'none' || dark.filter === '').toBe(true);
    // Each token its color, on no background of its own: the block's shows through.
    expect(dark.token).toBe('rgba(0, 0, 0, 0)');
    expect(dark.color).toBe('rgb(249, 117, 131)');
  });

  it.skipIf(!inBrowser)('stays shown while it confirms a copy, then fades out still checked', async () => {
    const user = userEvent.setup();

    render(
      <CodeBlock labels={{ copy: '«copier»', copied: '«copié»' }}>
        <code>const a = 1;</code>
      </CodeBlock>,
    );
    const button = screen.getByRole('button', { name: '«copier»' });
    const look = () => {
      for (const animation of button.getAnimations()) animation.finish();

      return {
        opacity: Number(getComputedStyle(button).opacity),
        check: getComputedStyle(button, '::before').maskImage.includes('M20'),
      };
    };

    await user.click(button);
    // Neither hovered nor focused (the mouse gone): still shown while it confirms, its check drawn.
    button.blur();
    expect(button.getAttribute('data-state')).toBe('copied');
    expect(look()).toEqual({ opacity: 1, check: true });
    // Letting go: it fades out with its check, never showing the clipboard first.
    await waitFor(() => {
      expect(button.getAttribute('data-state')).toBe('done');
    });
    expect(look()).toEqual({ opacity: 0, check: true });
  });
});

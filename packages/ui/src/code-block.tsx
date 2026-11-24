'use client';

/**
 * The code block: highlighted at build time by the app (e.g. `@shikijs/rehype`, a light and a dark theme as CSS
 * variables), copied by a button the stylesheet shows on hover and keyboard focus.
 *
 * Key design decisions:
 *     - No highlighter here: highlighting belongs to the app's MDX compilation, prerendered, no client JavaScript.
 *     - The copy is announced (a polite live region), not only shown: a screen reader user knows it worked.
 *     - The code takes a Tab stop only while it overflows (`useOverflowFocus`): Tab reaches the copy button directly,
 *       a highlighter's `tabindex` (Shiki's `0`) ignored; a wide one is still scrolled with the keyboard.
 *     - The check is kept while the button fades out after a copy, so that a mouse leaving meanwhile never sees the
 *       clipboard icon come back first.
 *
 * Invariants (`code-block.test.tsx`, in happy-dom and in real browsers): the exact text copied, the announcement,
 * the failure, axe and the keyboard.
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';

import { useOverflowFocus } from './scroll-region.js';

/** How long a copy stays confirmed. */
const COPIED_MS = 2000;

/** How long the button keeps its check once it lets go: its fade out (the stylesheet's 150ms), so that a mouse gone
 * meanwhile sees it fade out checked, never the clipboard first. */
const DONE_MS = 150;

/** Idle; confirming a copy (held shown); letting go (its check kept while it fades). */
type CopyState = 'idle' | 'copied' | 'done';

/** Every text of a code block of its own. */
export interface CodeBlockLabels {
  /** The copy button's accessible name, e.g. "Copy the code". */
  readonly copy: string;
  /** Announced once the code is copied, e.g. "Copied". */
  readonly copied: string;
}

/** The code block's props: a `<pre>`'s, plus the labels. */
export type CodeBlockProps = ComponentProps<'pre'> & { readonly labels: CodeBlockLabels };

/**
 * A code block with a copy button: the app's MDX `pre`.
 *
 * @param props - The labels, and the `<pre>`'s props, forwarded as is (Shiki's classes and styles included).
 * @returns The block and its button: the button copies the block's exact text; a copy is confirmed by its state
 *   (`data-state="copied"`, a check drawn by the stylesheet) and announced by a polite live region; a failed copy
 *   (no clipboard permission) announces nothing.
 *
 * @example
 * const components = { pre: (props) => <CodeBlock {...props} labels={{ copy: 'Copier le code', copied: 'Code copié' }} /> };
 */
export function CodeBlock({ labels, children, ...props }: CodeBlockProps): ReactNode {
  const pre = useRef<HTMLPreElement>(null);
  // In the Tab order only while it overflows (to scroll it with the keyboard), never for a highlighter's `tabindex`.
  const stop = useOverflowFocus(pre);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (): Promise<void> => {
    try {
      // The `pre` holds the code only (the button is beside it, not inside).
      await navigator.clipboard.writeText(pre.current?.textContent ?? '');
    } catch {
      // No clipboard permission: nothing was copied, so nothing is confirmed.
      return;
    }

    setState('copied');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState('done');
      timer.current = setTimeout(() => {
        setState('idle');
      }, DONE_MS);
    }, COPIED_MS);
  };

  return (
    <div data-slot="code-block">
      <pre {...props} ref={pre} tabIndex={stop} data-slot="code-block-pre">
        {children}
      </pre>
      <button
        type="button"
        data-slot="code-block-copy"
        aria-label={labels.copy}
        data-state={state}
        onClick={() => {
          void copy();
        }}
      />
      {/* Present from the start: a live region only announces what changes inside it. */}
      <span data-slot="code-block-status" aria-live="polite">
        {state === 'copied' ? labels.copied : ''}
      </span>
    </div>
  );
}

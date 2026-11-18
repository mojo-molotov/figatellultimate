'use client';

/**
 * A heart that changes color every few seconds, cross-fading from one to the next: a footer's "made with ❤️".
 *
 *     ❤️ ──(every)──> 💙 ──(every)──> 💛 …   never twice the same in a row (`nextHeart`)
 *     two slots stacked in one grid cell: the new heart is written in the hidden one, then the two swap visibility;
 *     the cell is as wide as the wider heart, so nothing is measured and nothing shifts
 *
 * Key design decisions:
 *     - Decorative: the hearts are hidden from assistive technologies; `label` ("love") is read instead.
 *     - The server renders the first heart, the client starts changing it after `every`: no hydration mismatch.
 *     - The fade is CSS (`styles.css`): instant with `prefers-reduced-motion`.
 *
 * Invariants (`hearts.test.tsx`): `nextHeart` always gives another heart of the list; the shown heart changes every
 * `every` milliseconds, never to itself; one heart shown at a time; the timer stops on unmount.
 */
import { useEffect, useState, type ReactNode } from 'react';

/** The hearts it cycles through by default. */
export const HEARTS: readonly string[] = ['❤️', '🧡', '💛', '💚', '💙', '💜', '💕', '💓', '💗', '💖'];

/**
 * The next heart: one of `values`, never `current`.
 *
 * @param values - The hearts to pick from.
 * @param current - The heart shown.
 * @param random - A number in `[0, 1)`, e.g. `Math.random()`.
 * @returns Another heart of `values`; `current` when there is no other.
 */
export function nextHeart(values: readonly string[], current: string, random: number): string {
  const others = values.filter((value) => value !== current);

  return others[Math.floor(random * others.length)] ?? current;
}

/** What `Hearts` takes. */
export interface HeartsProps {
  /** What a screen reader reads instead of the hearts, e.g. "love". */
  readonly label: string;
  /** The hearts to cycle through; default `HEARTS`, the first one shown first. */
  readonly values?: readonly string[];
  /** Milliseconds between two changes; default 10 000. */
  readonly every?: number;
  /** A source of numbers in `[0, 1)`; default `Math.random` (a seam for tests). */
  readonly random?: () => number;
}

interface Slots {
  readonly slots: readonly [string, string];
  readonly shown: 0 | 1;
}

/**
 * A heart changing color every `every` milliseconds, cross-fading.
 *
 * @param props - The label read instead of the hearts, and optionally the hearts, the delay and the randomness.
 * @returns A `data-slot="hearts"` span: two stacked hearts (`aria-hidden`), one shown at a time, and the label for
 *   screen readers.
 *
 * @example
 * <footer>figatellu · Made with <Hearts label="love" /></footer>
 */
export function Hearts({ label, values = HEARTS, every = 10_000, random = Math.random }: HeartsProps): ReactNode {
  const first = values[0] ?? '❤️';
  const [state, setState] = useState<Slots>({ slots: [first, first], shown: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      setState(({ slots, shown }) => {
        const hidden = shown === 0 ? 1 : 0;
        const next = nextHeart(values, slots[shown], random());

        return { slots: hidden === 0 ? [next, slots[1]] : [slots[0], next], shown: hidden };
      });
    }, every);

    return () => {
      clearInterval(timer);
    };
  }, [values, every, random]);

  return (
    <span data-slot="hearts">
      <span data-slot="heart" data-state={state.shown === 0 ? 'shown' : 'hidden'} aria-hidden>
        {state.slots[0]}
      </span>
      <span data-slot="heart" data-state={state.shown === 1 ? 'shown' : 'hidden'} aria-hidden>
        {state.slots[1]}
      </span>
      <span data-slot="hearts-label">{label}</span>
    </span>
  );
}

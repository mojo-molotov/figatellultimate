'use client';

/**
 * `@figatellultimate/effects`: decorative effects for figatellultimate apps, their mechanics in `styles.css`
 * (`@figatellultimate/effects/styles.css`), every look a token for a theme to set.
 *
 *     Effects ──┬─> CursorGlow  (a mouse)                         ┐ each a chunk of its own, fetched only
 *               └─> Sparkles    (a mouse and room for margins)    ┘ where it can show, never on the server
 *     Collector ── a preview card lighting up under the mouse
 *     Hearts ──── a heart changing color every few seconds, cross-fading (a footer's "made with ❤️")
 *     Reveal ──── a footer revealed from under the page as it scrolls into view, where the page has the room
 *     styles.css ── positions, masks, motion; colors and sizes as tokens (--fig-glow-*, --fig-collector-color,
 *                   --fig-sparkles-*)
 *
 * Key design decisions:
 *     - Out of `@figatellultimate/ui`, a minimal design system, and out of the themes: effects are generic components, a
 *       theme only decides where they show and how they look (`@figatellultimate/themes/maquis.css`: dark theme only).
 *     - Framework-free (`React.lazy`, media queries): no `next/dynamic`, the same effects in any React app.
 *     - Decorative: hidden from assistive technologies, never catching a click, still or absent with
 *       `prefers-reduced-motion`.
 *
 * Invariants: see `effects.tsx`, `cursor-glow.tsx`, `sparkles.tsx`, `collector.tsx`, `hearts.tsx`, `reveal.tsx` and `styles.test.ts`.
 */
export { Collector } from './collector.js';
export { CursorGlow } from './cursor-glow.js';
export { Effects } from './effects.js';
export { HEARTS, Hearts, type HeartsProps } from './hearts.js';
export { Reveal } from './reveal.js';
export { Sparkles } from './sparkles.js';

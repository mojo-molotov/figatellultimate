/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The stylesheet, comments removed (a selector named in a comment is no rule). */
const SOURCE_NO_COMMENTS = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const CSS = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule's selector and body, whitespace collapsed. */
const rules = [...CSS.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: (match[1] ?? '').replace(/\s+/g, ' ').trim(),
  body: (match[2] ?? '').replace(/\s+/g, ' ').trim(),
}));

/** The effects laid over the page: never catching a pointer. */
const LAYERS = ['collector', 'sparkles', 'cursor-glow', 'backdrop'];
const SLOTS = [...LAYERS, 'hearts', 'heart', 'hearts-label', 'reveal', 'reveal-content', 'backdrop-image'];
/** The tokens' rules: the page's root, and its dark theme (chosen, or the system's). */
const ROOTS = [':root', ":root[data-theme='dark']", ":root:not([data-theme='light'])"];
/** A keyframe's steps (`from`, `to`, `50%`) are not rules of the page. */
const KEYFRAME = /^(from|to|\d+%)$/;

/** The stylesheet as written, comments removed, media blocks kept. */
const SOURCE = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('styles.css', () => {
  it("targets the effects' slots only, besides the tokens", () => {
    // Precondition: the stylesheet has rules to check.
    expect(rules.length).toBeGreaterThan(5);

    for (const { selector } of rules.filter((rule) => !KEYFRAME.test(rule.selector)))
      expect(
        ROOTS.includes(selector) || SLOTS.some((slot) => selector.includes(`[data-slot='${slot}']`)),
        selector,
      ).toBe(true);
  });

  it.each(LAYERS)('never lets %s catch a pointer', (slot) => {
    const own = rules.filter(
      ({ selector, body }) => selector.includes(`[data-slot='${slot}']`) && body.includes('position'),
    );

    expect(own.length).toBeGreaterThan(0);
    const layers = rules.filter(
      ({ selector, body }) => selector.includes(`[data-slot='${slot}']`) && /position: (fixed|absolute)/.test(body),
    );

    for (const { selector, body } of layers) expect(body, selector).toContain('pointer-events: none');
  });
  it("keeps a card's hover effects to a mouse or a trackpad: a touch screen's tap would leave them stuck", () => {
    // Outside the fine pointers' blocks (and the reduced motion's, which only cancels the zoom), no card hovered.
    const rest = SOURCE_NO_COMMENTS.replace(
      /@media \((?:hover: hover\) and \(pointer: fine|prefers-reduced-motion: reduce)\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      '',
    );
    const hovered = [...rest.matchAll(/([^{}]+)\{/g)]
      .map(([, selector]) => (selector ?? '').trim())
      .filter((selector) => selector.includes(':hover') && /entry-card|collector/.test(selector));

    // Precondition: the stylesheet does have card hover effects, in their block.
    expect(SOURCE_NO_COMMENTS).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[^@]*:hover/);
    expect(hovered).toEqual([]);
  });

  it('fades the backdrop in only for those who accept motion', () => {
    const animated = rules.filter(
      ({ selector, body }) => selector.includes("[data-slot='backdrop-image']") && body.includes('animation:'),
    );
    const still = [...SOURCE.matchAll(/@media \(prefers-reduced-motion: reduce\) \{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)]
      .map(([, body]) => body ?? '')
      .join('');

    // Precondition: the backdrop does fade in.
    expect(animated.length).toBeGreaterThan(0);
    expect(still).toMatch(/\[data-slot='backdrop-image'\][^{]*\{[^}]*animation: none/);
  });

  it('shows the cursor glow and the sparkles on a screen only, never on paper', () => {
    // Every rule showing them sits in a `@media screen …` block.
    const showing = [...SOURCE.matchAll(/@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].filter(([, , body]) =>
      /\[data-slot='(cursor-glow|sparkles)'\][^{]*\{[^}]*display: block/.test(body ?? ''),
    );

    // Precondition: the stylesheet shows them somewhere.
    expect(showing.length).toBeGreaterThan(0);

    for (const [, condition] of showing) expect(condition?.trim()).toMatch(/^screen and /);
  });
});

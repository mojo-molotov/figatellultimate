/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOC_WIDE_MEDIA } from '../index.js';

/** The stylesheet, comments removed (a selector named in a comment is no rule). */
const SOURCE_NO_COMMENTS = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const CSS = readFileSync(join(import.meta.dirname, '..', 'styles.css'), 'utf8');

/** The tokens declared in the rule whose selector is `selector`. */
function declared(selector: string): Record<string, string> {
  const at = CSS.indexOf(`${selector} {`);

  if (at === -1) throw new Error(`no rule ${selector}`);

  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));

  return Object.fromEntries(
    [...body.matchAll(/(--fig-[\w-]+):\s*([^;]+);/g)].map((m): [string, string] => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

/** Every property of the first rule whose selector is `selector`. */
function propertiesOf(selector: string): Record<string, string> {
  const at = CSS.indexOf(`\n${selector} {`);

  if (at === -1) throw new Error(`no rule ${selector}`);

  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at)).replace(/\/\*[\s\S]*?\*\//g, '');

  return Object.fromEntries(
    [...body.matchAll(/([\w-]+):\s*([^;]+);/g)].map((m): [string, string] => [m[1] ?? '', (m[2] ?? '').trim()]),
  );
}

/** The tokens of a theme: light from `:root`, dark from `:root[data-theme='dark']` over light. */
const tokens = (theme: 'light' | 'dark'): Record<string, string> =>
  theme === 'light' ? declared(':root') : { ...declared(':root'), ...declared(":root[data-theme='dark']") };

/** WCAG relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** Text on background pairs the stylesheet uses. */
const PAIRS: readonly [string, string][] = [
  ['--fig-fg', '--fig-bg'],
  ['--fig-fg', '--fig-surface'],
  ['--fig-muted', '--fig-bg'],
  ['--fig-muted', '--fig-surface'],
  ['--fig-accent', '--fig-bg'],
  ['--fig-accent-fg', '--fig-accent'],
  ['--fig-mark-fg', '--fig-mark-bg'],
];

describe('styles.css', () => {
  it.each(['light', 'dark'] as const)('keeps every text pair at WCAG AA (4.5:1) in the %s theme', (theme) => {
    const values = tokens(theme);

    for (const [fg, bg] of PAIRS) {
      const ratio = contrast(values[fg] ?? '', values[bg] ?? '');

      expect(ratio, `${fg} on ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("switches Shiki's code to its dark theme under the same rules as the tokens", () => {
    const body = (selector: string): string => {
      const at = CSS.indexOf(selector);

      if (at === -1) throw new Error(`no rule ${selector}`);

      return CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at))
        .replace(/\s+/g, ' ')
        .trim();
    };
    const fromSystem = body(":root:not([data-theme='light']) [data-slot='code-block-pre'].shiki span");

    expect(fromSystem).toContain('var(--shiki-dark)');
    expect(body(":root[data-theme='dark'] [data-slot='code-block-pre'].shiki span")).toBe(fromSystem);
    expect(body("[data-slot='code-block-pre'].shiki span")).toContain('var(--shiki-light)');
  });

  it('applies the same dark tokens from the system preference and from data-theme="dark"', () => {
    expect(declared(":root:not([data-theme='light'])")).toEqual(declared(":root[data-theme='dark']"));
    expect(Object.keys(declared(":root[data-theme='dark']")).length).toBeGreaterThan(5);
  });

  it('prints in the light theme, whatever the screen shows, without shadows', () => {
    const print = declared(':root:is([data-theme], :not([data-theme]))');
    const light = declared(':root');
    // Every token the dark theme changes is set back to its light value (the shadow, to none).
    const changed = Object.keys(declared(":root[data-theme='dark']"));

    expect(changed.length).toBeGreaterThan(5);
    expect(print).toEqual(
      Object.fromEntries(changed.map((token) => [token, token === '--fig-shadow' ? 'none' : light[token]])),
    );
  });

  it('hides on paper the controls that only work on a screen, and keeps the breadcrumb', () => {
    const start = CSS.indexOf('@media print');
    const print = CSS.slice(start);

    // Precondition: the stylesheet has a print block.
    expect(start).toBeGreaterThan(-1);

    for (const slot of [
      'navbar',
      'toc',
      'search-dialog-trigger',
      'locale-switcher',
      'theme-toggle',
      'code-block-copy',
      'pagination',
    ])
      expect(print).toContain(`[data-slot='${slot}']`);

    expect(print).not.toContain("[data-slot='breadcrumb']");
  });

  it('only styles figatellultimate components: every rule targets a data-slot (or defines tokens; keyframes aside)', () => {
    // A keyframe's steps (`from`, `to`) style no element: an animation's own, named by a rule that does.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...rules.matchAll(/(^|})\s*([^{}@]+?)\s*\{/g)]
      .map((m) => (m[2] ?? '').trim())
      .filter((selector) => selector !== '' && !selector.startsWith('@'));

    expect(selectors.length).toBeGreaterThan(20);
    expect(selectors.filter((selector) => !selector.startsWith(':root') && !selector.includes('data-slot'))).toEqual(
      [],
    );
  });

  it("plays the theme toggle's orbit on a click, on a desktop only, never with reduced motion, in longhands", () => {
    // A mouse or a trackpad, motion allowed: never on a touch screen.
    const desktop = '@media screen and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';
    const start = CSS.indexOf(desktop, CSS.indexOf('theme-toggle'));
    const motion = CSS.slice(start);

    // Precondition: the orbit sits in that block.
    expect(start).toBeGreaterThan(-1);

    expect(motion).toMatch(/\[data-slot='theme-toggle'\]\[data-switching\][^{]*\{[^}]*animation-duration: 600ms;/);
    // A shorthand without an animation's name: minifiers rewrite it to a zero duration, and the orbit never plays.
    expect(motion.slice(0, motion.indexOf('@keyframes fig-theme-rise'))).not.toMatch(/animation: /);
  });

  it("zooms a card's image on hover with a mouse only, never from the keyboard nor with reduced motion", () => {
    expect(CSS).not.toMatch(/:focus-visible\) \[data-slot='entry-card-image'\]/);
    expect(CSS).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\) \{\s*\[data-slot='entry-card-media'\]:hover \[data-slot='entry-card-image'\] \{\s*transform: scale\(1\.08\);/,
    );
    const reduced = CSS.slice(
      CSS.indexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf("[data-slot='entry-card-image']")),
    );

    expect(reduced).toMatch(/\[data-slot='entry-card-image'\] \{\s*transform: none;/);
  });

  it("paints the table of contents' drawer on its fixed frame, never on its scrolling panel", () => {
    // Safari on iOS paints a scrolling box's background over its content's extent only, until it is scrolled: on a
    // short list, the drawer showed the page through it.
    expect(propertiesOf("[data-slot='toc']")).toMatchObject({
      background: 'var(--fig-bg)',
      'border-inline-end': '1px solid var(--fig-border)',
    });
    expect(propertiesOf("[data-slot='toc-panel']")['background']).toBeUndefined();
    // Precondition: the panel is the one that scrolls.
    expect(propertiesOf("[data-slot='toc-panel']")['overflow-y']).toBe('auto');
  });

  it("keeps every hover effect to a mouse or a trackpad: a touch screen's tap would leave it stuck", () => {
    // Outside the fine pointers' blocks (and the reduced motion's, which only cancels effects), nothing hovered; the
    // keyboard's focus and the states keep their effects everywhere.
    const rest = SOURCE_NO_COMMENTS.replace(
      /@media \((?:hover: hover\) and \(pointer: fine|prefers-reduced-motion: reduce)\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      '',
    );
    const hovered = [...rest.matchAll(/([^{}]+)\{/g)]
      .map(([, selector]) => (selector ?? '').trim())
      .filter((selector) => selector.includes(':hover'));

    // Precondition: the stylesheet does have card hover effects, in their block.
    expect(SOURCE_NO_COMMENTS).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{[^@]*:hover/);
    expect(hovered).toEqual([]);
  });

  it("keeps nothing but hover effects to a mouse or a trackpad: a control's own look shows on a touch screen too", () => {
    // A control's box once sat in the fine pointers' block with its hover: on a phone, every button lost its style.
    const blocks = [
      ...SOURCE_NO_COMMENTS.matchAll(
        /@media \(hover: hover\) and \(pointer: fine\) \{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g,
      ),
    ];
    const selectors = blocks.flatMap(([, body]) =>
      [...(body ?? '').matchAll(/([^{}]+)\{/g)].map(([, selector]) => (selector ?? '').trim()),
    );

    // Precondition: the blocks are read, with their rules.
    expect(selectors.length).toBeGreaterThan(3);
    expect(selectors.filter((selector) => !selector.includes(':hover'))).toEqual([]);
  });

  it("sizes by the visible screen (`dvh`), `vh` only before it for an older browser: a phone's address bar hides none", () => {
    // The search dialog once sat in `80vh` from `10vh`: on an iPhone, the address bar at the bottom covered its last
    // results, out of reach.
    const declarations = [...SOURCE_NO_COMMENTS.matchAll(/([\w-]+):\s*([^;{}]*);/g)].map(([, property, value]) => ({
      property: property ?? '',
      value: value ?? '',
    }));
    const unfollowed = declarations.filter(
      ({ property, value }, index) =>
        /\d(?:\.\d+)?vh\b/.test(value) &&
        !(
          declarations[index + 1]?.property === property &&
          declarations[index + 1]?.value === value.replaceAll(/(\d(?:\.\d+)?)vh\b/g, '$1dvh')
        ),
    );

    // Precondition: the stylesheet does size by the screen's height.
    expect(declarations.filter(({ value }) => value.includes('dvh')).length).toBeGreaterThan(2);
    expect(unfollowed.map(({ property, value }) => `${property}: ${value}`)).toEqual([]);
  });

  it('keeps a full-width part within its container: its padding and border inside its width', () => {
    // The facets' filter field, `width: 100%` with a padding and a border, overflowed its own menu by both.
    const rules = [...SOURCE_NO_COMMENTS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
      selector: (selector ?? '').trim(),
      body: body ?? '',
    }));
    const overflowing = rules.filter(
      ({ body }) =>
        /(?:^|[;\s])width:\s*100%/.test(body) &&
        /(?:^|[;\s])(?:padding|border)(?:-inline)?:\s*(?=\S)(?!0[;\s]|none)/.test(body) &&
        !/box-sizing:\s*border-box/.test(body),
    );

    // Precondition: some full-width parts do have a padding or a border.
    expect(
      rules.filter(({ body }) => /width:\s*100%/.test(body) && /box-sizing:\s*border-box/.test(body)).length,
    ).toBeGreaterThan(0);
    expect(overflowing.map(({ selector }) => selector)).toEqual([]);
  });

  it("keeps the search dialog to the screen: one shrinking column, a result's long word breaks", () => {
    expect(propertiesOf("[data-slot='search-dialog-content']")['grid-template-columns']).toBe('minmax(0, 1fr)');
    expect(CSS).toMatch(
      /\n\[data-slot='search-box'\] \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/,
    );
    expect(propertiesOf("[data-slot='search-box-field']")['min-width']).toBe('0');
  });

  it("gives the search field and results the dialog's whole width on a desktop, with a floating close button that stays put while scrolling; keeps the inline close button on a narrow screen", () => {
    expect(propertiesOf("[data-slot='search-dialog-content']")['overflow-y']).toBeUndefined();
    expect(propertiesOf("[data-slot='search-dialog-body']")['overflow-y']).toBe('auto');
    expect(propertiesOf("[data-slot='search-dialog-close']")).toMatchObject({
      position: 'absolute',
      'inset-block-start': '-1.125rem',
      'inset-inline-end': '-1.125rem',
      'border-radius': 'var(--fig-radius)',
      background: 'var(--fig-bg)',
      color: 'var(--fig-muted)',
    });
    const narrow = CSS.slice(
      CSS.indexOf('@media (max-width: 36rem)', CSS.indexOf("[data-slot='search-dialog-content'] {")),
    );
    const block = narrow.slice(0, narrow.indexOf('\n}\n'));

    expect(block).toMatch(/\[data-slot='search-dialog-content'\] \{[^}]*overflow-y: auto;/);
    expect(block).toMatch(/\[data-slot='search-dialog-close'\] \{[^}]*background: transparent;/);
    expect(block).toMatch(/\[data-slot='search-box-field'\] \{\s*margin-inline-end:/);
  });

  it("takes a compact navbar's closed menu out of the layout: no empty line under the toggle", () => {
    expect(CSS).toMatch(
      /\[data-slot='navbar'\]\[data-compact\]:not\(\[data-measuring\]\)\[data-state='closed'\] \[data-slot='navbar-menu'\] \{\s*display: none;/,
    );
  });

  it('keeps a code block left to right, its copy button included, whatever the page reads', () => {
    expect(propertiesOf("[data-slot='code-block']")['direction']).toBe('ltr');
  });

  it("turns the navbar's two-line toggle into a cross while its menu is open, still with reduced motion", () => {
    // Two lines, the icon's own box drawing none.
    expect(propertiesOf("[data-slot='navbar-toggle-icon']")['background']).toBe('none');
    expect(CSS).toMatch(
      /\[data-slot='navbar-toggle'\]\[aria-expanded='true'\] \[data-slot='navbar-toggle-icon'\]::before \{\s*transform: translateY\(0\) rotate\(45deg\);/,
    );
    expect(CSS).toMatch(
      /\[data-slot='navbar-toggle'\]\[aria-expanded='true'\] \[data-slot='navbar-toggle-icon'\]::after \{\s*transform: translateY\(0\) rotate\(-45deg\);/,
    );
    // The motion only where it is welcome: the cross itself shows either way.
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-slot='navbar-toggle-icon'\]::before,\s*\[data-slot='navbar-toggle-icon'\]::after \{\s*transition: transform 150ms ease;/,
    );
  });

  it("sets a compact navbar's extras at the end of the toggle's line, the toggle at its start", () => {
    // At the line's end in the reading direction: a logical margin, right to left too.
    expect(CSS).toMatch(
      /\[data-slot='navbar'\]\[data-compact\]:not\(\[data-measuring\]\) \[data-slot='navbar-extras'\] \{\s*margin-inline-start: auto;/,
    );
  });

  it('turns the navbar compact by its measure, never by a screen width', () => {
    // Whole, it never wraps: too many links turn it compact (`navbar.tsx`), not into two lines.
    expect(propertiesOf("[data-slot='navbar']")['flex-wrap']).toBe('nowrap');
    expect(CSS).not.toMatch(/@media \(max-width: 48rem\)/);
  });

  it("shows the pagination's narrow layout on a narrow screen only, and tells its ellipses so", () => {
    const narrow = CSS.slice(
      CSS.indexOf('@media (max-width: 36rem)', CSS.indexOf("[data-slot='pagination-item'][data-layout='narrow']")),
    );
    const block = narrow.slice(0, narrow.indexOf('\n}\n'));

    expect(propertiesOf("[data-slot='pagination-item'][data-layout='narrow']")).toEqual({ display: 'none' });
    expect(block).toMatch(/\[data-slot='pagination-content'\] \{\s*--fig-pagination-layout: narrow;/);
    expect(block).toMatch(/\[data-slot='pagination-item'\]\[data-layout='wide'\] \{\s*display: none;/);
    expect(block).toMatch(/\[data-slot='pagination-item'\]\[data-layout='narrow'\] \{\s*display: list-item;/);
  });

  it("shows the pagination's step icons alone on a narrow screen, their labels hidden but still read", () => {
    const narrow = CSS.slice(
      CSS.indexOf('@media (max-width: 36rem)', CSS.indexOf("[data-slot='pagination-step-icon']")),
    );

    expect(CSS).toMatch(/\[data-slot='pagination-step-icon'\] \{\s*display: none;/);
    expect(narrow).toMatch(/\[data-slot='pagination-step-icon'\] \{\s*display: inline-flex;/);
    // Visually hidden, never `display: none`: the label stays the link's accessible name.
    const label =
      /\[data-slot='pagination-step-icon'\] \+ \[data-slot='pagination-step-label'\] \{([^}]*)\}/.exec(narrow)?.[1] ??
      '';

    expect(label).toContain('clip-path: inset(50%);');
    expect(label).not.toContain('display: none');
  });

  it('styles the page select as the sort select, part for part', () => {
    for (const part of ['trigger', 'content', 'item', 'icon', 'indicator']) {
      const count = (select: string) => CSS.split(`[data-slot='${select}-select-${part}']`).length - 1;

      // Precondition: the sort select's part is styled.
      expect(count('sort'), part).toBeGreaterThan(0);
      expect(count('page'), part).toBeGreaterThanOrEqual(count('sort'));
    }
  });

  it("shows the search shortcut but on a touch screen, the reader's keys alone", () => {
    expect(propertiesOf("[data-slot='search-dialog-shortcut']")['display']).toBe('inline-block');
    expect(CSS).toMatch(/@media \(pointer: coarse\) \{\s*\[data-slot='search-dialog-shortcut'\] \{\s*display: none;/);
    // A compact navbar has no room for it: its search button alone, beside the other controls.
    expect(CSS).toMatch(
      /\[data-slot='navbar'\]\[data-compact\]:not\(\[data-measuring\]\) \[data-slot='search-dialog-shortcut'\] \{\s*display: none;/,
    );
    // Without a mark (no script, no JavaScript): the keys of most readers.
    expect(CSS).toMatch(
      /\[data-slot='search-dialog-shortcut'\]:not\(\[data-platform='mac'\]\) \[data-platform='mac'\],\s*\[data-slot='search-dialog-shortcut'\]\[data-platform='mac'\] \[data-platform='other'\] \{\s*display: none;/,
    );
  });

  it("draws a spoken search placeholder where the native one shows: the input's cell, its padding, never clicked", () => {
    const input = propertiesOf("[data-slot='search-box-input']");
    const placeholder = propertiesOf("[data-slot='search-box-placeholder']");

    expect(propertiesOf("[data-slot='search-box-input-frame']")['display']).toBe('grid');
    expect(input['grid-area']).toBe('1 / 1');
    expect(placeholder['grid-area']).toBe('1 / 1');
    expect(`0 ${placeholder['padding-inline'] ?? ''}`).toBe(input['padding']);
    expect(placeholder['pointer-events']).toBe('none');
  });

  it("docks the table of contents at the width its component reads: one breakpoint, the stylesheet's and the code's", () => {
    // A media query cannot read a custom property: the layout and the component name the same query.
    expect(
      [...SOURCE_NO_COMMENTS.matchAll(/@media (\(min-width: \d+rem\)) \{\s*\[data-slot='toc'\]/g)].map(([, m]) => m),
    ).toEqual([TOC_WIDE_MEDIA]);
  });

  it('keeps focus visible on every component', () => {
    expect(CSS).toMatch(/\[data-slot\]:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fig-accent\)/);
  });
});

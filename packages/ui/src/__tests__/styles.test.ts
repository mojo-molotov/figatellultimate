/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

  it("zooms a card's image on its title's keyboard focus, and on hover with a mouse only, never with reduced motion", () => {
    expect(CSS).toMatch(
      /\[data-slot='entry-card'\]:has\(\[data-slot='entry-card-link'\]:focus-visible\) \[data-slot='entry-card-image'\] \{\s*transform: scale\(1\.08\);/,
    );
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

  it("keeps the search dialog to the screen: its columns shrink, a result's long word breaks", () => {
    expect(propertiesOf("[data-slot='search-dialog-content']")['grid-template-columns']).toBe('minmax(0, 1fr) auto');
    expect(CSS).toMatch(
      /\n\[data-slot='search-box'\] \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/,
    );
    expect(propertiesOf("[data-slot='search-box-field']")['min-width']).toBe('0');
  });

  it("gives the search results the dialog's whole width on a narrow screen, the close button at the field's end", () => {
    const narrow = CSS.slice(
      CSS.indexOf('@media (max-width: 36rem)', CSS.indexOf("[data-slot='search-dialog-content'] {")),
    );
    const block = narrow.slice(0, narrow.indexOf('\n}\n'));

    expect(block).toMatch(/\[data-slot='search-dialog-content'\] \{\s*grid-template-columns: minmax\(0, 1fr\);/);
    expect(block).toMatch(/\[data-slot='search-dialog-close'\] \{\s*position: absolute;/);
    expect(block).toMatch(/\[data-slot='search-box-field'\] \{\s*margin-inline-end:/);
  });

  it("sets the navbar's extras at the end of the toggle's line on a narrow screen, the toggle at its start", () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 48rem)', CSS.indexOf("[data-slot='navbar-extras']")));

    // At the line's end in the reading direction: a logical margin, right to left too.
    expect(narrow.slice(0, narrow.indexOf('\n}\n'))).toMatch(
      /\[data-slot='navbar-extras'\] \{\s*margin-inline-start: auto;/,
    );
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

  it('keeps focus visible on every component', () => {
    expect(CSS).toMatch(/\[data-slot\]:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fig-accent\)/);
  });
});

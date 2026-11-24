/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** A stylesheet, comments removed, media blocks kept. */
const sourceOf = (name: string): string =>
  readFileSync(join(import.meta.dirname, '..', `${name}.css`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule's selector and body, whitespace collapsed. */
const rulesOf = (source: string) =>
  [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] ?? '').replace(/\s+/g, ' ').trim(),
    body: (match[2] ?? '').replace(/\s+/g, ' ').trim(),
  }));

/** A selector list's selectors: split on the commas outside parentheses. */
function selectorsOf(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of list) {
    if (char === '(') depth += 1;

    if (char === ')') depth -= 1;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }

  parts.push(current.trim());

  return parts;
}

/** The media blocks of a stylesheet: each one's condition and body. */
const mediaOf = (source: string) =>
  [...source.matchAll(/@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map(([, condition, body]) => ({
    condition: (condition ?? '').trim(),
    body: body ?? '',
  }));

const gateOf = (theme: string): string => `:root:where(:not([data-site-theme]), [data-site-theme='${theme}'])`;

/** The theme's looks, written once and replayed on every theme. */
describe.each([
  { theme: 'maquis', effects: true },
  { theme: 'paper', effects: false },
])('the $theme theme', ({ theme, effects }) => {
  const source = sourceOf(theme);
  // The rules themselves, not a media block's own line (`@media … {` is parsed with the first rule inside it).
  const rules = rulesOf(source).map((rule) => ({ ...rule, selector: rule.selector.replace(/^@media[^{]*$/, '') }));
  const gate = gateOf(theme);

  it("shows its own option of the site's theme picker as chosen from the first paint, before any script runs", () => {
    const own = rules.find(({ selector }) => selector === `${gate} [data-slot='site-theme-option'][value='${theme}']`);

    expect(own?.body).toBe('border-color: var(--fig-accent); color: var(--fig-accent);');
  });

  it('gates every rule: it applies alone, or when data-site-theme names it', () => {
    // Precondition: the theme has rules.
    expect(rules.length).toBeGreaterThan(3);

    for (const rule of rules)
      for (const selector of selectorsOf(rule.selector)) expect(selector.startsWith(gate), selector).toBe(true);
  });

  it('gives the same dark looks from the system preference and from data-theme="dark"', () => {
    const fromSystem = rules.filter((rule) => rule.selector.startsWith(`${gate}:not([data-theme='light'])`));

    // Precondition: the theme has dark looks.
    expect(fromSystem.length).toBeGreaterThan(0);

    for (const rule of fromSystem) {
      const forced = rule.selector.replaceAll(`${gate}:not([data-theme='light'])`, `${gate}[data-theme='dark']`);

      expect(rules.find((candidate) => candidate.selector === forced)?.body, forced).toBe(rule.body);
    }
  });

  it(effects ? 'shows the effects on a screen, in the dark theme only' : 'shows no effect', () => {
    const showing = mediaOf(source).filter(({ body }) =>
      /\[data-slot='(cursor-glow|sparkles)'\][^{]*\{[^}]*display: block/.test(body),
    );

    expect(showing.length > 0).toBe(effects);

    for (const { condition, body } of showing) {
      expect(condition).toMatch(/^screen and /);
      expect(body).toMatch(/\[data-theme='dark'\]|:not\(\[data-theme='light'\]\)/);
    }
  });
});

describe('base.css', () => {
  const source = sourceOf('base');
  const rules = rulesOf(source);

  it('is shared: no theme gate, no color of its own outside the print margins', () => {
    // No gate (`[data-site-theme='…']`): the change of theme's own mark (`data-site-theme-switch`) is shared.
    expect(source).not.toMatch(/\[data-site-theme=/);
    expect(source.slice(0, source.indexOf('@page'))).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });

  it('blurs the page from one theme to the next, on a desktop only, never with reduced motion, in longhands', () => {
    // A mouse or a trackpad, motion allowed: never on a touch screen.
    const start = source.indexOf(
      '@media screen and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    const motion = source.slice(start);

    // Precondition: the blur sits in that block.
    expect(start).toBeGreaterThan(-1);

    // The old page blurs away; the new one shows as a blur and sharpens.
    expect(motion).toMatch(
      /:root\[data-site-theme-switch\]::view-transition-old\(root\) \{[^}]*animation-name: fig-blur-away;/,
    );
    expect(motion).toMatch(
      /:root\[data-site-theme-switch\]::view-transition-new\(root\) \{[^}]*animation-name: fig-blur-back;/,
    );
    expect(motion).toMatch(/animation-duration: 1800ms;/);
    // The page holds still while it plays: no scrolling, the scrollbar's gutter kept (one width).
    expect(motion).toMatch(/:root\[data-site-theme-switch\] \{\s*overflow: hidden;\s*scrollbar-gutter: stable;/);
    // A shorthand without a name: minifiers rewrite it to a zero duration, and the blur never plays.
    expect(motion.slice(0, motion.indexOf('@keyframes fig-blur-away'))).not.toMatch(/animation: /);
  });

  it("centres a compact card's tags on its authors, side by side: the authors' margin above them dropped", () => {
    const body = rules.find(
      (rule) => rule.selector === "main:is([data-folder='category'], [data-listing]) [data-slot='entry-card-authors']",
    )?.body;

    expect(body).toBe('margin-block-start: 0;');
    expect(
      rules.find(
        (rule) => rule.selector === "main:is([data-folder='category'], [data-listing]) [data-slot='entry-card-body']",
      )?.body,
    ).toContain('align-items: center;');
  });

  it('keeps inline code left to right, isolated from a right-to-left sentence around it', () => {
    const body = rules.find((rule) => rule.selector === ":not(pre) > [data-slot='mdx-code']")?.body ?? '';

    expect(body).toContain('direction: ltr;');
    expect(body).toContain('unicode-bidi: isolate;');
  });

  it("hovers with a mouse or a trackpad only; a heading's link icon on hover and on keyboard focus, none on touch", () => {
    const rest = source.replace(
      /@media \((?:hover: hover\) and \(pointer: fine|prefers-reduced-motion: reduce)\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      '',
    );
    const hovered = [...rest.matchAll(/([^{}]+)\{/g)]
      .map(([, selector]) => (selector ?? '').trim())
      .filter((selector) => selector.includes(':hover'));
    const mark = (state: string) =>
      source.includes(
        `:is([data-slot='mdx-h2'], [data-slot='mdx-h3'], [data-slot='mdx-h4']) > [data-slot='mdx-a']:${state}::after {`,
      );

    expect(hovered).toEqual([]);
    // Heroicons' link icon, as a mask: a tap on a touch screen follows the heading's link, no mark needed there.
    expect(source).toMatch(/--fig-heading-link-icon: url\("data:image\/svg\+xml,[^"]*M13\.19 8\.688/);
    expect(mark('focus-visible') && mark('hover')).toBe(true);
    expect(source).not.toContain("content: '#'");
  });

  it("sets a listing's pagination, below its cards, at the end of the line on a narrow screen", () => {
    const narrow = mediaOf(source)
      .filter(({ condition }) => condition === '(max-width: 36rem)')
      .map(({ body }) => body.replace(/\s+/g, ' '))
      .join(' ');

    expect(narrow).toContain(
      "[data-slot='listing-cards'] ~ [data-slot='pagination'] [data-slot='pagination-content'] { justify-content: flex-end; }",
    );
  });

  it('reveals the footer on a desktop only: on a touch screen, it scrolls in as any content', () => {
    const touch = mediaOf(source).find(({ condition }) => condition === '(hover: none), (pointer: coarse)');

    // Precondition: the block exists, so that its body is read.
    expect(touch).toBeDefined();
    expect(touch?.body.replace(/\s+/g, ' ')).toContain(
      "[data-slot='reveal']:has([data-slot='site-footer']) > [data-slot='reveal-content'] { animation: none; }",
    );
  });

  it("shows the 404's backdrop in the dark theme only, chosen or the system's: too faint to see on a light page", () => {
    const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? '';
    const backdrop = "main[data-page='not-found'] [data-slot='backdrop']";
    const system = mediaOf(source).find(({ condition }) => condition === '(prefers-color-scheme: dark)');

    expect(body(backdrop)).toBe('display: none;');
    expect(body(`:root[data-theme='dark'] ${backdrop}`)).toBe('display: block;');
    expect(system?.body.replace(/\s+/g, ' ')).toContain(
      `:root:not([data-theme='light']) ${backdrop} { display: block; }`,
    );
  });

  it("sets a folder page's compact pagination on its title's line, at its end, a phone's included", () => {
    const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? '';

    // One line, never wrapping: the title wraps within its room, the select keeps its own.
    expect(body("[data-slot='folder-heading']")).toMatch(/display: flex;.*justify-content: space-between;/);
    expect(body("[data-slot='folder-heading']")).not.toMatch(/flex-wrap: wrap/);
    expect(body("[data-slot='folder-heading'] > :is(h1, h2)")).toBe(
      'min-width: 0; margin: 0; overflow-wrap: anywhere;',
    );
    expect(body("[data-slot='folder-heading'] > [data-slot='page-select-trigger']")).toBe(
      'flex: none; margin-inline-start: auto;',
    );
    // The full pagination below the sections, at the end of the line on a phone, under the thumb.
    expect(source).toMatch(
      /@media \(max-width: 36rem\) \{\s*:is\(\[data-slot='folder-list'\], \[data-slot='folder-section'\]\)\s+~ \[data-slot='pagination'\]\s+\[data-slot='pagination-content'\] \{\s*justify-content: flex-end;/,
    );
  });

  it("keeps a section's heading its h2's spacing when the compact pagination shares its line", () => {
    const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body;

    expect(body("[data-slot='folder-section'] > [data-slot='folder-heading']")).toBe(
      'margin-block: 0.83em; font-size: 1.5em;',
    );
    expect(
      body("[data-slot='folder-section'] > [data-slot='folder-heading'] > [data-slot='page-select-trigger']"),
    ).toBe('font-size: 1rem;');
  });

  it("sets the compact pagination at the toolbar's other end, apart from the filters", () => {
    expect(
      rules.find((rule) => rule.selector === "[data-slot='listing-toolbar'] > [data-slot='page-select-trigger']")?.body,
    ).toBe('margin-inline-start: auto;');
  });

  it("compacts a category's previews, a listing's cards keeping their size; tags and authors side by side in both", () => {
    // The folder pages' rules on cards: their size a category's alone, never a listing's.
    const cards = rules.filter(
      (rule) => /^main(\[data-|:is\()/.test(rule.selector) && rule.selector.includes("[data-slot='entry-card"),
    );
    const shared = "main:is([data-folder='category'], [data-listing]) ";
    const sized = cards.filter((rule) => !rule.selector.startsWith(shared));

    // Precondition: both kinds are styled here.
    expect(sized.length).toBeGreaterThan(3);
    expect(cards.length).toBeGreaterThan(sized.length);

    for (const rule of sized)
      expect(rule.selector.startsWith("main[data-folder='category'] "), rule.selector).toBe(true);

    expect(
      rules.find((rule) => rule.selector === "main[data-folder='category'] [data-slot='entry-card-title']")?.body,
    ).toBe('--entry-card-title-lines: 1;');
    // The tags and the authors on one line, a category's previews and every listing's cards alike.
    expect(rules.find((rule) => rule.selector === `${shared}[data-slot='entry-card-body']`)?.body).toMatch(
      /grid-template-columns: minmax\(0, 1fr\) auto;/,
    );
  });

  it('hides the effects, for a theme to show them', () => {
    expect(rules.find((rule) => rule.selector === "[data-slot='sparkles'], [data-slot='cursor-glow']")?.body).toBe(
      'display: none;',
    );
  });

  it("styles the MDX elements, the headings in the theme's font", () => {
    expect(rules.some((rule) => rule.selector.includes("[data-slot='mdx-h1']"))).toBe(true);
    expect(source).toMatch(/font-family: var\(--fig-heading-font, inherit\)/);
  });

  it('prints the article alone: no footer, no listing controls, no transition caught halfway', () => {
    const print = source.slice(source.indexOf('@media print'));

    for (const hidden of [
      "[data-slot='site-footer']",
      "[data-slot='listing-toolbar']",
      "[data-slot='listing-controls']",
    ])
      expect(print).toContain(hidden);

    expect(print).toMatch(/transition: none/);
    expect(print).toContain("a[href^='http']::after");
  });

  it("prints the page's title top right, its address bottom left and its number bottom right", () => {
    const page = source.slice(source.indexOf('@page'));

    expect(page).toMatch(/@top-right\s*\{[^}]*content: var\(--fig-print-title/);
    expect(page).toMatch(/@bottom-left\s*\{[^}]*content: var\(--fig-print-url/);
    expect(page).toMatch(/@bottom-right\s*\{[^}]*content: counter\(page\) ' \/ ' counter\(pages\)/);
  });
});

describe('maquis.css', () => {
  const source = sourceOf('maquis');
  const rules = rulesOf(source);
  const forced = `${gateOf('maquis')}[data-theme='dark']`;
  const dark = (selector: string) => rules.find((rule) => rule.selector === `${forced} ${selector}`)?.body ?? '';

  it('frosts every table row in the dark theme: both tints glass, never a transparent row over the glow', () => {
    expect(dark("[data-slot='mdx-table'] > table")).toContain('backdrop-filter: blur(');
    expect(dark("[data-slot='mdx-tr']")).toBe('background: var(--glass-bg);');
    expect(dark("[data-slot='mdx-tr']:nth-child(even)")).toMatch(
      /^background: color-mix\(in srgb, var\(--fig-surface\) \d+%, transparent\);$/,
    );
  });

  it('frosts the code blocks in the dark theme: thin glass, a strong blur, a light edge on top', () => {
    const body = dark("[data-slot='code-block-pre'].shiki");

    expect(body).toMatch(/background-color: color-mix\(in srgb, var\(--shiki-dark-bg\) 60%, transparent\);/);
    expect(body).toContain('backdrop-filter: blur(16px);');
    expect(body).toMatch(/box-shadow: inset 0 1px 0 /);
  });

  it("prints its glass plain: no blur, no lit edge, the tables' rows plain", () => {
    // Whitespace collapsed: the formatter wraps long selectors.
    const print = source.slice(source.indexOf('@media print')).replace(/\s+/g, ' ');

    expect(print).toMatch(/\[data-slot='mdx-table'\] > table \{ -webkit-backdrop-filter: none; backdrop-filter: none;/);
    expect(print).toMatch(/\[data-slot='code-block-pre'\]\.shiki \{[^}]*box-shadow: none;/);
    expect(print).toMatch(/\[data-slot='mdx-tr'\] \{ background: none;/);
  });
});

/** The WCAG contrast ratio of two `#rrggbb` colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((at) => {
      const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

      return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('paper.css', () => {
  const rules = rulesOf(sourceOf('paper'));
  const gate = gateOf('paper');
  const tokensOf = (selector: string): Readonly<Record<string, string>> =>
    Object.fromEntries(
      [
        ...(rules.find((rule) => rule.selector.endsWith(selector))?.body ?? '').matchAll(/(--fig-[\w-]+): ([^;]+);/g),
      ].map(([, name, value]) => [name ?? '', value ?? '']),
    );
  const palettes = {
    light: tokensOf(gate),
    dark: tokensOf(`${gate}[data-theme='dark']`),
    print: tokensOf(`${gate}:is([data-theme], :not([data-theme]))`),
  };

  it.each(Object.entries(palettes))(
    'reads in its %s palette: text, muted text and links at least 4.5:1 on the page (WCAG AA)',
    (_, tokens) => {
      const bg = tokens['--fig-bg'] ?? '';

      // Precondition: the palette sets the page's background.
      expect(bg).toMatch(/^#[0-9a-f]{6}$/);

      for (const name of ['--fig-fg', '--fig-muted', '--fig-accent'])
        expect(contrast(tokens[name] ?? bg, bg), name).toBeGreaterThanOrEqual(4.5);
    },
  );

  // A light accent on a dark page differs from the light text by its hue more than by its lightness: a lower bar.
  it.each([
    ['light', palettes.light, 2.5],
    ['dark', palettes.dark, 1.8],
  ] as const)(
    'sets its %s accent apart from the text (the current page in the navbar): at least %d:1',
    (_, tokens, ratio) => {
      expect(contrast(tokens['--fig-accent'] ?? '', tokens['--fig-fg'] ?? '')).toBeGreaterThanOrEqual(ratio);
    },
  );

  it("prints ink on white, whatever the screen's theme", () => {
    expect(palettes.print['--fig-bg']).toBe('#ffffff');
  });
});

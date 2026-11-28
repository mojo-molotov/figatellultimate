// Behavior on the real `next build`, in a real browser: what only Chromium and Next's router show, never the static
// HTML (`verify.ts`) nor the packages' own tests. Each check states the bug it guards against.
// Run after `pnpm example:build`: `pnpm example:browse [--port N]` (plain Node, Chromium).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import type { AxeResults, ElementContext, RunOptions } from 'axe-core';
import { chromium, type Page } from 'playwright';

import { blogIndex, findBlogFolderByUrl } from '#figatellultimate/blog';

declare global {
  // axe-core, injected into a page for its contrast check.
  interface Window {
    readonly axe: { run: (context: ElementContext, options: RunOptions) => Promise<AxeResults> };
  }
}

const { values } = parseArgs({ options: { port: { type: 'string', default: '3198' } } });
const base = `http://localhost:${values.port}`;
const problems: string[] = [];
const check = (condition: boolean, problem: string): void => {
  if (!condition) problems.push(problem);
};
const LISTING = '/blog/maquis/corsicamon';
const perPage = findBlogFolderByUrl(LISTING)?.perPage ?? 0;
const posts = blogIndex.filter((item) => item.locale === 'fr' && item.url.startsWith(`${LISTING}/`)).length;
// The listing's last page, shorter than the others: going back from it makes the page taller.
const last = Math.ceil(posts / perPage);

check(posts % perPage !== 0, `${LISTING}: its last page is full, so no page change alters the page's height`);

/** Where the page is scrolled, and where a slot's element sits on the screen. */
/** A page as the build prerendered it, French unprefixed. */
const htmlOf = (url: string): string | undefined => {
  try {
    return readFileSync(
      join(import.meta.dirname, '..', '.next/server/app', `${url.startsWith('/en') ? url : `/fr${url}`}.html`),
      'utf8',
    );
  } catch {
    return undefined;
  }
};
const placeOf = (page: Page, slot: string) =>
  page.evaluate((name) => {
    const element = document.querySelector(`[data-slot="${name}"]`);

    return { scroll: Math.round(window.scrollY), top: Math.round(element?.getBoundingClientRect().top ?? NaN) };
  }, slot);

const server = spawn(join(import.meta.dirname, '..', 'node_modules/.bin/next'), ['start', '-p', values.port], {
  cwd: join(import.meta.dirname, '..'),
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

try {
  for (let i = 0; i < 60; i++) {
    const up = await fetch(`${base}/`).then(
      (response) => response.ok,
      () => false,
    );

    if (up) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const browser = await chromium.launch();
  const open = async (url: string): Promise<Page> => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });

    return page;
  };

  // Previous and next keep the button under the mouse: the browser's scroll anchoring once picked an element of the
  // new page (or the revealed footer) and scrolled to keep it in place; and from the shorter last page, the taller
  // page before it once pushed the pagination down the screen, the click landing elsewhere.
  for (const [url, slot, fromBottom] of [
    [LISTING, 'pagination-next', 150],
    [LISTING, 'pagination-next', 50],
    [`${LISTING}/page/3`, 'pagination-previous', 120],
    ['/blog/maquis', 'pagination-next', 120],
    [`${LISTING}/page/${String(last)}`, 'pagination-previous', 0],
    [`${LISTING}/page/${String(last - 1)}`, 'pagination-next', 0],
  ] as const) {
    const page = await open(url);

    await page.evaluate((offset) => {
      window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - offset);
    }, fromBottom);
    await page.waitForTimeout(300);
    const before = await placeOf(page, slot);
    const button = await page.locator(`[data-slot="${slot}"]`).first().boundingBox();

    // Precondition: the button is on the screen, clicked where it stands (no scroll into view).
    check(button !== null && button.y + button.height <= 900, `${url}: ${slot} is not on the screen`);

    if (button !== null) {
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      await page.waitForURL((next) => next.pathname !== new URL(`${base}${url}`).pathname);
      await page.waitForTimeout(800);
      const after = await placeOf(page, slot);

      // The button's place on the screen: the scroll itself changes when the new page is taller or shorter. Within a
      // pixel: heights are fractional, the browser's furthest scroll is rounded.
      check(
        Math.abs(after.top - before.top) <= 1,
        `${url}: ${slot} ${String(fromBottom)}px from the bottom moved the screen (${JSON.stringify(before)} → ${JSON.stringify(after)})`,
      );
    }

    await page.close();
  }

  // A filter in the URL, of a term the page's own posts lack: read before the index, which then loads; the
  // unfiltered list's pages never show. The engine, holding the slice alone, once dropped the term.
  const harp = blogIndex.filter(
    (item) => item.locale === 'fr' && item.url.startsWith(`${LISTING}/`) && item.terms.tags.includes('harp'),
  ).length;
  const filtered = await open(`${LISTING}?tags=harp`);

  // Precondition: a few posts carry the term, fewer than a page.
  check(harp > 0 && harp <= perPage, `${LISTING}: ${String(harp)} posts with harp, the check needs 1 to a page`);
  await filtered.waitForTimeout(500);
  check(
    (await filtered.locator('[data-slot="listing-cards"] [data-key]').count()) === harp,
    `${LISTING}?tags=harp: not the ${String(harp)} posts with harp`,
  );
  check(
    (await filtered.locator('[data-slot="pagination"]').count()) === 0,
    `${LISTING}?tags=harp: the unfiltered list's pagination`,
  );
  await filtered.close();

  // The next three pages loaded ahead once a listing shows, before any click: their payloads, through Next's router.
  {
    const ahead = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const asked: string[] = [];

    ahead.on('request', (request) => {
      if (request.headers()['rsc'] !== undefined) asked.push(new URL(request.url()).pathname);
    });
    await ahead.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    check(
      [2, 3, 4].every((page) => asked.includes(`${LISTING}/page/${String(page)}`)),
      `${LISTING}: its next three pages not loaded ahead (${JSON.stringify(asked)})`,
    );
    await ahead.close();
  }

  // A listing's batch loaded on idle: its pages shown here, without the server, the address moving to /page/N, the
  // cards those of the prerendered page, the switcher following; Back brings the page before back.
  {
    const paging = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const asked: string[] = [];
    const cardsOn = (html: string): string[] =>
      [...html.slice(html.indexOf('data-slot="listing-cards"')).matchAll(/data-key="([^"]+)"/g)]
        .map((match) => match[1] ?? '')
        .slice(0, 3);
    const shown = (): Promise<string[]> =>
      paging.evaluate(() =>
        [...(document.querySelector('[data-slot="listing-cards"]')?.querySelectorAll('[data-key]') ?? [])]
          .slice(0, 3)
          .map((card) => card.getAttribute('data-key') ?? ''),
      );

    paging.on('request', (request) => {
      const path = new URL(request.url()).pathname;

      if (request.headers()['rsc'] !== undefined || path.includes('/pages/')) asked.push(path);
    });
    const batch = paging.waitForResponse(
      (response) => new URL(response.url()).pathname.includes('/listing/') && response.url().includes('/pages/'),
    );

    await paging.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    await batch;
    asked.length = 0;
    await paging.locator('[data-slot="pagination-next"]').first().click();
    await paging.waitForURL(`**${LISTING}/page/2`);
    await paging
      .waitForFunction(
        (first) => document.querySelector('[data-slot="listing-cards"] [data-key]')?.getAttribute('data-key') !== first,
        (await shown())[0] ?? '',
      )
      .catch(() => undefined);
    const expected = cardsOn(htmlOf(`${LISTING}/page/2`) ?? '');

    // Precondition: the prerendered page 2 has its cards to compare with.
    check(expected.length > 0, `${LISTING}/page/2: no card prerendered`);
    check(
      JSON.stringify(await shown()) === JSON.stringify(expected),
      `${LISTING}: page 2 shown from its batch is not the prerendered page 2 (${JSON.stringify(await shown())} ≠ ${JSON.stringify(expected)})`,
    );
    check(
      !asked.some((path) => path.endsWith(`${LISTING}/page/2`)),
      `${LISTING}: page 2 asked of the server, its batch at hand (${JSON.stringify(asked)})`,
    );
    // The switcher's links, its menu open: English has page 2 too.
    await paging.locator('[data-slot="locale-switcher"]').first().click();
    const english = (await paging.locator('a[hreflang="en"]').first().getAttribute('href')) ?? '';

    await paging.keyboard.press('Escape');
    check(
      english === `/en${LISTING}/page/2`,
      `${LISTING}/page/2: the switcher leads to ${english}, not English page 2`,
    );
    await paging.goBack();
    await paging.waitForURL(`**${LISTING}`);
    await paging.waitForTimeout(300);
    check(
      JSON.stringify(await shown()) === JSON.stringify(cardsOn(htmlOf(LISTING) ?? '')),
      `${LISTING}: Back did not bring page 1's cards back`,
    );
    await paging.close();
  }

  // A category's batch: its next page of subcategories shown here, without the server, as the prerendered page 2.
  {
    const category = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const asked: string[] = [];
    const headings = (html: string): string[] =>
      [...html.matchAll(/data-slot="folder-section".*?<h2[^>]*>(?:<a[^>]*>)?([^<]*)</gs)].map(
        (match) => match[1] ?? '',
      );
    const shown = (): Promise<string[]> =>
      category.evaluate(() =>
        [...document.querySelectorAll('[data-slot="folder-section"] h2')].map((heading) => heading.textContent),
      );

    category.on('request', (request) => {
      const path = new URL(request.url()).pathname;

      if (request.headers()['rsc'] !== undefined || path.includes('/pages/')) asked.push(path);
    });
    const batch = category.waitForResponse((response) => response.url().includes('/listing/maquis/pages/1'));

    await category.goto(`${base}/blog/maquis`, { waitUntil: 'networkidle' });
    await batch;
    asked.length = 0;
    const before = JSON.stringify(await shown());

    await category.locator('[data-slot="pagination-next"]').first().click();
    await category.waitForURL('**/blog/maquis/page/2');
    await category
      .waitForFunction(
        (was) =>
          JSON.stringify(
            [...document.querySelectorAll('[data-slot="folder-section"] h2')].map((h) => h.textContent),
          ) !== was,
        before,
      )
      .catch(() => undefined);
    const expected = headings(htmlOf('/blog/maquis/page/2') ?? '');

    // Precondition: the prerendered page 2 has its sections to compare with.
    check(expected.length > 0, '/blog/maquis/page/2: no section prerendered');
    check(
      JSON.stringify(await shown()) === JSON.stringify(expected),
      `/blog/maquis: page 2 shown from its batch is not the prerendered page 2 (${JSON.stringify(await shown())} ≠ ${JSON.stringify(expected)})`,
    );
    check(
      !asked.some((path) => path.endsWith('/blog/maquis/page/2')),
      `/blog/maquis: page 2 asked of the server, its batch at hand (${JSON.stringify(asked)})`,
    );
    await category.close();
  }

  // A listing reached from its category shows at once: its code loaded while the category was idle, never awaited
  // with an empty <main> (each script made slow, as the deployed site is).
  {
    const arrival = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await arrival.route('**/_next/static/**/*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await arrival.goto(`${base}/blog/maquis`, { waitUntil: 'networkidle' });
    await arrival.waitForTimeout(1000);
    const link = arrival.locator('a[data-slot="folder-more"]').first();
    const target = (await link.getAttribute('href')) ?? '';

    // Every frame from the click: the address, and whether the main shows anything.
    await arrival.evaluate(() => {
      const frames: [string, boolean][] = [];
      const start = performance.now();
      const sample = (): void => {
        frames.push([location.pathname, (document.querySelector('main')?.textContent ?? '').trim() !== '']);

        if (performance.now() - start < 2000) requestAnimationFrame(sample);
      };

      Reflect.set(window, '__frames', frames);
      requestAnimationFrame(sample);
    });
    await link.click();
    await arrival.waitForURL(`**${target}`);
    await arrival.waitForTimeout(2100);
    const frames: unknown = await arrival.evaluate(() => Reflect.get(window, '__frames'));
    const shown = Array.isArray(frames) ? frames.filter((frame) => Array.isArray(frame) && frame[0] === target) : [];

    // Precondition: frames were sampled on the listing.
    check(target !== '' && shown.length > 0, `/blog/maquis: no frame sampled on ${target}`);
    check(
      shown.every((frame) => Array.isArray(frame) && frame[1] === true),
      `${target}: its main empty a moment, reached from its category`,
    );
    await arrival.close();
  }

  // The navbar on one line at any width: whole while its links fit (a desktop), compact once they do not (a phone),
  // measured, never two lines.
  for (const [width, compact] of [
    [1280, false],
    [800, undefined],
    [390, true],
  ] as const) {
    const bar = await browser.newPage({ viewport: { width, height: 800 } });

    await bar.goto(`${base}/docs`, { waitUntil: 'networkidle' });
    const state = await bar.evaluate(() => {
      const navbar = document.querySelector('[data-slot="navbar"]');
      const toggle = document.querySelector('[data-slot="navbar-toggle"]');
      const tops = [...document.querySelectorAll('[data-slot="navbar"] > *')]
        .filter((part) => getComputedStyle(part).display !== 'none')
        .map((part) => Math.round(part.getBoundingClientRect().top + part.getBoundingClientRect().height / 2));

      return {
        compact: navbar?.hasAttribute('data-compact') ?? false,
        toggle: toggle !== null && getComputedStyle(toggle).display !== 'none',
        oneLine: tops.length > 0 && Math.max(...tops) - Math.min(...tops) <= 2,
      };
    });

    check(
      state.oneLine && state.toggle === state.compact && (compact === undefined || state.compact === compact),
      `/docs at ${String(width)}px: the navbar not on one line, or not as compact as expected (${JSON.stringify(state)})`,
    );
    await bar.close();
  }

  // Tab reaches what a reader acts on: from a snippet's tabs straight to its copy button, a snippet or a table that
  // fits taking no stop; one that overflows (a table on a phone) takes one, to scroll it with the keyboard.
  {
    const keyboard = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await keyboard.goto(`${base}/docs/installation`, { waitUntil: 'networkidle' });
    await keyboard.locator('[data-slot="code-tabs-trigger"][data-state="active"]').first().focus();
    await keyboard.keyboard.press('Tab');
    check(
      (await keyboard.evaluate(() => document.activeElement?.getAttribute('data-slot'))) === 'code-block-copy',
      '/docs/installation: Tab from the tabs does not reach the copy button',
    );
    await keyboard.goto(`${base}/docs/configuration`, { waitUntil: 'networkidle' });
    const stops = (): Promise<(string | null)[]> =>
      keyboard.evaluate(() =>
        [...document.querySelectorAll('[data-slot="mdx-table"], [data-slot="code-block-pre"]')].map((region) =>
          region.scrollWidth > region.clientWidth + 1
            ? (region.getAttribute('tabindex') ?? 'none')
            : region.getAttribute('tabindex'),
        ),
      );
    const overflowing = (): Promise<boolean[]> =>
      keyboard.evaluate(() =>
        [...document.querySelectorAll('[data-slot="mdx-table"], [data-slot="code-block-pre"]')].map(
          (region) => region.scrollWidth > region.clientWidth + 1,
        ),
      );
    const consistent = async (): Promise<boolean> => {
      const [regions, wide] = [await stops(), await overflowing()];

      return regions.every((stop, index) => (wide[index] === true ? stop === '0' : stop === null));
    };

    check(
      await consistent(),
      '/docs/configuration: a region takes a Tab stop without overflowing, or lacks one overflowing',
    );
    await keyboard.setViewportSize({ width: 390, height: 844 });
    await keyboard.waitForTimeout(300);
    // Precondition: on a phone, something overflows (a table), so that both sides are checked.
    check((await overflowing()).some(Boolean), '/docs/configuration: nothing overflows on a phone');
    check(await consistent(), '/docs/configuration on a phone: an overflowing region without its Tab stop');
    await keyboard.close();
  }

  // A filter chosen before the index arrives is applied once it is here, never lost.
  const early = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await early.route('**/listing/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await early.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
  // The facets behind the gear: its panel first, then the tags' list.
  await early.getByRole('button', { name: /^Filtres et tri/ }).click();
  await early.getByRole('button', { name: /^Tags/ }).click();
  await early.getByRole('option').first().click();
  await early.waitForURL(/tags=/, { timeout: 5000 }).catch(() => undefined);
  check(new URL(early.url()).searchParams.has('tags'), `${LISTING}: a filter chosen before the index was lost`);
  await early.close();

  // The compact pagination reaches a prerendered page.
  const select = await open(LISTING);

  await select.getByRole('combobox', { name: 'Aller à la page' }).click();
  await select.getByRole('option', { name: 'Page 4', exact: true }).click();
  await select.waitForURL('**/page/4', { timeout: 5000 }).catch(() => undefined);
  check(new URL(select.url()).pathname === `${LISTING}/page/4`, `${LISTING}: the page select did not reach page 4`);
  await select.close();

  // Right to left (both locales of the example read left to right: the page's direction forced): the layout
  // mirrors, its table of contents on the right, the navbar's extras before its menu, and code still reads left to
  // right; nothing overflows sideways.
  {
    const mirrored = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await mirrored.goto(`${base}/docs/installation`, { waitUntil: 'networkidle' });
    await mirrored.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    const layout = await mirrored.evaluate(() => {
      const box = (slot: string): DOMRect | undefined =>
        document.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
      const code = document.querySelector('[data-slot="code-block"]');

      return {
        tocOnTheRight: (box('toc')?.left ?? 0) > window.innerWidth / 2,
        extrasFirst: (box('navbar-extras')?.right ?? Infinity) <= (box('navbar-menu')?.left ?? -Infinity),
        codeLeftToRight: code !== null && getComputedStyle(code).direction === 'ltr',
        noSideScroll: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });

    for (const [property, holds] of Object.entries(layout))
      check(holds, `/docs/installation right to left: ${property} does not hold`);

    await mirrored.close();
  }

  // A content image's zoom preloads its enlarged image as the mouse comes over it: the dialog opens on a loaded
  // image, its entrance seen, and no second fetch.
  {
    const zoomPage = await open('/blog/maquis/chestnut-grove/tree-of-thousand-git-branches');
    const fetched: string[] = [];

    zoomPage.on('request', (request) => {
      if (request.url().includes('/_next/image')) fetched.push(request.url());
    });
    await zoomPage.locator('[data-slot="image-zoom-trigger"]').first().hover();
    // As a visitor does, hovering a moment before clicking: until the preloaded image has loaded.
    await zoomPage
      .locator('[data-slot="image-zoom-preload"]')
      .first()
      .evaluate(
        (preload) =>
          new Promise<void>((resolve) => {
            if (preload instanceof HTMLImageElement && preload.complete) resolve();
            else
              preload.addEventListener('load', () => {
                resolve();
              });
          }),
      );
    const preloaded = fetched.length;

    await zoomPage.locator('[data-slot="image-zoom-trigger"]').first().click();
    const complete = await zoomPage.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          requestAnimationFrame(() => {
            const full = document.querySelector('[data-slot="image-zoom-full"]');

            resolve(full instanceof HTMLImageElement && full.complete && full.naturalWidth > 0);
          });
        }),
    );

    check(preloaded > 0, 'a zoomable image: nothing preloaded as the mouse came over it');
    check(
      complete && fetched.length === preloaded,
      `a zoomable image: its dialog opened on an image still loading (${String(complete)}, ${fetched
        .slice(preloaded)
        .map((url) => url.slice(-50))
        .join(' ')})`,
    );
    await zoomPage.close();
  }

  // The site's theme picker shows its chosen option from the first paint, before any script: without JavaScript, the
  // default theme's option already has the accent, so that it never fades in once the page is hydrated.
  {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const still = await context.newPage();

    await still.goto(`${base}${LISTING}`, { waitUntil: 'load' });
    const [chosen, other, accent] = await still.evaluate(() => {
      const color = (selector: string): string =>
        getComputedStyle(document.querySelector(selector) ?? document.body).color;
      const probe = document.createElement('span');

      probe.style.color = 'var(--fig-accent)';
      document.body.append(probe);

      return [
        color('[data-slot="site-theme-option"][value="maquis"]'),
        color('[data-slot="site-theme-option"][value="calanque"]'),
        getComputedStyle(probe).color,
      ];
    });

    check(chosen === accent && other !== accent, `${LISTING}: the chosen theme is not shown before hydration`);
    await context.close();
  }

  // Switching locale preserves the visitor's chosen site theme (Calanque stays active when moving from `/docs` to
  // `/en/docs`, never reset to Maquis by the `[locale]` layout re-rendering `<html>`).
  {
    const switched = await open('/docs');

    await switched.locator('[data-slot="site-theme-option"][value="calanque"]').click();
    await switched.waitForFunction(() => document.documentElement.dataset['siteTheme'] === 'calanque');
    await switched.locator('[data-slot="locale-switcher"]').first().click();
    await switched.locator('a[hreflang="en"]').first().click();
    await switched.waitForURL('**/en/docs');
    await switched.waitForTimeout(300);
    const themeAfter = await switched.evaluate(() => ({
      siteTheme: document.documentElement.dataset['siteTheme'],
      current: document
        .querySelector('[data-slot="site-theme-option"][value="calanque"]')
        ?.hasAttribute('data-current'),
    }));

    check(
      themeAfter.siteTheme === 'calanque' && themeAfter.current === true,
      `/docs → /en/docs: site theme was not preserved across locale switch (${JSON.stringify(themeAfter)})`,
    );
    await switched.close();
  }

  // What the site exposes to LLMs at its public URLs, through the proxy: each llms.txt, and a page's Markdown at its
  // URL with `.md` in either locale; a page left out has none.
  {
    const served = async (path: string): Promise<{ status: number; type: string; text: string }> => {
      const response = await fetch(`${base}${path}`);

      return { status: response.status, type: response.headers.get('content-type') ?? '', text: await response.text() };
    };
    const [llms, english, markdown, englishMarkdown, left] = await Promise.all([
      served('/llms.txt'),
      served('/en/llms.txt'),
      served('/docs/installation.md'),
      served('/en/docs/cli.md'),
      served('/docs.md'),
    ]);

    check(
      llms.status === 200 &&
        llms.type.startsWith('text/plain') &&
        llms.text.startsWith('# ') &&
        llms.text.includes('/docs/installation.md'),
      `/llms.txt: ${String(llms.status)} ${llms.type}`,
    );
    check(
      english.status === 200 && english.text.includes('/en/docs/cli.md'),
      `/en/llms.txt: ${String(english.status)}`,
    );
    check(
      markdown.status === 200 &&
        markdown.type.startsWith('text/markdown') &&
        markdown.text.startsWith('# Installation'),
      `/docs/installation.md: ${String(markdown.status)} ${markdown.type}`,
    );
    check(
      englishMarkdown.status === 200 && englishMarkdown.text.startsWith('# '),
      `/en/docs/cli.md: ${String(englishMarkdown.status)}`,
    );
    check(left.status === 404, `/docs.md: ${String(left.status)}, the page left out of llms.txt`);

    // What the site offers agents, at its public URLs: the ARD manifest at both well-known paths, and the skill it
    // lists, never taken for a page's Markdown by the proxy.
    const [ard, catalog, skill] = await Promise.all([
      served('/.well-known/ard.json'),
      served('/.well-known/ai-catalog.json'),
      served('/skills/use-figatellultimate/SKILL.md'),
    ]);

    check(
      ard.status === 200 && ard.type.startsWith('application/json') && ard.text.includes('application/agent-skills+md'),
      `/.well-known/ard.json: ${String(ard.status)} ${ard.type}`,
    );
    check(
      catalog.status === 200 && catalog.text === ard.text,
      `/.well-known/ai-catalog.json: ${String(catalog.status)}`,
    );
    check(
      skill.status === 200 &&
        skill.type.startsWith('text/markdown') &&
        skill.text.startsWith('---\nname: use-figatellultimate'),
      `/skills/use-figatellultimate/SKILL.md: ${String(skill.status)} ${skill.type}`,
    );
  }

  // The search's shortcut after its label, the reader's keys (⌘K on an Apple device, Ctrl K elsewhere) on the
  // trigger's line, on a desktop; never on a touch screen, where no keyboard is at hand.
  for (const [device, options, shown] of [
    ['a desktop', { viewport: { width: 1280, height: 900 } }, true],
    ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, false],
  ] as const) {
    const search = await browser.newPage(options);

    await search.goto(`${base}/docs`, { waitUntil: 'load' });
    const shortcut = search.locator('[data-slot="search-dialog-shortcut"]');
    const apple = /Mac|iPhone|iPad|iPod/.test(await search.evaluate(() => navigator.userAgent));
    const keys = (await shortcut.isVisible()) ? await shortcut.innerText() : '';
    const [label, kbd] = await Promise.all([
      search.locator('[data-slot="search-dialog-label"]').boundingBox(),
      shortcut.boundingBox(),
    ]);

    check(
      shown
        ? keys === (apple ? '⌘K' : 'Ctrl K') &&
            label !== null &&
            kbd !== null &&
            kbd.x > label.x + label.width &&
            Math.abs(kbd.y + kbd.height / 2 - (label.y + label.height / 2)) < 2
        : keys === '',
      `/docs on ${device}: the search's shortcut « ${keys} »${shown ? ', not the reader’s keys after its label' : ', shown on a touch screen'}`,
    );
    await search.close();
  }

  // The search field's placeholder shown where typed text begins, never heard (its ellipsis read aloud once): the
  // field described by its spoken text instead.
  {
    const dialog = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    await dialog.goto(`${base}/docs`, { waitUntil: 'load' });
    await dialog.getByRole('button', { name: 'Rechercher' }).click();
    const field = dialog.getByRole('combobox', { name: 'Termes de recherche' });

    await field.waitFor();
    const placed = await dialog.evaluate(() => {
      const input = document.querySelector('[data-slot="search-box-input"]');
      const shown = document.querySelector('[data-slot="search-box-placeholder"]');

      if (input === null || shown === null) return undefined;

      const begins = (element: Element): number =>
        element.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(element).paddingLeft);

      return {
        aligned: Math.abs(begins(input) - begins(shown)) < 1,
        text: shown.textContent,
        hidden: shown.getAttribute('aria-hidden') === 'true',
        attribute: input.hasAttribute('placeholder'),
      };
    });
    const described = await field.evaluate((input) =>
      (input.getAttribute('aria-describedby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' '),
    );

    check(
      placed !== undefined &&
        placed.aligned &&
        placed.text === 'Rechercher…' &&
        placed.hidden &&
        !placed.attribute &&
        described === 'Tapez au moins 3 caractères.',
      `/docs: the search placeholder not shown where typed text begins, or heard (${JSON.stringify({ placed, described })})`,
    );

    // On a desktop, the field and every result span the dialog's whole width with equal padding on both sides, while the
    // floating close button stays anchored on the outer top-right corner even while scrolling.
    await field.fill('figatellu');
    await dialog.locator('[data-slot="search-box-result"]').first().waitFor();
    const layout = await dialog.evaluate(() => {
      const content = document.querySelector('[data-slot="search-dialog-content"]');
      const body = document.querySelector('[data-slot="search-dialog-body"]');
      const row = document.querySelector('[data-slot="search-box-field"]');
      const close = document.querySelector('[data-slot="search-dialog-close"]');
      const results = [...document.querySelectorAll('[data-slot="search-box-result"]')];

      if (content === null || body === null || row === null || close === null || results.length === 0) return undefined;

      const contentBox = content.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      const innerLeft = bodyBox.left + body.clientLeft;
      const innerRight = innerLeft + body.clientWidth;
      const closeBox = close.getBoundingClientRect();
      const fieldBox = row.getBoundingClientRect();

      const closeBorderRadius = Number.parseFloat(getComputedStyle(close).borderRadius);
      const fieldBorderRadius = Number.parseFloat(getComputedStyle(row).borderRadius);
      // The field's focus outline sits 4px outside its border (2px offset + 2px width); check clearance between the
      // rounded corners of the close button and the focus outline.
      const outlineCornerRadius = fieldBorderRadius + 4;
      const clearOfOutline =
        Math.hypot(
          closeBox.left + closeBorderRadius - (fieldBox.right - fieldBorderRadius),
          closeBox.bottom - closeBorderRadius - (fieldBox.top + fieldBorderRadius),
        ) >
        closeBorderRadius + outlineCornerRadius;

      return {
        closeBeforeScroll: { top: Math.round(closeBox.top), right: Math.round(closeBox.right) },
        floatingCorner:
          closeBox.top < contentBox.top &&
          closeBox.right > contentBox.right &&
          clearOfOutline &&
          Math.abs(closeBorderRadius - fieldBorderRadius) <= 1,
        fieldFullWidth: Math.abs(fieldBox.left - innerLeft - (innerRight - fieldBox.right)) <= 1,
        symmetric: results.every((result) => {
          const rect = result.getBoundingClientRect();

          return (
            Math.abs(rect.left - innerLeft - (innerRight - rect.right)) <= 1 &&
            Math.abs(rect.left - fieldBox.left) <= 1 &&
            Math.abs(rect.right - fieldBox.right) <= 1
          );
        }),
      };
    });

    check(
      layout !== undefined && layout.floatingCorner && layout.fieldFullWidth && layout.symmetric,
      `/docs: desktop search dialog field/results not full width or close button not floating on corner (${JSON.stringify(layout)})`,
    );
    // ↓ past the last result focuses "see more" alone (no result highlighted); Enter activates it instead of navigating.
    await dialog.keyboard.press('End');
    await dialog.keyboard.press('ArrowDown');
    const onMore = await dialog.evaluate(() => ({
      focused: document.activeElement === document.querySelector('[data-slot="search-box-more"]'),
      selected: document.querySelector('[data-slot="search-box-result"][aria-selected="true"]') !== null,
    }));

    check(
      onMore.focused && !onMore.selected,
      `/docs: arrowing down to "see more" left a result highlighted (${JSON.stringify(onMore)})`,
    );
    await dialog.keyboard.press('Enter');
    await dialog.waitForFunction(() => document.querySelectorAll('[data-slot="search-box-result"]').length > 5);
    check(
      new URL(dialog.url()).pathname === '/docs',
      `/docs: pressing Enter on "see more" navigated away (${dialog.url()})`,
    );
    const total = await dialog.locator('[data-slot="search-box-result"]').count();

    await dialog.keyboard.press('End');
    const scrolledAway = await dialog.evaluate(() => {
      const body = document.querySelector('[data-slot="search-dialog-body"]');
      const row = document.querySelector('[data-slot="search-box-field"]');
      const close = document.querySelector('[data-slot="search-dialog-close"]');

      if (body === null || row === null || close === null) return undefined;

      const closeBox = close.getBoundingClientRect();

      return {
        fieldOffTop: body.scrollTop > 0 && row.getBoundingClientRect().top < body.getBoundingClientRect().top,
        closeAfterScroll: { top: Math.round(closeBox.top), right: Math.round(closeBox.right) },
      };
    });

    for (let step = 0; step < total; step += 1) await dialog.keyboard.press('ArrowUp');

    const returned = await dialog.evaluate(() => {
      const body = document.querySelector('[data-slot="search-dialog-body"]');
      const row = document.querySelector('[data-slot="search-box-field"]');
      const input = document.querySelector('[data-slot="search-box-input"]');

      if (body === null || row === null || input === null) return undefined;

      const box = body.getBoundingClientRect();
      const fieldBox = row.getBoundingClientRect();

      return {
        focused: document.activeElement === input,
        selected: document.querySelector('[data-slot="search-box-result"][aria-selected="true"]') !== null,
        scrollTop: Math.round(body.scrollTop),
        visible: fieldBox.top >= box.top && fieldBox.bottom <= box.bottom,
      };
    });

    check(
      layout !== undefined &&
        scrolledAway !== undefined &&
        scrolledAway.fieldOffTop &&
        Math.abs(scrolledAway.closeAfterScroll.top - layout.closeBeforeScroll.top) <= 1 &&
        Math.abs(scrolledAway.closeAfterScroll.right - layout.closeBeforeScroll.right) <= 1 &&
        returned !== undefined &&
        returned.focused &&
        !returned.selected &&
        returned.scrollTop === 0 &&
        returned.visible,
      `/docs: arrowing back up past the first search result did not reveal the focused field, or close button moved on scroll (${JSON.stringify({ layout, scrolledAway, returned })})`,
    );
    await dialog.close();
  }

  // The code readable in every site theme, light and dark: axe's color contrast (WCAG AA) on every token of the code
  // blocks. A highlighter's palette drawn for white once fell below it on a theme's tinted surface.
  {
    const code = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

    await code.goto(`${base}/docs/quick-start`, { waitUntil: 'load' });
    await code.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });

    for (const site of ['maquis', 'calanque'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        const { checked, failing } = await code.evaluate(
          async ([siteTheme, colorTheme]) => {
            document.documentElement.dataset['siteTheme'] = siteTheme;
            document.documentElement.dataset['theme'] = colorTheme;
            const results = await window.axe.run(
              { include: [['[data-slot="code-block-pre"]']] },
              { runOnly: ['color-contrast'] },
            );

            return {
              checked: results.passes.reduce((count, rule) => count + rule.nodes.length, 0),
              failing: results.violations.flatMap((rule) =>
                rule.nodes.map((node) => `${node.html.slice(0, 60)} (${node.any[0]?.message ?? ''})`),
              ),
            };
          },
          [site, theme] as const,
        );

        // Precondition: tokens were checked, not a page without code.
        check(checked > 0, `/docs/quick-start: no code token checked for contrast (${site}, ${theme})`);
        check(
          failing.length === 0,
          `/docs/quick-start, ${site} ${theme}: code below AA contrast: ${failing.join('; ')}`,
        );
      }
    }

    await code.close();
  }

  // The footer revealed from under the page on a desktop only: on a phone, it scrolls in as any content.
  for (const [device, options, revealed] of [
    ['a desktop', { viewport: { width: 1280, height: 900 } }, true],
    ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, false],
  ] as const) {
    const phone = await browser.newPage(options);

    await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });

    // Every control its own box, a mouse or not: it once sat with its hover, kept to a mouse, and a phone's buttons
    // fell back to the browser's own look.
    const unstyled = await phone.evaluate(() =>
      [
        'navbar-toggle',
        'search-dialog-trigger',
        'sort-select-trigger',
        'listing-options-trigger',
        'page-select-trigger',
        'pagination-next',
      ]
        .map((slot) => [slot, document.querySelector(`[data-slot="${slot}"]`)] as const)
        .filter(([, element]) => {
          const style = element === null ? undefined : getComputedStyle(element);

          // The system's control height, and no background of the browser's own (its buttons are gray).
          return style === undefined || style.minHeight === 'auto' || style.backgroundColor !== 'rgba(0, 0, 0, 0)';
        })
        .map(([slot]) => slot),
    );

    check(unstyled.length === 0, `${LISTING} on ${device}: controls without their box: ${unstyled.join(', ')}`);

    // The heading and the compact pagination on one line when they fit (a desktop, and a phone for a short heading),
    // the pagination below when they do not: always at the end of its line.
    {
      await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
      const placed = await phone.evaluate(() => {
        const row = document.querySelector('[data-slot="listing-toolbar"]')?.getBoundingClientRect();
        const heading = document.querySelector('[data-slot="listing-toolbar"] > h1')?.getBoundingClientRect();
        const select = document.querySelector('[data-slot="page-select-trigger"]')?.getBoundingClientRect();

        return row === undefined || heading === undefined || select === undefined
          ? undefined
          : {
              sameLine: Math.abs(heading.top + heading.height / 2 - (select.top + select.height / 2)) < 2,
              below: select.top >= heading.bottom,
              end: Math.round(row.right - select.right),
            };
      });

      check(
        placed !== undefined && placed.end === 0 && (revealed ? placed.sameLine : placed.sameLine || placed.below),
        `${LISTING} on ${device}: the heading and the compact pagination not as expected (${JSON.stringify(placed)})`,
      );
    }

    // A category's pages as a listing's: the compact pagination on its first section's heading line, at its end, a
    // phone's included; the full one on the last section's "see more" line at its end on a desktop, below it on a
    // phone.
    {
      await phone.goto(`${base}/blog/maquis`, { waitUntil: 'networkidle' });
      const placed = await phone.evaluate(() => {
        const row = document.querySelector('[data-slot="folder-heading"]')?.getBoundingClientRect();
        const heading = document.querySelector('[data-slot="folder-heading"] > h2')?.getBoundingClientRect();
        const select = document.querySelector('[data-slot="folder-heading"] > [data-slot="page-select-trigger"]');
        const box = select?.getBoundingClientRect();
        const end = document.querySelector('[data-slot="folder-end"]')?.getBoundingClientRect();
        const more = document
          .querySelector('[data-slot="folder-end"] [data-slot="folder-more"]')
          ?.getBoundingClientRect();
        const pagination = document
          .querySelector('[data-slot="folder-end"] > [data-slot="pagination"] [data-slot="pagination-content"]')
          ?.getBoundingClientRect();
        const center = (rect: DOMRect): number => rect.top + rect.height / 2;
        // Each section's "see more" as far below its cards: the last one's, beside the pagination, too.
        const gaps = [...document.querySelectorAll('[data-slot="folder-section"]')].flatMap((section) => {
          const cards = section.querySelector('[data-slot="listing-cards"]')?.getBoundingClientRect();
          const link = section.querySelector('[data-slot="folder-more"]')?.getBoundingClientRect();

          return cards === undefined || link === undefined ? [] : [link.top - cards.bottom];
        });

        return row === undefined ||
          heading === undefined ||
          box === undefined ||
          end === undefined ||
          more === undefined ||
          pagination === undefined
          ? undefined
          : {
              sameLine: Math.abs(center(heading) - center(box)) < 2,
              end: Math.round(row.right - box.right),
              // On the link's line: beside it, its top at the line's (never centred, which would move it up).
              bottomLine: pagination.top < more.bottom && pagination.bottom > more.top,
              bottomBelow: pagination.top >= more.bottom,
              bottomEnd: Math.round(end.right - pagination.right),
              gaps: gaps.length > 1 && gaps.every((gap) => Math.abs(gap - (gaps[0] ?? 0)) < 1),
            };
      });

      check(
        placed !== undefined &&
          placed.sameLine &&
          placed.end === 0 &&
          placed.bottomEnd === 0 &&
          placed.gaps &&
          (revealed ? placed.bottomLine : placed.bottomBelow),
        `/blog/maquis on ${device}: its paginations not as expected (${JSON.stringify(placed)})`,
      );
    }

    // The full pagination below the cards at the end of its line, on every screen: the blog's, an author's.
    for (const url of ['/blog', '/authors/napoleon']) {
      await phone.goto(`${base}${url}`, { waitUntil: 'networkidle' });
      const gap = await phone.evaluate(() => {
        const pagination = [...document.querySelectorAll('main [data-slot="pagination"]')].at(-1);
        const last = pagination?.querySelector('[data-slot="pagination-content"] > :last-child');

        return pagination === undefined || last === null || last === undefined
          ? undefined
          : Math.round(pagination.getBoundingClientRect().right - last.getBoundingClientRect().right);
      });

      check(
        gap === 0,
        `${url} on ${device}: its pagination below the cards not at the end of its line (${String(gap)})`,
      );
    }

    // The list's controls on one line on a phone, whatever the sort's name: the count at the start, the sort and the
    // gear holding the filters at the end (the longest sort's name once pushed the page select onto a line of its own).
    if (!revealed) {
      await phone.goto(`${base}${LISTING}?sort=title-asc`, { waitUntil: 'networkidle' });
      const line = await phone.evaluate(() => {
        const row = document.querySelector('[data-slot="listing-controls"]')?.getBoundingClientRect();
        const box = (slot: string) => document.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
        const parts = ['listing-total', 'sort-select-trigger', 'listing-options-trigger'].map(box);

        return {
          centers: parts.map((part) => (part === undefined ? -1 : Math.round(part.top + part.height / 2))),
          start: Math.round((parts[0]?.left ?? -1) - (row?.left ?? 0)),
          end: Math.round((row?.right ?? 0) - (parts[2]?.right ?? -1)),
        };
      });

      check(
        new Set(line.centers).size === 1 && !line.centers.includes(-1) && line.start === 0 && line.end === 0,
        `${LISTING}?sort=title-asc on ${device}: the count, the sort and the gear are not one line, end to end (${JSON.stringify(line)})`,
      );
    }

    // Next tapped on a phone keeps the pagination in its place, page after page: the sort's name, once filled by Radix a
    // render after the page's, rewrapped the toolbar above the posts and pushed the pagination 44px down each time.
    if (!revealed) {
      await phone.goto(`${base}${LISTING}/page/6`, { waitUntil: 'networkidle' });
      const steps = phone.locator('[data-slot="pagination"]').first();

      await steps.evaluate((nav) => {
        window.scrollBy(0, nav.getBoundingClientRect().top - window.innerHeight * 0.6);
      });
      await phone.waitForTimeout(300);

      for (const page of [7, 8]) {
        const before = await steps.evaluate((nav) => nav.getBoundingClientRect().top);

        await phone.locator('[data-slot="pagination-next"]').first().tap();
        await phone.waitForURL((next) => next.pathname.endsWith(`/page/${String(page)}`));
        await phone.waitForTimeout(800);
        const after = await steps.evaluate((nav) => nav.getBoundingClientRect().top);

        check(
          Math.abs(after - before) <= 1,
          `${LISTING}/page/${String(page - 1)} on ${device}: next moved the pagination (${String(before)} → ${String(after)})`,
        );
      }
    }

    // The search dialog on the screen, its close button too, once results with long words have come.
    if (!revealed) {
      await phone.goto(`${base}/blog`, { waitUntil: 'networkidle' });
      await phone
        .getByRole('button', { name: /Rechercher/ })
        .first()
        .tap();
      // Once the dialog's field is there: a keystroke before it would be lost.
      await phone.locator('[data-slot="search-box-input"]').fill('figatellu');
      await phone.locator('[data-slot="search-box-result"]').first().waitFor();
      const fits = await phone.evaluate(() => {
        const box = (slot: string): DOMRect | undefined =>
          document.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
        const dialog = box('search-dialog-content');
        const field = box('search-box-field');
        const close = box('search-dialog-close');

        return (
          dialog !== undefined &&
          field !== undefined &&
          close !== undefined &&
          dialog.left >= 0 &&
          dialog.right <= window.innerWidth &&
          close.right <= dialog.right &&
          field.right <= close.left &&
          // The results the dialog's whole width, under the field and the close button alike.
          [...document.querySelectorAll('[data-slot="search-box-result"]')].every(
            (result) => result.getBoundingClientRect().right > close.left,
          )
        );
      });

      check(fits, `/blog on ${device}: the search dialog or its close button leaves the screen`);
    }

    // A card's hover effects with a mouse only: on a phone, a tap (a hover) zooms no image and lights no rim.
    await phone.goto(`${base}/blog`, { waitUntil: 'networkidle' });
    await phone.locator('[data-slot="entry-card-media"]').first().hover();
    await phone.waitForTimeout(500);
    const [zoom, rim] = await phone.evaluate(() => [
      getComputedStyle(document.querySelector('[data-slot="entry-card-image"]') ?? document.body).transform,
      getComputedStyle(document.querySelector('[data-slot="collector"]') ?? document.body, '::after').opacity,
    ]);

    check(
      (zoom !== 'none') === revealed && (rim !== '0') === revealed,
      `/blog on ${device}: a hovered card's zoom is ${zoom}, its rim's opacity ${rim}`,
    );
    await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });

    // On a phone, an author's many pages fit one line (no sibling around the current page), and an ellipsis's menu
    // lists the siblings hidden beside it: `1 … 10 … 21`, the first menu reaching 9.
    if (!revealed) {
      await phone.goto(`${base}/authors/igor/page/10`, { waitUntil: 'networkidle' });
      const pagination = phone.getByRole('navigation', { name: 'Pagination' }).last();
      const lines = await pagination.evaluate((nav) => {
        const shown = [...nav.querySelectorAll('[data-slot="pagination-item"]')].filter(
          (item) => getComputedStyle(item).display !== 'none',
        );

        return new Set(shown.map((item) => Math.round(item.getBoundingClientRect().top))).size;
      });

      check(lines === 1, `/authors/igor/page/10 on ${device}: its pagination wraps onto ${String(lines)} lines`);
      // At the end of the line: its last item on the list's own end.
      const [listEnd, lastEnd] = await pagination.evaluate((nav) => {
        const content = nav.querySelector('[data-slot="pagination-content"]');
        const shown = [...nav.querySelectorAll('[data-slot="pagination-item"]')].filter(
          (item) => getComputedStyle(item).display !== 'none',
        );

        return [content?.getBoundingClientRect().right ?? 0, shown.at(-1)?.getBoundingClientRect().right ?? -1];
      });

      check(
        Math.abs(listEnd - lastEnd) < 1,
        `/authors/igor/page/10 on ${device}: its pagination is not at the line's end`,
      );
      await pagination.getByRole('button').first().tap();
      check(
        (await phone.getByRole('menuitem', { name: 'Page 9' }).count()) === 1,
        `/authors/igor/page/10 on ${device}: the ellipsis does not list the hidden page 9`,
      );
      await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    }

    // On a phone, a compact card's tags on the same center line as its avatars, side by side.
    if (!revealed) {
      await phone.goto(`${base}/blog/academy`, { waitUntil: 'networkidle' });
      const [tagMiddle, authorMiddle] = await phone.evaluate(() => {
        const middle = (slot: string): number => {
          const box = document.querySelector(`[data-slot="entry-card"] [data-slot="${slot}"]`)?.getBoundingClientRect();

          return box === undefined ? Number.NaN : (box.top + box.bottom) / 2;
        };

        return [middle('entry-card-tag'), middle('entry-card-author')];
      });

      check(
        Math.abs(tagMiddle - authorMiddle) < 1,
        `/blog/academy on ${device}: a card's tags ${String(Math.round(authorMiddle - tagMiddle))}px off its avatars`,
      );
      await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    }

    // On a phone, the menu's toggle: two lines, crossed while the menu is open.
    if (!revealed) {
      const lineAngle = () =>
        phone.evaluate(() => {
          const icon = document.querySelector('[data-slot="navbar-toggle-icon"]');
          const matrix = icon === null ? 'none' : getComputedStyle(icon, '::before').transform;
          const [a = 1, b = 0] = matrix === 'none' ? [] : matrix.slice(7, -1).split(',').map(Number);

          return Math.round((Math.atan2(b, a) * 180) / Math.PI);
        });
      const closed = await lineAngle();

      await phone.locator('[data-slot="navbar-toggle"]').tap();
      await phone.waitForTimeout(400);
      const open = await lineAngle();

      await phone.locator('[data-slot="navbar-toggle"]').tap();
      check(
        closed === 0 && open === 45,
        `${LISTING} on ${device}: the toggle's lines at ${String(closed)}° closed, ${String(open)}° open`,
      );
    }

    // On a phone, the closed navbar as much room above its controls as below: no empty line for its closed menu.
    if (!revealed) {
      const [above, below] = await phone.evaluate(() => {
        const bar = document.querySelector('[data-slot="navbar"]')?.getBoundingClientRect();
        const toggle = document.querySelector('[data-slot="navbar-toggle"]')?.getBoundingClientRect();

        return [(toggle?.top ?? 0) - (bar?.top ?? 0), (bar?.bottom ?? 0) - (toggle?.bottom ?? 0)];
      });

      check(
        Math.abs(above - below) < 2,
        `${LISTING} on ${device}: the navbar's padding is ${String(above)} above, ${String(below)} below`,
      );
    }

    // On a phone, the navbar's toggle at the line's start and its extras at its end: never all packed at the start.
    if (!revealed) {
      const edges = await phone.evaluate(() => {
        const box = (slot: string): DOMRect | undefined =>
          document.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
        const navbar = document.querySelector('[data-slot="navbar"]');
        const padding = navbar === null ? 0 : Number.parseFloat(getComputedStyle(navbar).paddingInlineEnd);

        return { toggle: box('navbar-toggle'), extras: box('navbar-extras'), navbar: box('navbar'), padding };
      });
      const { toggle, extras, navbar } = edges;

      check(
        toggle !== undefined &&
          navbar !== undefined &&
          extras !== undefined &&
          Math.abs(navbar.right - edges.padding - extras.right) < 1 &&
          toggle.left < extras.left,
        `${LISTING} on ${device}: the navbar's extras are not at the end of its line`,
      );
    }

    const animation = await phone
      .locator('[data-slot="reveal-content"]')
      .evaluate((element) => getComputedStyle(element).animationName);

    check(
      (animation === 'fig-reveal') === revealed,
      `${LISTING} on ${device}: the footer's reveal is ${animation === 'fig-reveal' ? 'on' : 'off'}`,
    );
    await phone.close();
  }

  // The documentation's section list (`/docs`): four cards prerendered on arrival; on a phone, pagination controls
  // stay hidden and scrolling to the bottom fetches each static JSON batch until every card is rendered and the
  // spinner sentinel disappears; on a desktop, the observer stays off (four cards remain on arrival) and pagination
  // controls switch pages via `?page=N`.
  {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    await phone.goto(`${base}/docs`, { waitUntil: 'networkidle' });
    const countCards = () => phone.locator('[data-slot="folder-list"] [data-slot="entry-card"]').count();
    const initial = await countCards();

    check(initial === 4, `/docs on a phone: expected 4 prerendered cards on arrival, got ${String(initial)}`);
    check(
      !(await phone.locator('[data-slot="section-list"] [data-slot="pagination"]').isVisible()),
      '/docs on a phone: desktop pagination should be hidden',
    );

    let shown = initial;

    while ((await phone.locator('[data-slot="section-list-status"]').count()) > 0) {
      const before = shown;

      await phone.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await phone.waitForFunction(
        (previous) => document.querySelectorAll('[data-slot="folder-list"] [data-slot="entry-card"]').length > previous,
        before,
      );
      shown = await countCards();
    }

    check(shown > 4, `/docs on a phone: expected more than 4 cards after scrolling, got ${String(shown)}`);
    await phone.close();

    const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const titles = (): Promise<string[]> =>
      desktop.evaluate(() =>
        [...document.querySelectorAll('[data-slot="folder-list"] [data-slot="entry-card-title"]')].map(
          (title) => title.textContent,
        ),
      );

    await desktop.goto(`${base}/docs`, { waitUntil: 'networkidle' });
    const page1 = await titles();

    check(page1.length === 4, `/docs on a desktop: expected 4 cards on page 1, got ${String(page1.length)}`);
    check(
      (await desktop.locator('[data-slot="section-list-status"]').count()) === 0,
      '/docs on a desktop: scroll-loading sentinel should not be mounted',
    );
    check(
      (await desktop.locator('[data-slot="section-list"] [data-slot="page-select-trigger"]').isVisible()) &&
        (await desktop.locator('[data-slot="section-list"] [data-slot="pagination"]').isVisible()),
      '/docs on a desktop: pagination controls should be visible',
    );
    const sameLine = await desktop.evaluate(() => {
      const heading = document.querySelector('[data-slot="mdx-h1"]')?.getBoundingClientRect();
      const select = document
        .querySelector('[data-slot="section-list"] [data-slot="page-select-trigger"]')
        ?.getBoundingClientRect();

      return (
        heading !== undefined &&
        select !== undefined &&
        Math.abs(heading.top + heading.height / 2 - (select.top + select.height / 2)) < 2
      );
    });

    check(sameLine, '/docs on a desktop: page select should sit on the same line as the heading');
    await desktop.locator('[data-slot="section-list"] [data-slot="pagination-next"]').click();
    await desktop.waitForURL('**/docs?page=2');
    await desktop
      .waitForFunction(
        (first) =>
          document.querySelector('[data-slot="folder-list"] [data-slot="entry-card-title"]')?.textContent !== first,
        page1[0] ?? '',
      )
      .catch(() => undefined);
    const page2 = await titles();

    check(
      page2.length > 0 && JSON.stringify(page2) !== JSON.stringify(page1),
      `/docs on a desktop: page 2 did not replace page 1 cards (${JSON.stringify(page2)})`,
    );
    await desktop.goBack();
    await desktop.waitForURL((next) => next.pathname === '/docs' && !next.searchParams.has('page'));
    await desktop.waitForTimeout(300);
    check(
      JSON.stringify(await titles()) === JSON.stringify(page1),
      '/docs on a desktop: Back did not restore page 1 cards',
    );
    await desktop.close();
  }

  // An unknown URL: a real 404, yet a page of the site in its locale, with the navigation and a link home.
  for (const [url, lang, title, home, link] of [
    ['/nope/never', 'fr', 'Page introuvable · Figatellultimate', '/', 'Retour à l’accueil'],
    ['/en/nope/never', 'en', 'Page not found · Figatellultimate', '/en', 'Back to the home page'],
  ] as const) {
    const missing = await browser.newPage();
    const response = await missing.goto(`${base}${url}`, { waitUntil: 'networkidle' });

    check(response?.status() === 404, `${url}: status ${String(response?.status())}, not 404`);
    check((await missing.locator('html').getAttribute('lang')) === lang, `${url}: not in ${lang}`);
    check((await missing.title()) === title, `${url}: titled « ${await missing.title()} »`);
    check((await missing.getByRole('navigation').count()) > 0, `${url}: without the site's navigation`);
    check((await missing.locator('[aria-current="page"]').count()) === 0, `${url}: a navigation item marked current`);
    check(
      (await missing.getByRole('link', { name: link }).getAttribute('href')) === home,
      `${url}: no link to ${home}`,
    );
    check(
      // Through next/image: `/_next/image?url=%2Fcovers%2Fplaceholder-151.jpeg&w=…`.
      decodeURIComponent((await missing.locator('[data-slot="backdrop-image"]').getAttribute('src')) ?? '').includes(
        '/_next/image?url=/covers/placeholder-151.jpeg',
      ),
      `${url}: without its backdrop through next/image`,
    );
    await missing.close();
  }

  await browser.close();
} finally {
  server.kill();
}

if (problems.length > 0) {
  console.error(`✖ ${String(problems.length)} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    "✓ previous and next keep the button under the mouse, the page taller or shorter, and under the thumb on a phone; the next pages loaded ahead; the pages of a batch shown without the server, those of a category too, a listing reached from its category at once, the switcher following, Back restoring; Tab straight to the copy buttons, a region a stop only while it overflows; a filter in the URL, or chosen early, is applied; the heading beside the compact pagination when they fit, always for a category, its full pagination on its last line on a desktop, every see more as far below its cards, every full pagination at the end of its line; the listing controls on one line on a phone; the page select reaches its page; a right-to-left layout mirrored; the menu toggle crossed when open; the navbar on one line at any width, compact once its links do not fit; a zoom preloaded on hover; the chosen theme shown before hydration; the code at AA contrast in every theme, light and dark; the search placeholder shown where the text begins, never heard; the shortcut of the search, the keys of the reader, on a desktop only; llms.txt and each page as Markdown at their public URLs, the ARD manifest and its skill; the pagination on one line on a phone; the cards hovered with a mouse only; the search within a phone screen; the footer revealed on a desktop only; the documentation's list revealed in batches on scroll on a phone and paginated on a desktop; an unknown URL is a 404 of the site in its locale.",
  );
}

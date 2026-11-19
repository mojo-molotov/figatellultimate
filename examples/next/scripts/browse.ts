// Behavior on the real `next build`, in a real browser: what only Chromium and Next's router show, never the static
// HTML (`verify.ts`) nor the packages' own tests. Each check states the bug it guards against.
// Run after `pnpm example:build`: `pnpm example:browse [--port N]` (plain Node, Chromium).
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium, type Page } from 'playwright';

import { blogIndex, findBlogFolderByUrl } from '#figatellultimate/blog';

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

  // A filter chosen before the index arrives is applied once it is here, never lost.
  const early = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await early.route('**/listing/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await early.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
  await early.getByRole('button', { name: /^Tags/ }).click();
  await early.getByRole('option').first().click();
  await early.waitForURL(/tags=/, { timeout: 5000 }).catch(() => undefined);
  check(new URL(early.url()).searchParams.has('tags'), `${LISTING}: a filter chosen before the index was lost`);
  await early.close();

  // The compact pagination reaches a prerendered page.
  const select = await open(LISTING);

  await select.getByRole('combobox', { name: 'Aller à la page' }).click();
  await select.getByRole('option', { name: '4', exact: true }).click();
  await select.waitForURL('**/page/4', { timeout: 5000 }).catch(() => undefined);
  check(new URL(select.url()).pathname === `${LISTING}/page/4`, `${LISTING}: the page select did not reach page 4`);
  await select.close();

  // The footer revealed from under the page on a desktop only: on a phone, it scrolls in as any content.
  for (const [device, options, revealed] of [
    ['a desktop', { viewport: { width: 1280, height: 900 } }, true],
    ['a phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, false],
  ] as const) {
    const phone = await browser.newPage(options);

    await phone.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    const animation = await phone
      .locator('[data-slot="reveal-content"]')
      .evaluate((element) => getComputedStyle(element).animationName);

    check(
      (animation === 'fig-reveal') === revealed,
      `${LISTING} on ${device}: the footer's reveal is ${animation === 'fig-reveal' ? 'on' : 'off'}`,
    );
    await phone.close();
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
    '✓ previous and next keep the button under the mouse, the page taller or shorter; a filter in the URL, or chosen early, is applied; the page select reaches its page; the footer revealed on a desktop only; an unknown URL is a 404 of the site in its locale.',
  );
}

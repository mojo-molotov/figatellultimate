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

  // The next page loaded ahead once a listing shows, before any click: its payload, through Next's router.
  {
    const ahead = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const asked: string[] = [];

    ahead.on('request', (request) => {
      if (request.headers()['rsc'] !== undefined) asked.push(new URL(request.url()).pathname);
    });
    await ahead.goto(`${base}${LISTING}`, { waitUntil: 'networkidle' });
    check(asked.includes(`${LISTING}/page/2`), `${LISTING}: its next page not loaded ahead (${JSON.stringify(asked)})`);
    await ahead.close();
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
  await select.getByRole('option', { name: '4', exact: true }).click();
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
        color('[data-slot="site-theme-option"][value="paper"]'),
        getComputedStyle(probe).color,
      ];
    });

    check(chosen === accent && other !== accent, `${LISTING}: the chosen theme is not shown before hydration`);
    await context.close();
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

    // The list's controls on one line on a phone, whatever the sort's name: the count at the start, the sort and the
    // gear holding the filters at the end (the longest sort's name once pushed the page select onto a line of its own).
    if (!revealed) {
      await phone.goto(`${base}${LISTING}?sort=title-asc`, { waitUntil: 'networkidle' });
      const line = await phone.evaluate(() => {
        const row = document.querySelector('[data-slot="listing-controls"]')?.getBoundingClientRect();
        const box = (slot: string) => document.querySelector(`[data-slot="${slot}"]`)?.getBoundingClientRect();
        const parts = ['listing-total', 'sort-select-trigger', 'listing-options-trigger'].map(box);

        return {
          centres: parts.map((part) => (part === undefined ? -1 : Math.round(part.top + part.height / 2))),
          start: Math.round((parts[0]?.left ?? -1) - (row?.left ?? 0)),
          end: Math.round((row?.right ?? 0) - (parts[2]?.right ?? -1)),
        };
      });

      check(
        new Set(line.centres).size === 1 && !line.centres.includes(-1) && line.start === 0 && line.end === 0,
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

    // On a phone, a compact card's tags on the same centre line as its avatars, side by side.
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
    '✓ previous and next keep the button under the mouse, the page taller or shorter, and under the thumb on a phone; the next page loaded ahead; a filter in the URL, or chosen early, is applied; the heading beside the compact pagination when they fit; the listing controls on one line on a phone; the page select reaches its page; a right-to-left layout mirrored; the menu toggle crossed when open; a zoom preloaded on hover; the chosen theme shown before hydration; the pagination on one line on a phone; the cards hovered with a mouse only; the search within a phone screen; the footer revealed on a desktop only; an unknown URL is a 404 of the site in its locale.',
  );
}

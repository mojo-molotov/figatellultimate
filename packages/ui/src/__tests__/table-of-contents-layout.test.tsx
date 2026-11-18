// @vitest-environment happy-dom
// Reading, with the stylesheet and real scrolling: only a real browser computes it (`pnpm test:browser`).
import '../styles.css';

import type { Heading } from '@figatellu/toc';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TableOfContents } from '../index.js';
import { tocScript } from '../scripts.js';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const inBrowser = !navigator.userAgent.includes('HappyDOM');

/** Twelve sections of a long article, the last one short. */
const HEADINGS: readonly Heading[] = Array.from({ length: 12 }, (_, i) => ({
  id: `section-${String(i + 1)}`,
  text: `Section ${String(i + 1)}`,
  depth: 2,
}));

/** The page: its last `short` sections short (120 px), the others long. */
function renderPage(short = 1) {
  render(
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 14rem', gap: '2rem', width: '1100px' }}>
      <article>
        {HEADINGS.map((heading, i) => (
          <section key={heading.id}>
            <h2 id={heading.id} style={{ scrollMarginTop: '64px' }}>
              {heading.text}
            </h2>
            <div style={{ height: i >= HEADINGS.length - short ? '120px' : '700px' }} />
          </section>
        ))}
      </article>
      <TableOfContents headings={HEADINGS} labels={{ title: 'Sur cette page' }} />
    </div>,
  );

  return screen.getByRole('navigation', { name: 'Sur cette page' });
}

const current = (nav: HTMLElement): string | undefined =>
  within(nav)
    .queryAllByRole('link')
    .find((link) => link.getAttribute('aria-current') === 'location')?.textContent ?? undefined;

const scrollToY = async (y: number) => {
  window.scrollTo({ top: y, behavior: 'instant' });
  window.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

const topOf = (id: string): number => (document.getElementById(id)?.getBoundingClientRect().top ?? 0) + window.scrollY;

afterEach(() => {
  cleanup();
  // The drawer's open or closed choice is remembered: every test starts from the default.
  localStorage.clear();
  window.scrollTo({ top: 0, behavior: 'instant' });
  history.replaceState(null, '', location.pathname);
});

describe('TableOfContents while reading', () => {
  it.skipIf(!inBrowser)('the reading line: a heading reaching 30% of the screen is current', async () => {
    const nav = renderPage();
    const line = window.innerHeight * 0.3;

    await scrollToY(0);
    await waitFor(() => {
      expect(current(nav)).toBe('Section 1');
    });

    // Scrolled down slowly to where section 6 just passed the line: current, step by step.
    for (let y = topOf('section-6') - line - 400; y <= topOf('section-6') - line + 20; y += 40) await scrollToY(y);

    await waitFor(() => {
      expect(current(nav)).toBe('Section 6');
    });

    // Back up slowly until it is under the line again: section 5.
    for (let y = window.scrollY; y >= topOf('section-6') - line - 60; y -= 20) await scrollToY(y);

    await waitFor(() => {
      expect(current(nav)).toBe('Section 5');
    });
  });

  it.skipIf(!inBrowser)('short sections, a slow scroll: one heading at a time, never a jump', async () => {
    render(
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 14rem', width: '1100px' }}>
        <article>
          <div style={{ height: '600px' }} />
          {HEADINGS.map((heading) => (
            <section key={heading.id}>
              <h2 id={heading.id} style={{ scrollMarginTop: '64px', margin: 0 }}>
                {heading.text}
              </h2>
              <p style={{ height: '60px', margin: 0 }} />
            </section>
          ))}
          <div style={{ height: '1200px' }} />
        </article>
        <TableOfContents headings={HEADINGS} labels={{ title: 'Sur cette page' }} />
      </div>,
    );
    const nav = screen.getByRole('navigation', { name: 'Sur cette page' });
    const index = (): number => Number((current(nav) ?? 'Section 0').replace('Section ', ''));
    const seen: number[] = [];
    const max = document.documentElement.scrollHeight - window.innerHeight;

    for (let y = 0; y <= max; y += 12) {
      await scrollToY(y);
      seen.push(index());
    }

    for (let y = max; y >= 0; y -= 12) {
      await scrollToY(y);
      seen.push(index());
    }

    for (let k = 1; k < seen.length; k++) expect(Math.abs((seen[k] ?? 0) - (seen[k - 1] ?? 0))).toBeLessThanOrEqual(1);

    expect(Math.max(...seen)).toBe(12);
    expect(seen.at(-1)).toBe(1);
  });

  it.skipIf(!inBrowser)('at the very bottom, the last heading', async () => {
    const nav = renderPage();

    await scrollToY(document.documentElement.scrollHeight);
    await waitFor(() => {
      expect(current(nav)).toBe('Section 12');
    });
  });

  it.skipIf(!inBrowser)('a click locks the followed heading while its smooth scroll runs: no flashing', async () => {
    const user = userEvent.setup();
    const nav = renderPage();
    const passed = new Set<string>();
    const watch = (): void => {
      const text = current(nav);

      if (text !== undefined) passed.add(text);
    };

    window.addEventListener('scroll', watch);
    await user.click(within(nav).getByRole('link', { name: 'Section 10' }));
    await waitFor(
      () => {
        expect(Math.abs((document.getElementById('section-10')?.getBoundingClientRect().top ?? 999) - 64)).toBeLessThan(
          4,
        );
      },
      { timeout: 3000 },
    );
    window.removeEventListener('scroll', watch);
    // Only the followed heading was ever current during the scroll (and maybe the first, before it started).
    expect([...passed].filter((text) => text !== 'Section 1' && text !== 'Section 10')).toEqual([]);
  });

  it.skipIf(!inBrowser)('highlights every section on screen, the line spanning them', async () => {
    const nav = renderPage();

    // The end of section 3 and the start of section 4 share the screen.
    await scrollToY(topOf('section-4') - window.innerHeight / 2);
    const lit = (): string[] =>
      [...nav.querySelectorAll('[data-slot="toc-link"][data-visible]')].map((link) => link.textContent);

    await waitFor(() => {
      expect(lit()).toEqual(['Section 3', 'Section 4']);
    });
    const line = nav.querySelector<HTMLElement>('[data-slot="toc-indicator"]');
    const links = [...nav.querySelectorAll<HTMLElement>('[data-slot="toc-link"][data-visible]')];

    await waitFor(() => {
      const box = line?.getBoundingClientRect();

      expect(Math.abs((box?.top ?? 0) - (links[0]?.getBoundingClientRect().top ?? 99))).toBeLessThan(2);
      expect(Math.abs((box?.bottom ?? 0) - (links[1]?.getBoundingClientRect().bottom ?? 99))).toBeLessThan(2);
    });
    // Only one of them is the reading position.
    expect(nav.querySelectorAll('[aria-current="location"]')).toHaveLength(1);
  });

  it.skipIf(!inBrowser)('keeps the current link visible in its own list', async () => {
    const nav = renderPage();
    const panel = nav.querySelector<HTMLElement>('[data-slot="toc-panel"]');

    if (panel === null) throw new Error('no panel');

    // Precondition: the panel scrolls (a short screen).
    panel.style.height = '10rem';
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight);
    await scrollToY(topOf('section-11') + 50);
    await waitFor(() => {
      const link = within(nav).getByRole('link', { name: 'Section 11' }).getBoundingClientRect();
      const box = panel.getBoundingClientRect();

      expect(link.top).toBeGreaterThanOrEqual(box.top - 1);
      expect(link.bottom).toBeLessThanOrEqual(box.bottom + 1);
    });
  });

  it.skipIf(!inBrowser)('a click scrolls to the heading, the hash replaced, focus on it', async () => {
    const user = userEvent.setup();
    const nav = renderPage();
    const before = history.length;

    await user.click(within(nav).getByRole('link', { name: 'Section 8' }));
    await waitFor(
      () => {
        expect(Math.abs((document.getElementById('section-8')?.getBoundingClientRect().top ?? 999) - 64)).toBeLessThan(
          4,
        );
      },
      { timeout: 3000 },
    );
    expect(location.hash).toBe('#section-8');
    expect(history.length).toBe(before);
    expect(document.activeElement?.id).toBe('section-8');
    await waitFor(() => {
      expect(current(nav)).toBe('Section 8');
    });
  });

  it.skipIf(!inBrowser)('after a click the clicked heading stays current, a little scrolling keeps it', async () => {
    const user = userEvent.setup();
    const nav = renderPage();

    await user.click(within(nav).getByRole('link', { name: 'Section 7' }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(current(nav)).toBe('Section 7');
    await scrollToY(window.scrollY + 20);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(current(nav)).toBe('Section 7');
  });

  it.skipIf(!inBrowser)('a click on a heading of the last screen does not give the last heading', async () => {
    const user = userEvent.setup();
    const nav = renderPage();

    await user.click(within(nav).getByRole('link', { name: 'Section 11' }));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(current(nav)).toBe('Section 11');
    // It stops just short of the very bottom.
    expect(Math.ceil(window.scrollY + window.innerHeight)).toBeLessThan(document.documentElement.scrollHeight);
  });

  it.skipIf(!inBrowser)("past 200px, the collapsed drawer's handle fades; the open drawer's does not", async () => {
    const user = userEvent.setup();
    const nav = renderPage();
    const handle = nav.querySelector<HTMLElement>('[data-slot="toc-toggle"]');

    if (handle === null) throw new Error('no handle');

    const opacity = (): number => Number(getComputedStyle(handle).opacity);

    await scrollToY(150);
    await waitFor(() => {
      expect(nav.hasAttribute('data-scrolled')).toBe(false);
    });
    await scrollToY(220);
    await waitFor(() => {
      expect(nav.hasAttribute('data-scrolled')).toBe(true);
    });
    // Open (a wide screen's default): its handle stays opaque.
    expect(opacity()).toBe(1);
    await user.click(handle);
    await user.unhover(handle);

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    await waitFor(() => {
      expect(opacity()).toBeCloseTo(0.5, 1);
    });
  });

  it.skipIf(!inBrowser)("the current heading's bar sits on the track at every depth (h2 to h4)", async () => {
    const user = userEvent.setup();
    const nested: readonly Heading[] = [
      { id: 'a', text: 'A', depth: 2 },
      { id: 'a1', text: 'A.1', depth: 3 },
      { id: 'a11', text: 'A.1.1', depth: 4 },
      { id: 'b', text: 'B', depth: 2 },
    ];

    render(
      <div>
        <article>
          {nested.map((heading) => {
            return (
              <section key={heading.id}>
                {createElement(`h${String(heading.depth)}`, { id: heading.id }, heading.text)}
                <div style={{ height: '900px' }} />
              </section>
            );
          })}
        </article>
        <TableOfContents headings={nested} labels={{ title: 'Sur cette page' }} maxDepth={4} />
      </div>,
    );
    const nav = screen.getByRole('navigation', { name: 'Sur cette page' });
    const track = nav.querySelector<HTMLElement>('[data-slot="toc-list"]')?.getBoundingClientRect().left ?? 0;

    for (const name of ['A', 'A.1', 'A.1.1']) {
      const link = within(nav).getByRole('link', { name });

      await user.click(link);
      await waitFor(() => {
        expect(link.getAttribute('aria-current')).toBe('location');
      });
      const bar = getComputedStyle(link, '::before');

      // Its bar starts where the list's track does, whatever the indentation.
      expect(Math.abs(link.getBoundingClientRect().left + Number.parseFloat(bar.left) - track)).toBeLessThan(1);
    }
  });

  it.skipIf(!inBrowser)('after a click, the sections on screen are those around the clicked heading', async () => {
    const user = userEvent.setup();
    const nav = renderPage();

    await user.click(within(nav).getByRole('link', { name: 'Section 7' }));
    await waitFor(() => {
      const lit = [...nav.querySelectorAll('[data-slot="toc-link"][data-visible]')].map((link) => link.textContent);

      expect(lit).toContain('Section 7');
      expect(lit).not.toContain('Section 1');
    });
  });

  it.skipIf(!inBrowser)(
    'short last sections: after a click, a little scrolling gives the next heading, the last only at the bottom',
    async () => {
      const user = userEvent.setup();
      const tail: readonly Heading[] = [
        { id: 'one', text: 'One', depth: 2 },
        { id: 'two', text: 'Two', depth: 2 },
        { id: 'three', text: 'Three', depth: 2 },
        { id: 'four', text: 'Four', depth: 2 },
      ];

      render(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 14rem', width: '1100px' }}>
          <article>
            <div style={{ height: '1600px' }} />
            {tail.map((heading) => (
              <section key={heading.id}>
                <h2 id={heading.id} style={{ scrollMarginTop: '64px', margin: 0 }}>
                  {heading.text}
                </h2>
                <p style={{ height: '220px', margin: 0 }} />
              </section>
            ))}
          </article>
          <TableOfContents headings={tail} labels={{ title: 'Sur cette page' }} />
        </div>,
      );
      const nav = screen.getByRole('navigation', { name: 'Sur cette page' });

      await user.click(within(nav).getByRole('link', { name: 'Two' }));
      await waitFor(() => {
        expect(current(nav)).toBe('Two');
      });
      const max = document.documentElement.scrollHeight - window.innerHeight;

      // Precondition: the page ends before the last headings reach the reading line.
      expect(window.scrollY).toBeLessThan(max);
      const seen: (string | undefined)[] = [];

      for (let y = window.scrollY; y < max - 2; y += 8) {
        await scrollToY(y);
        seen.push(current(nav));
      }

      expect(seen).not.toContain('Four');
      expect([...new Set(seen)]).toEqual(['Two', 'Three']);
      await scrollToY(max);
      await waitFor(() => {
        expect(current(nav)).toBe('Four');
      });
    },
  );

  it.skipIf(!inBrowser)(
    'stays docked at the top when the page ends before the screen (a footer revealed)',
    async () => {
      render(
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '16rem 1fr', alignItems: 'start', width: '1100px' }}>
            <TableOfContents headings={HEADINGS.slice(0, 2)} labels={{ title: 'Sur cette page' }} />
            <article>
              {HEADINGS.slice(0, 2).map((heading) => (
                <section key={heading.id}>
                  <h2 id={heading.id}>{heading.text}</h2>
                  <div style={{ height: '1500px' }} />
                </section>
              ))}
            </article>
          </div>
          <footer style={{ height: '400px' }} />
        </>,
      );
      const toc = screen.getByRole('navigation', { name: 'Sur cette page' }).closest('[data-slot="toc"]');

      if (!(toc instanceof HTMLElement)) throw new Error('no table of contents');

      await scrollToY(document.documentElement.scrollHeight - window.innerHeight);
      // Precondition: the article ends above the screen's bottom, the footer below it.
      expect(toc.parentElement?.getBoundingClientRect().bottom).toBeLessThan(window.innerHeight);
      expect(toc.getBoundingClientRect().top).toBeCloseTo(0, 0);
    },
  );

  it.skipIf(!inBrowser)(
    'a hash landing at the very bottom: nudged back up, still current, and a scroll down reaches the last heading',
    async () => {
      history.replaceState(null, '', '#section-11');
      const nav = renderPage(2);
      const bottom = document.documentElement.scrollHeight - window.innerHeight;

      // The browser scrolled as far as the page goes, short of the hash's heading reaching the top.
      await scrollToY(bottom);
      // Precondition: the heading could not reach the top dead zone.
      expect(document.getElementById('section-11')?.getBoundingClientRect().top).toBeGreaterThan(64);
      await waitFor(() => {
        expect(window.scrollY).toBe(bottom - 2);
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(current(nav)).toBe('Section 11');
      await scrollToY(bottom);
      await waitFor(() => {
        expect(current(nav)).toBe('Section 12');
      });
    },
  );

  it.skipIf(!inBrowser)('honours the hash on load', async () => {
    history.replaceState(null, '', '#section-9');
    const nav = renderPage();

    document.getElementById('section-9')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    await scrollToY(window.scrollY);
    await waitFor(() => {
      expect(current(nav)).toBe('Section 9');
    });
  });
});

describe('a remembered closed table of contents, before and after hydration (tocScript)', () => {
  const KEY = 'test:toc-remembered';

  afterEach(() => {
    delete document.documentElement.dataset['toc'];
    localStorage.removeItem(KEY);
    document.querySelector('[data-test="prerendered"]')?.remove();
  });

  /** The script as the app puts it in <head>. */
  const run = (): void => {
    const script = document.createElement('script');

    script.textContent = tocScript(KEY);
    document.head.append(script);
    script.remove();
  };

  it.skipIf(!inBrowser)('marks <html> only for a closed choice, and never throws', () => {
    localStorage.setItem(KEY, 'open');
    run();
    expect(document.documentElement.dataset['toc']).toBeUndefined();
    localStorage.setItem(KEY, 'closed');
    run();
    expect(document.documentElement.dataset['toc']).toBe('closed');
    expect(tocScript(KEY).startsWith('try{')).toBe(true);
  });

  it.skipIf(!inBrowser)('the prerendered page shows it closed, and hydrating never slides it', () => {
    // Precondition: a wide screen, where it is open by default.
    expect(matchMedia('(min-width: 80rem)').matches).toBe(true);
    localStorage.setItem(KEY, 'closed');
    run();
    // The server's markup: no `data-open` yet.
    document.body.insertAdjacentHTML(
      'beforeend',
      '<nav data-test="prerendered" data-slot="toc"><div data-slot="toc-panel"></div></nav>',
    );
    const prerendered = document.querySelector('[data-test="prerendered"]');

    if (!(prerendered instanceof HTMLElement)) throw new Error('no markup');

    const closed = getComputedStyle(prerendered).transform;

    // Slid out toward its start edge, its whole width: not merely `translateX(0)`, the open position.
    expect(new DOMMatrix(closed).m41).toBeLessThan(0);
    expect(getComputedStyle(prerendered.querySelector('[data-slot="toc-panel"]') ?? prerendered).visibility).toBe(
      'hidden',
    );
    // Hydrated: closed from the stored choice, at the very same place, so no transition starts.
    render(<TableOfContents headings={HEADINGS} labels={{ title: 'Sur cette page' }} storageKey={KEY} />);
    const toc = screen.getByRole('navigation', { name: 'Sur cette page' });

    expect(toc.getAttribute('data-open')).toBe('false');
    expect(getComputedStyle(toc).transform).toBe(closed);
    expect(toc.getAnimations()).toEqual([]);
  });
});

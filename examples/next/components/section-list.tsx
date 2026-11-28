'use client';

// prettier-ignore
/**
 * A section's list of pages (`/docs`), loading subsequent batches from static JSON files as the reader scrolls:
 *
 *     SectionPages (server: first 4 cards) ──> SectionList ──> <ul data-slot="folder-list">
 *                                                          └─> sentinel + spinner: intersecting fetches next JSON batch
 *
 * Key design decisions:
 *     - Real lazy loading: only the first batch (four cards) is in the prerendered HTML; subsequent batches live in
 *       static JSON files (`app/[locale]/section-batches/[...slug]/route.ts`) validated with valibot on arrival, so
 *       initial HTML, DOM size and image work stay minimal.
 *     - A decorative spinner (`[data-slot="section-list-spinner"]`, same look and 150ms delay as the search modal's)
 *       shows while a batch is in flight and disappears once every batch is loaded.
 *
 * Invariants: `/docs` prerenders four cards and writes its remaining batches as static JSON (`scripts/verify.ts`);
 * scrolling to the bottom fetches each batch and reveals every card (`scripts/browse.ts`).
 */
import { Collector } from '@figatellultimate/effects';
import { EntryCard, type EntryCardLabels } from '@figatellultimate/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as v from 'valibot';

import type { Locale } from '#figatellultimate/locales';

import type { SectionBatchItem } from '../lib/section-batches';

/** An item rendered on the server for the initial batch. */
export interface SectionInitialItem {
  readonly key: string;
  readonly node: ReactNode;
}

const BatchSchema = v.array(
  v.variant('kind', [
    v.object({ kind: v.literal('heading'), key: v.string(), title: v.string() }),
    v.object({
      kind: v.literal('card'),
      key: v.string(),
      href: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      image: v.optional(v.string()),
    }),
  ]),
);

/**
 * A section's list of pages: first batch prerendered, subsequent batches fetched as JSON on scroll.
 *
 * @param props - The server-rendered first batch, the remaining batches' JSON URLs, the locale and card labels.
 * @returns The list, with a sentinel and spinner below it while more batches remain.
 */
export function SectionList({
  initial,
  batchUrls,
  locale,
  labels,
}: {
  readonly initial: readonly SectionInitialItem[];
  readonly batchUrls: readonly string[];
  readonly locale: Locale;
  readonly labels: EntryCardLabels;
}): ReactNode {
  const [loaded, setLoaded] = useState<readonly SectionBatchItem[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const hasMore = nextIndex < batchUrls.length;

  useEffect(() => {
    if (!hasMore) return;

    const target = sentinel.current;

    if (target === null || typeof IntersectionObserver === 'undefined') return;

    let active = true;
    const loadNext = (): void => {
      const url = batchUrls[nextIndex];

      if (url === undefined || inFlight.current) return;

      inFlight.current = true;
      setStatus('loading');

      void fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);

          return response.json() as Promise<unknown>;
        })
        .then((json) => {
          const items = v.parse(BatchSchema, json);

          if (!active) return;

          setLoaded((previous) => [...previous, ...items]);
          setNextIndex((index) => index + 1);
          setStatus('idle');
          inFlight.current = false;
        })
        .catch(() => {
          if (!active) return;

          setStatus('idle');
          inFlight.current = false;
        });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadNext();
      },
      { rootMargin: '200px' },
    );

    observer.observe(target);

    return () => {
      active = false;
      inFlight.current = false;
      observer.disconnect();
    };
  }, [hasMore, nextIndex, batchUrls]);

  return (
    <>
      <ul data-slot="folder-list">
        {initial.map((item) => (
          <li key={item.key}>{item.node}</li>
        ))}
        {loaded.map((item) => (
          <li key={item.key}>
            {item.kind === 'heading' ? (
              <h2>{item.title}</h2>
            ) : (
              <Collector>
                <EntryCard
                  href={item.href}
                  title={item.title}
                  {...(item.description === undefined ? {} : { description: item.description })}
                  {...(item.image === undefined ? {} : { image: item.image })}
                  locale={locale}
                  labels={labels}
                />
              </Collector>
            )}
          </li>
        ))}
      </ul>
      {hasMore ? (
        <div ref={sentinel} data-slot="section-list-status" data-status={status} aria-hidden>
          <span data-slot="section-list-spinner" />
        </div>
      ) : null}
    </>
  );
}

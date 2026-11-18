import { describe, expect, it } from 'vitest';

import { planSync, stateAfterBuild, type SyncInput, type SyncState } from '../sync-plan.js';

const state = (held: string[], skipped: string[] = []): SyncState => ({
  held: new Map([['blog', new Set(held)]]),
  skipped: new Map([['blog', new Set(skipped)]]),
});
const input = (listed: string[], current: SyncState, changed: string[] = [], threshold = 100): SyncInput => ({
  ...current,
  listed: { blog: listed },
  changed: changed.map((sourcePath) => ({ collection: 'blog', sourcePath })),
  threshold,
});
const operations = (plan: ReturnType<typeof planSync>): string[] =>
  plan.kind === 'sync' ? plan.operations.map((o) => `${o.modification} ${o.sourcePath}`) : ['rescan'];

describe('planSync', () => {
  it('does nothing when the source holds exactly what is on disk and nothing changed', () => {
    expect(operations(planSync(input(['a.mdx', 'b.mdx'], state(['a.mdx', 'b.mdx']))))).toEqual([]);
  });

  it('creates files the watcher missed and deletes files it held that left the disk', () => {
    const plan = planSync(input(['a.mdx', 'new/b.mdx'], state(['a.mdx', 'gone.mdx'])));

    expect(operations(plan)).toEqual(['delete gone.mdx', 'create new/b.mdx']);
  });

  it('a folder move becomes deletes of the old paths and creates of the new ones', () => {
    const plan = planSync(input(['guides/x.mdx', 'guides/y.mdx'], state(['tutorials/x.mdx', 'tutorials/y.mdx'])));

    expect(operations(plan)).toEqual([
      'create guides/x.mdx',
      'create guides/y.mdx',
      'delete tutorials/x.mdx',
      'delete tutorials/y.mdx',
    ]);
  });

  it('updates a reported file it holds, and applies reports from the disk state', () => {
    const plan = planSync(input(['a.mdx'], state(['a.mdx']), ['a.mdx', 'flash.mdx']));

    // `flash.mdx` was created then deleted before the run: nothing to do.
    expect(operations(plan)).toEqual(['update a.mdx']);
  });

  it('never deletes a file the source does not hold (its delete would remove another one)', () => {
    expect(operations(planSync(input([], state([]), ['unknown.mdx'])))).toEqual([]);
  });

  it('does not retry skipped files unless they changed', () => {
    expect(operations(planSync(input(['a.mdx', 'cover.png'], state(['a.mdx'], ['cover.png']))))).toEqual([]);
    expect(
      operations(planSync(input(['a.mdx', 'broken.mdx'], state(['a.mdx'], ['broken.mdx']), ['broken.mdx']))),
    ).toEqual(['create broken.mdx']);
  });

  it('leaves a collection whose listing failed untouched (absent from listed)', () => {
    const plan = planSync({ ...state(['a.mdx']), listed: {}, changed: [], threshold: 100 });

    expect(operations(plan)).toEqual([]);
  });

  it('prefers one rescan above the threshold (bulk changes: git checkout, big moves)', () => {
    const listed = Array.from({ length: 30 }, (_, i) => `bulk/${String(i)}.mdx`);

    expect(planSync(input(listed, state([]), [], 20))).toEqual({ kind: 'rescan' });
    expect(planSync(input(listed.slice(0, 20), state([]), [], 20)).kind).toBe('sync');
  });
});

describe('stateAfterBuild', () => {
  it('skips listed files the source did not take, keeps collections that were not listed', () => {
    const previous = { held: new Map(), skipped: new Map([['pages', new Set(['logo.svg'])]]) };
    const next = stateAfterBuild(previous, { blog: ['a.mdx', 'cover.png'] }, [
      { collection: 'blog', sourcePath: 'a.mdx' },
    ]);

    expect([...(next.held.get('blog') ?? [])]).toEqual(['a.mdx']);
    expect([...(next.skipped.get('blog') ?? [])]).toEqual(['cover.png']);
    expect([...(next.skipped.get('pages') ?? [])]).toEqual(['logo.svg']);
  });
});

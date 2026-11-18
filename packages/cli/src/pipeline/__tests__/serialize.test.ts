import { describe, expect, it } from 'vitest';

import { createSerializedRunner } from '../serialize.js';

const tick = (ms = 10): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('createSerializedRunner', () => {
  it('runs never overlap, and a burst of triggers gives exactly one follow-up run', async () => {
    let running = 0;
    let overlapped = false;
    let runs = 0;
    const runner = createSerializedRunner(async () => {
      running += 1;
      overlapped ||= running > 1;
      runs += 1;
      await tick();
      running -= 1;
    });

    runner.trigger();

    for (let i = 0; i < 5; i += 1) runner.trigger();

    await runner.idle();
    expect(overlapped).toBe(false);
    expect(runs).toBe(2);
  });

  it('aborts the run in progress when a newer trigger arrives, then runs a fresh one to the end', async () => {
    const outcomes: string[] = [];
    const runner = createSerializedRunner(async (signal) => {
      for (let step = 0; step < 5; step += 1) {
        await tick(5);
        // A checkpoint, as in streamContent: a superseded run stops here.
        signal.throwIfAborted();
      }

      outcomes.push('completed');
    });

    runner.trigger();
    await tick(7);
    runner.trigger();
    await runner.idle();
    // The first run was superseded: only the fresh one completed, and the abort was not reported as a failure.
    expect(outcomes).toEqual(['completed']);
  });

  it('accepts new triggers after a run that threw, and reports errors that are not cancellations', async () => {
    let runs = 0;
    const runner = createSerializedRunner(() => {
      runs += 1;

      return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve();
    });

    runner.trigger();
    await expect(runner.idle()).rejects.toThrow('boom');
    runner.trigger();
    await runner.idle();
    expect(runs).toBe(2);
  });
});

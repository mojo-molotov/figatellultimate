/**
 * Serialized runs for watch mode (`serialize.test.ts`): never two at once; a newer change aborts the stale run at
 * its next checkpoint and starts one fresh run; a throwing run does not block the next.
 */
/**
 * Serialized runs for watch mode: one run at a time. A trigger arriving during a run aborts it
 * (it stops at its next checkpoint) and schedules exactly one fresh run, so stale runs never go to the end and a
 * burst of changes never starts concurrent regenerations.
 */
export interface SerializedRunner {
  /** A change: aborts the running run, if any, and schedules exactly one fresh run. */
  trigger(): void;
  /** Resolves once no run is in progress nor pending. */
  idle(): Promise<void>;
}

/**
 * Creates the runner of watch mode.
 *
 * @param run - One run, honoring its abort signal.
 * @returns A runner: `trigger()` aborts a running run and schedules exactly one fresh run; `idle()` waits for the
 *   queue to settle.
 */
export function createSerializedRunner(run: (signal: AbortSignal) => Promise<void>): SerializedRunner {
  let current: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let pending = false;
  // Read through a function: `trigger()` may set `pending` while `run()` is awaited, which flow analysis cannot see.
  const hasPending = (): boolean => pending;
  const loop = async (): Promise<void> => {
    try {
      do {
        pending = false;
        controller = new AbortController();
        const { signal } = controller;

        try {
          await run(signal);
        } catch (error) {
          // A superseded run is expected to stop by throwing its signal's reason: not a failure.
          if (!signal.aborted) throw error;
        }
      } while (hasPending());
    } finally {
      // Even when a run throws, the runner must accept the next trigger.
      controller = null;
      current = null;
    }
  };

  return {
    trigger() {
      if (current === null) {
        current = loop();

        return;
      }

      pending = true;
      controller?.abort();
    },
    async idle() {
      while (current !== null) await current;
    },
  };
}

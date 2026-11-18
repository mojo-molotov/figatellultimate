/**
 * The `Result` type of railway-oriented programming: expected failures are values, never exceptions.
 *
 * Key design decisions:
 *     - Two exhaustive tracks: `Ok` with a value, `Err` with at least one error; warnings ride along both.
 *     - `andThen` chains dependent steps (short-circuits); `combine` runs independent ones and accumulates every
 *       error: a path with three problems reports three diagnostics, not the first.
 *     - Minimal and dependency-free: no external library in core; no partial-result shape whose fields are all
 *       optional (types would promise less than the runtime).
 *     - Frozen values.
 *
 * Invariants (`result.test.ts`): the laws of each combinator, error accumulation, warnings kept.
 */
/** Success track. Warnings ride along. */
export interface Ok<T, W = never> {
  readonly ok: true;
  readonly value: T;
  readonly warnings: readonly W[];
}

/** Failure track: always at least one error. */
export interface Err<E, W = never> {
  readonly ok: false;
  readonly errors: readonly [E, ...E[]];
  readonly warnings: readonly W[];
}

/** Exhaustive two-track result (railway-oriented programming). */
export type Result<T, E, W = never> = Ok<T, W> | Err<E, W>;

type AnyResult = Result<unknown, unknown, unknown>;

/** Values of a tuple of results. */
export type ValuesOf<R extends readonly AnyResult[]> = {
  -readonly [K in keyof R]: Extract<R[K], { readonly ok: true }>['value'];
};
/** Union of the errors of a tuple of results. */
export type ErrorOf<R extends readonly AnyResult[]> = Extract<R[number], { readonly ok: false }>['errors'][number];
/** Union of the warnings of a tuple of results. */
export type WarningOf<R extends readonly AnyResult[]> = R[number]['warnings'][number];

/**
 * The success track.
 *
 * @param value - The value.
 * @param warnings - Warnings riding along.
 * @returns A frozen success.
 *
 * @example
 * ok({ key: 'docs/setup' });
 */
export function ok<T, W = never>(value: T, warnings: readonly W[] = []): Ok<T, W> {
  return Object.freeze({ ok: true, value, warnings: Object.freeze([...warnings]) });
}

/**
 * The failure track.
 *
 * @param error - The first error.
 * @param more - Any other errors.
 * @returns A frozen failure, never without an error.
 *
 * @example
 * err({ code: 'unknown-locale', … });
 */
export function err<E, W = never>(error: E, ...more: E[]): Err<E, W> {
  return failure([error, ...more], []);
}

function failure<E, W>(errors: readonly [E, ...E[]], warnings: readonly W[]): Err<E, W> {
  // Copied into a typed tuple before freezing: `Object.freeze` on an array would widen it to `readonly E[]`.
  const frozenErrors: [E, ...E[]] = [...errors];

  Object.freeze(frozenErrors);

  return Object.freeze({ ok: false, errors: frozenErrors, warnings: Object.freeze([...warnings]) });
}

/**
 * Transforms the value on the success track.
 *
 * @param result - A result.
 * @param fn - The transformation.
 * @returns The transformed success, or the failure unchanged.
 *
 * @example
 * map(ok(2), (n) => n * 2); // ok(4)
 */
export function map<T, U, E, W>(result: Result<T, E, W>, fn: (value: T) => U): Result<U, E, W> {
  return result.ok ? ok(fn(result.value), result.warnings) : result;
}

/**
 * Transforms errors on the failure track.
 *
 * @param result - A result.
 * @param fn - The transformation of each error.
 * @returns The success unchanged, or the transformed failure.
 *
 * @example
 * mapErr(err('missing'), (code) => ({ code })); // err({ code: 'missing' })
 */
export function mapErr<T, E, F, W>(result: Result<T, E, W>, fn: (error: E) => F): Result<T, F, W> {
  if (result.ok) return result;

  const [first, ...rest] = result.errors;

  return failure([fn(first), ...rest.map(fn)], result.warnings);
}

/**
 * Chains a dependent step: short-circuits on failure; warnings of both steps are kept.
 *
 * @param result - A result.
 * @param fn - The next step, given the value.
 * @returns The next step's result, or the first failure; warnings of both kept.
 *
 * @example
 * andThen(parseLocale(part), (locale) => parseSlug(rest, locale));
 */
export function andThen<T, U, E, W>(result: Result<T, E, W>, fn: (value: T) => Result<U, E, W>): Result<U, E, W> {
  if (!result.ok) return result;

  const next = fn(result.value);
  const warnings = [...result.warnings, ...next.warnings];

  return next.ok ? ok(next.value, warnings) : failure(next.errors, warnings);
}

/**
 * Runs independent steps: succeeds with every value in order, or fails with **all** errors accumulated.
 * Pass already-typed results: an inline `ok(x)` here infers its warnings as `unknown` from this signature.
 *
 * @param results - Independent results, already typed.
 * @returns Every value in order, or every error of every failure: all problems reported at once, not only the
 *   first.
 *
 * @example
 * combine([checkName(ctx, a, 'category'), checkName(ctx, b, 'slug')]);
 */
export function combine<const R extends readonly AnyResult[]>(
  results: R,
): Result<ValuesOf<R>, ErrorOf<R>, WarningOf<R>> {
  const values: unknown[] = [];
  const errors: unknown[] = [];
  const warnings: unknown[] = [];

  for (const result of results) {
    warnings.push(...result.warnings);

    if (result.ok) values.push(result.value);
    else errors.push(...result.errors);
  }

  // The module's one assertion: the loop keeps positions and only collects members of `R`, which TypeScript
  // cannot map onto the tuple types it computes from `R`.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  const built = { values, errors, warnings } as {
    values: ValuesOf<R>;
    errors: ErrorOf<R>[];
    warnings: WarningOf<R>[];
  };
  const [first, ...rest] = built.errors;

  return first === undefined ? ok(built.values, built.warnings) : failure([first, ...rest], built.warnings);
}

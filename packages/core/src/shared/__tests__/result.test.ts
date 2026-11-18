import { describe, expect, it } from 'vitest';

import { andThen, combine, err, map, mapErr, ok, type Result } from '../result.js';

const parseNumber = (input: string): Result<number, string, string> => {
  const value = Number(input);

  return Number.isNaN(value) ? err(`not a number: ${input}`) : ok(value);
};

describe('Result', () => {
  it('ok and err build frozen two-track values', () => {
    const success = ok(1, ['w']);
    const failure = err('e1', 'e2');

    expect(success).toEqual({ ok: true, value: 1, warnings: ['w'] });
    expect(failure).toEqual({ ok: false, errors: ['e1', 'e2'], warnings: [] });
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(failure.errors)).toBe(true);
  });

  it('map transforms the success track only', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    expect(map(err<string>('e'), (n: number) => n * 10)).toEqual(err('e'));
  });

  it('mapErr transforms the failure track only and leaves successes untouched', () => {
    expect(mapErr(err('e'), (e) => e.toUpperCase())).toEqual(err('E'));
    const success = ok(3);

    expect(mapErr(success, (e: string) => e.toUpperCase())).toEqual(success);
  });

  it('andThen chains dependent steps and keeps the warnings of both steps', () => {
    const first = ok<string, string>('42', ['from first']);
    const result = andThen(first, (s) => {
      const parsed = parseNumber(s);

      return parsed.ok ? ok(parsed.value, ['from second']) : parsed;
    });

    expect(result).toEqual({ ok: true, value: 42, warnings: ['from first', 'from second'] });
  });

  it('andThen short-circuits: the next step never runs after a failure', () => {
    let called = false;
    const result = andThen(err<string, string>('first failed'), () => {
      called = true;

      return ok(1);
    });

    expect(called).toBe(false);
    expect(result).toEqual(err('first failed'));
  });

  it('combine returns every value in order when all succeed', () => {
    expect(combine([ok(1), ok('a', ['w']), ok(true)])).toEqual({ ok: true, value: [1, 'a', true], warnings: ['w'] });
  });

  it('combine accumulates the errors of every failing input, in order', () => {
    const result = combine([parseNumber('x'), parseNumber('1'), parseNumber('y')]);

    expect(result).toEqual({ ok: false, errors: ['not a number: x', 'not a number: y'], warnings: [] });
  });

  it('combine keeps the warnings of successes even when another input fails', () => {
    const result = combine([ok(1, ['kept']), err('boom')]);

    expect(result).toEqual({ ok: false, errors: ['boom'], warnings: ['kept'] });
  });

  it('combine of nothing succeeds with an empty tuple', () => {
    expect(combine([])).toEqual(ok([]));
  });
});

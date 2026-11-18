import { describe, expectTypeOf, it } from 'vitest';

import { combine, err, ok, type Result } from '../result.js';

declare const result: Result<number, 'E', 'W'>;
declare const first: Result<number, 'E1', 'W1'>;
declare const second: Result<string, 'E2'>;
declare const third: Result<boolean, 'E1'>;

describe('Result (types)', () => {
  it('narrows on `ok` to the value or to a non-empty errors tuple', () => {
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(result.errors).toEqualTypeOf<readonly ['E', ...'E'[]]>();
      expectTypeOf(result.errors[0]).toEqualTypeOf<'E'>();
    }

    expectTypeOf(result.warnings).toEqualTypeOf<readonly 'W'[]>();
  });

  it('combine infers the tuple of values and the unions of errors and warnings', () => {
    const combined = combine([first, second, third]);

    if (combined.ok) {
      expectTypeOf(combined.value).toEqualTypeOf<[number, string, boolean]>();
    } else {
      expectTypeOf(combined.errors[0]).toEqualTypeOf<'E1' | 'E2'>();
    }

    expectTypeOf(combined.warnings).toEqualTypeOf<readonly 'W1'[]>();
  });

  it('ok and err default to no warnings', () => {
    expectTypeOf(ok(1).warnings).toEqualTypeOf<readonly never[]>();
    expectTypeOf(err('E').warnings).toEqualTypeOf<readonly never[]>();
  });
});

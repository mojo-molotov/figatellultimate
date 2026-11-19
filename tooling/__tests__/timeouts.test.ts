import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

const CONFIGS = readdirSync(ROOT).filter((name) => /^vitest(\.[a-z]+)?\.config\.ts$/.test(name));

/** Every test file of the packages and of the tooling. */
const TESTS = ['packages', 'tooling']
  .flatMap((folder) =>
    readdirSync(join(ROOT, folder), { recursive: true, encoding: 'utf8' }).map((path) => join(ROOT, folder, path)),
  )
  .filter((path) => !path.includes('node_modules') && /\.test(-d)?\.tsx?$/.test(path));

describe('test timeouts', () => {
  it('are the shared ones in every vitest configuration', () => {
    // Precondition: the four families' configurations were found.
    expect(CONFIGS.length).toBeGreaterThanOrEqual(4);

    for (const config of CONFIGS) {
      const source = readFileSync(join(ROOT, config), 'utf8');

      expect(source, config).toContain('...TEST_TIMEOUTS');
      expect(source, config).not.toMatch(/(test|hook)Timeout:/);
    }
  });

  it('are never set on a single test or hook, which would cut it short again', () => {
    expect(TESTS.length).toBeGreaterThan(50);

    // A number after a test's or hook's callback: `}, 60_000);`, or `{ timeout: … }` as a test's options.
    const own = TESTS.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          /^\s*\}, [\d_]+\);$|^\s*(it|test|describe|beforeAll|beforeEach|afterAll|afterEach)\b.*\{\s*timeout:/.test(
            line,
          )
            ? [`${relative(ROOT, file)}:${String(index + 1)}`]
            : [],
        ),
    );

    expect(own).toEqual([]);
  });
});

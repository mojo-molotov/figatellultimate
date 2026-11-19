import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** Every test file of the packages' sources (no generated project lives there). */
const TESTS = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) =>
    readdirSync(join(ROOT, 'packages', entry.name, 'src'), { recursive: true, encoding: 'utf8' }).map((path) =>
      join(ROOT, 'packages', entry.name, 'src', path),
    ),
  )
  .filter((path) => /\.test\.tsx?$/.test(path));

describe('the tests’ shared setup', () => {
  it("sets React's act environment once, per configuration: never in a test file", () => {
    // Precondition: the component tests were found.
    expect(TESTS.length).toBeGreaterThan(30);

    const own = TESTS.filter((file) => readFileSync(file, 'utf8').includes('IS_REACT_ACT_ENVIRONMENT')).map((file) =>
      relative(ROOT, file),
    );

    expect(own).toEqual([]);

    for (const config of ['vitest.config.ts', 'vitest.browser.config.ts']) {
      expect(readFileSync(join(ROOT, config), 'utf8'), config).toContain("'react-act.setup.ts'");
    }
  });

  it("silences allure-vitest's false alarm in the browsers, and only there", () => {
    expect(readFileSync(join(ROOT, 'vitest.browser.config.ts'), 'utf8')).toContain("'allure-browser.setup.ts'");
    expect(readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8')).not.toContain('allure-browser.setup.ts');
  });
});

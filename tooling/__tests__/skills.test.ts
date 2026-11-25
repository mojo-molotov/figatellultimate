/**
 * The agent skills of `skills/`, true to the code they describe: an agent follows a skill to the letter, so a name it
 * gives that no longer exists sends it astray. Each skill is an Agent Skill (a `SKILL.md`, its frontmatter's `name` and
 * `description`), published by the example site and listed in its ARD manifest (`/.well-known/ard.json`).
 *
 *     skills/<name>/SKILL.md ──> its frontmatter            ──> the name its folder's, a description
 *                            ──> `@figatellultimate/x/y`    ──> a package and one of its entries
 *                            ──> `import { a } from '…'`    ──> an export of that package
 *                            ──> `#figatellultimate/x`      ──> a generated module
 *                            ──> `figatellultimate <cmd>`   ──> a command of the CLI
 *
 * The names are checked by `namedApi` (`tooling/named-api.ts`), as for the example's documentation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { namedApi } from '../named-api.ts';

const SKILLS = join(import.meta.dirname, '..', '..', 'skills');

const skills = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ folder: entry.name, text: readFileSync(join(SKILLS, entry.name, 'SKILL.md'), 'utf8') }));

describe('agent skills', () => {
  it('has at least one skill: the one the example site publishes', () => {
    expect(skills.map((skill) => skill.folder)).toContain('use-figatellultimate');
  });

  it.each(skills)(
    '$folder: a frontmatter naming it after its folder, with a description to trigger it',
    ({ folder, text }) => {
      const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
      const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
      const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? '';

      expect(name).toBe(folder);
      // The Agent Skills format: a lowercase, hyphenated name of 64 characters at most, a description of 1,024.
      expect(folder).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(folder.length).toBeLessThanOrEqual(64);
      expect(description.length).toBeGreaterThan(100);
      expect(description.length).toBeLessThanOrEqual(1024);
    },
  );

  it.each(skills)('$folder: every package, entry, export, generated module and command it names exists', ({ text }) => {
    // A collection's own module is named after it, shown as `<collection>`; `#figatellultimate/*` is the alias itself.
    const { counts, missing } = namedApi(text, ['<collection>', '*']);

    // Precondition: the skill names each kind at all.
    expect(Object.values(counts).every((count) => count > 0)).toBe(true);
    expect(missing).toEqual([]);
  });
});

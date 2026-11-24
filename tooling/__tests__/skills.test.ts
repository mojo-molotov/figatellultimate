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
 * Key design decisions:
 *     - The names read from the text, not from a list kept beside it: a skill rewritten is checked as it is written.
 *     - An export found in its package's sources (an exported declaration, or a name in an export list): cheaper than
 *       the compiler, and enough to tell a renamed or removed name.
 *
 * Limitations: a function's signature or an option's name in prose is not checked, only the names of packages,
 * entries, exports, generated modules and commands.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const SKILLS = join(ROOT, 'skills');
const PACKAGES = join(ROOT, 'packages');

/** The generated modules every project has; a collection's own is named after it, shown as `<collection>`. */
const GENERATED = ['urls', 'locales', 'navigation', 'taxonomies', 'terms', 'messages', '<collection>'];
const COMMANDS = ['build', 'check', 'watch', 'search', 'migrate'];

const skills = readdirSync(SKILLS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({ folder: entry.name, text: readFileSync(join(SKILLS, entry.name, 'SKILL.md'), 'utf8') }));

/** A package's name, its entries (`.`, `./scripts`…) and every name its sources export. */
function packageOf(folder: string): { name: string; entries: string[]; exported: Set<string> } {
  const manifest: unknown = JSON.parse(readFileSync(join(PACKAGES, folder, 'package.json'), 'utf8'));
  const name: unknown = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'name') : undefined;
  const exports: unknown =
    typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'exports') : undefined;
  const sources = readdirSync(join(PACKAGES, folder, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.tsx?$/.test(path) && !path.includes('__tests__'))
    .map((path) => readFileSync(join(PACKAGES, folder, 'src', path), 'utf8'));
  const exported = new Set<string>();

  for (const source of sources) {
    for (const [, declared] of source.matchAll(
      /export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type)\s+(\w+)/g,
    ))
      if (declared !== undefined) exported.add(declared);

    for (const [, list] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))
      for (const item of (list ?? '').split(','))
        exported.add(
          item
            .replace(/^\s*type\s+/, '')
            .split(/\s+as\s+/)
            .at(-1)
            ?.trim() ?? '',
        );
  }

  return {
    name: typeof name === 'string' ? name : folder,
    entries: typeof exports === 'object' && exports !== null ? Object.keys(exports) : [],
    exported,
  };
}

const packages = new Map(
  readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => packageOf(entry.name))
    .map((found) => [found.name, found] as const),
);

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

  it.each(skills)('$folder: every package and entry it names exists', ({ text }) => {
    // A package by its name alone (it exists), or one of its entries (`@figatellultimate/next16/build`).
    const named = [...text.matchAll(/@figatellultimate\/([a-z0-9-]+)(\/[a-z0-9.-]+)?/g)].map(([, name, entry]) => ({
      name: `@figatellultimate/${name ?? ''}`,
      entry: entry === undefined ? undefined : `.${entry}`,
    }));
    const missing = named.filter(({ name, entry }) => {
      const found = packages.get(name);

      return found === undefined || (entry !== undefined && !found.entries.includes(entry));
    });

    // Precondition: the skill names packages at all.
    expect(named.length).toBeGreaterThan(5);
    expect(missing.map(({ name, entry }) => `${name} ${entry ?? ''}`)).toEqual([]);
  });

  it.each(skills)('$folder: every name its code imports from a package is one of its exports', ({ text }) => {
    const imports = [
      ...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(@figatellultimate\/[a-z0-9-]+)(?:\/[a-z0-9-]+)?'/g),
    ];
    const missing = imports.flatMap(([, list, name]) =>
      (list ?? '')
        .split(',')
        .map((item) => item.replace(/^\s*type\s+/, '').trim())
        .filter((item) => item !== '' && packages.get(name ?? '')?.exported.has(item) !== true)
        .map((item) => `${name ?? ''}: ${item}`),
    );

    // Precondition: the skill imports from packages at all.
    expect(imports.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it.each(skills)('$folder: every generated module and command it names exists', ({ text }) => {
    const modules = [...text.matchAll(/#figatellultimate\/([<>a-z-]+)/g)].map(([, module]) => module ?? '');
    const commands = [...text.matchAll(/`figatellultimate ([a-z-]+)/g)].map(([, command]) => command ?? '');

    // Precondition: the skill names both.
    expect(modules.length).toBeGreaterThan(0);
    expect(commands.length).toBeGreaterThan(0);
    expect(modules.filter((module) => !GENERATED.includes(module))).toEqual([]);
    expect(commands.filter((command) => !COMMANDS.includes(command))).toEqual([]);
  });
});

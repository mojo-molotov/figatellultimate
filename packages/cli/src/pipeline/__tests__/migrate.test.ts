import { describe, expect, it } from 'vitest';

import { applyMoves, editLocalesConfig, type MigrationFs } from '../migrate.js';

const ROOT = '/project';

/** `applyMoves` joins with the platform's separator: the memory file system reads POSIX paths (Windows). */
const posixOf = (path: string): string => path.replaceAll('\\', '/');

/** A file system in memory: files by POSIX path under ROOT; `failOn` makes one rename throw. */
function memoryFs(files: Readonly<Record<string, string>>, failOn?: (from: string, to: string) => boolean) {
  const tree = new Map(Object.entries(files).map(([path, text]) => [`${ROOT}/${path}`, text]));
  const folders = new Set<string>();
  const parents = (path: string): string[] => {
    const parts = path.split('/');

    return parts.slice(2, -1).map((_, i) => parts.slice(0, i + 3).join('/'));
  };

  for (const path of tree.keys()) for (const folder of parents(path)) folders.add(folder);

  const fs: MigrationFs = {
    rename: (rawFrom, rawTo) => {
      const from = posixOf(rawFrom);
      const to = posixOf(rawTo);

      if (failOn?.(from, to) === true) return Promise.reject(new Error(`EPERM: cannot rename ${from}`));

      const text = tree.get(from);

      if (text === undefined) return Promise.reject(new Error(`ENOENT ${from}`));

      if (tree.has(to)) return Promise.reject(new Error(`EEXIST ${to}`));

      tree.delete(from);
      tree.set(to, text);

      return Promise.resolve();
    },
    mkdir: (rawPath) => {
      const path = posixOf(rawPath);

      for (const folder of [...parents(`${path}/x`)]) folders.add(folder);

      return Promise.resolve();
    },
    rmdir: (path) => {
      folders.delete(posixOf(path));

      return Promise.resolve();
    },
    readdir: (rawPath) => {
      const path = posixOf(rawPath);
      const names = new Map<string, boolean>();

      for (const file of tree.keys()) {
        if (!file.startsWith(`${path}/`)) continue;

        const [first, ...rest] = file.slice(path.length + 1).split('/');

        if (first !== undefined) names.set(first, rest.length === 0);
      }

      for (const folder of folders) {
        if (!folder.startsWith(`${path}/`)) continue;

        const [first] = folder.slice(path.length + 1).split('/');

        if (first !== undefined && !names.has(first)) names.set(first, false);
      }

      return Promise.resolve([...names].map(([name, file]) => ({ name, file })));
    },
    exists: (path) => Promise.resolve(tree.has(posixOf(path)) || folders.has(posixOf(path))),
    readFile: (path) => Promise.resolve(tree.get(posixOf(path)) ?? ''),
    writeFile: (path, text) => {
      tree.set(posixOf(path), text);

      return Promise.resolve();
    },
  };
  const snapshot = (): Record<string, string> =>
    Object.fromEntries([...tree].map(([path, text]): [string, string] => [path.slice(ROOT.length + 1), text]).sort());

  return { fs, snapshot, folders };
}

describe('editLocalesConfig', () => {
  const CONFIG = `import { defineConfig, defineLocales } from '@figatellultimate/core';

// The project's locales.
export default defineConfig({
  locales: defineLocales({ list: { fr: { label: 'Français' }, en: { label: 'English' } }, default: 'fr' }),
  collections: {},
});
`;

  it('changes the default locale and keeps every other byte', () => {
    const edit = editLocalesConfig(CONFIG, { kind: 'default-locale', locale: 'en' });

    expect(edit).toMatchObject({ kind: 'edited', property: 'default', value: 'en' });

    if (edit.kind !== 'edited') return;

    expect(edit.text).toBe(CONFIG.replace("default: 'fr'", "default: 'en'"));
    // Precondition: the edit changed something.
    expect(edit.text).not.toBe(CONFIG);
  });

  it('adds the notation when the config has none (implicit by default), in the file’s quote style', () => {
    const doubleQuoted = CONFIG.replaceAll("'", '"');
    const edit = editLocalesConfig(doubleQuoted, { kind: 'notation', notation: 'explicit' });

    if (edit.kind !== 'edited') throw new Error('not edited');

    expect(edit.text).toBe(doubleQuoted.replace('default: "fr"', 'default: "fr", notation: "explicit"'));
  });

  it('changes an existing notation, and round trips', () => {
    const explicit = CONFIG.replace("default: 'fr'", "default: 'fr', notation: 'explicit'");
    const edit = editLocalesConfig(explicit, { kind: 'notation', notation: 'implicit' });

    if (edit.kind !== 'edited') throw new Error('not edited');

    expect(edit.text).toBe(CONFIG.replace("default: 'fr'", "default: 'fr', notation: 'implicit'"));
  });

  it.each([
    ['a variable', CONFIG.replace("default: 'fr'", 'default: DEFAULT')],
    ['locales imported from elsewhere', CONFIG.replace(/ {2}locales: defineLocales\(.*\n/, '  locales,\n')],
    ['a declaration that is not an object literal', CONFIG.replace(/defineLocales\(.*\),\n/, 'defineLocales(base),\n')],
  ])('leaves %s to the author', (_, text) => {
    // Precondition: the variant differs from the editable config.
    expect(text).not.toBe(CONFIG);
    expect(editLocalesConfig(text, { kind: 'default-locale', locale: 'en' })).toEqual({
      kind: 'not-literal',
      property: 'default',
      value: 'en',
    });
  });
});

describe('applyMoves: all or nothing', () => {
  const FILES = {
    'content/pages/about.mdx': 'fr about',
    'content/pages/en/about.mdx': 'en about',
    'content/pages/en/image.png': 'png',
    'content/pages/docs/index.mdx': 'docs',
  };
  // A chain: about.mdx leaves for fr/, en/about.mdx takes its place.
  const MOVES = [
    { from: 'content/pages/about.mdx', to: 'content/pages/fr/about.mdx' },
    { from: 'content/pages/en/about.mdx', to: 'content/pages/about.mdx' },
    { from: 'content/pages/docs/index.mdx', to: 'content/pages/fr/docs/index.mdx' },
  ];

  it('moves chains without overwriting, and removes the folders it emptied', async () => {
    const { fs, snapshot } = memoryFs(FILES);
    const result = await applyMoves(ROOT, MOVES, fs);

    expect(result).toEqual({ ok: true, removed: ['content/pages/docs'] });
    expect(snapshot()).toEqual({
      'content/pages/about.mdx': 'en about',
      'content/pages/en/image.png': 'png',
      'content/pages/fr/about.mdx': 'fr about',
      'content/pages/fr/docs/index.mdx': 'docs',
    });
  });

  it.each([
    ['while parking the files', (from: string) => from.endsWith('docs/index.mdx')],
    ['while placing them', (_: string, to: string) => to.endsWith('fr/docs/index.mdx')],
  ])('puts every file back when a rename fails %s', async (_, failOn) => {
    const { fs, snapshot } = memoryFs(FILES, failOn);
    const before = snapshot();
    const result = await applyMoves(ROOT, MOVES, fs);

    expect(result).toMatchObject({ ok: false, failure: { kind: 'failed', restored: true } });
    expect(snapshot()).toEqual(before);
    // The reason never carries the machine's absolute path.
    expect(JSON.stringify(result)).not.toContain(ROOT);
  });

  it('refuses a target that exists and is not moved away, before touching anything', async () => {
    const { fs, snapshot } = memoryFs({ ...FILES, 'content/pages/fr/about.mdx': 'already there' });
    const before = snapshot();

    expect(await applyMoves(ROOT, MOVES, fs)).toEqual({
      ok: false,
      failure: { kind: 'target-exists', paths: ['content/pages/fr/about.mdx'] },
    });
    expect(snapshot()).toEqual(before);
  });
});

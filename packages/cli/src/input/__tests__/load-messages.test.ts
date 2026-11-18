import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { FileSystem } from '@japa/file-system';
import { afterAll, describe, expect, it } from 'vitest';

import { loadMessageModules } from '../load-messages.js';

const folder = new FileSystem(join(import.meta.dirname, '..', '..', '..', '.tmp', randomUUID()));

afterAll(() => folder.cleanup());

describe('loadMessageModules', () => {
  it('loads the default export of every TypeScript module, by file name, and nothing else', async () => {
    await folder.create('fr.ts', "const messages: { home: string } = { home: 'Accueil' };\nexport default messages;\n");
    await folder.create('en.ts', "export default { home: 'Home' } as const;\n");
    await folder.create('types.d.ts', 'export {};\n');
    await folder.create('notes.md', '# not a module\n');
    const { modules, diagnostics } = await loadMessageModules(folder.basePath);

    expect(diagnostics).toEqual([]);
    expect(modules).toEqual({ 'en.ts': { home: 'Home' }, 'fr.ts': { home: 'Accueil' } });
  });

  it('reports a module that cannot be loaded, without the absolute path', async () => {
    // A module failing at load time, with its own absolute path in the error (as Node's errors often carry).
    await folder.create(
      'de.ts',
      'throw new Error(`cannot load ${import.meta.url} (${new URL(import.meta.url).pathname})`);\n',
    );
    const { modules, diagnostics } = await loadMessageModules(folder.basePath);

    expect(Object.keys(modules)).not.toContain('de.ts');
    expect(diagnostics.map((d) => [d.file, d.code])).toEqual([['de.ts', 'unreadable-message-module']]);
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).not.toContain(folder.basePath);
    expect(serialized).not.toContain(encodeURI(folder.basePath));
    await folder.remove('de.ts');
  });

  it('never loads the schema module: it imports the generated output, which a build may not have written yet', async () => {
    await folder.create('schema.ts', "import { skeleton } from '#nowhere';\nexport const schema = skeleton;\n");
    const { modules, diagnostics } = await loadMessageModules(folder.basePath, 'schema.ts');

    expect(diagnostics).toEqual([]);
    expect(Object.keys(modules)).not.toContain('schema.ts');
    await folder.remove('schema.ts');
  });

  it('treats a missing folder as holding no module (the analysis reports each locale)', async () => {
    expect(await loadMessageModules(join(folder.basePath, 'nope'))).toEqual({ modules: {}, diagnostics: [] });
  });
});

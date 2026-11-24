import { describe, expect, it } from 'vitest';

import { llmsMarkdownOf } from '../llms.js';

describe('llmsMarkdownOf', () => {
  it('leaves out what <llm-exclude> holds, as a block or within a line, and keeps the rest', () => {
    const markdown = llmsMarkdownOf(
      [
        '# Installation',
        '',
        '<llm-exclude>',
        '',
        'Choisissez votre gestionnaire dans les onglets.',
        '',
        '</llm-exclude>',
        '',
        'Ajoutez la CLI<llm-exclude> (le bouton copie)</llm-exclude>.',
      ].join('\n'),
    );

    expect(markdown).toBe('# Installation\n\nAjoutez la CLI.\n');
  });

  it('keeps code blocks and code spans as written, a tag, an import or a component shown in them never applied', () => {
    const source = [
      'Un passage s’écarte par `<llm-exclude>`, un composant par `<Callout />`.',
      '',
      '```mdx',
      "import { Callout } from './callout';",
      '<llm-exclude>Pour les humains</llm-exclude>',
      '<Callout>Gardé</Callout>',
      '```',
      '',
      '## Suite',
    ].join('\n');
    const markdown = llmsMarkdownOf(source);

    expect(markdown).toContain('`<llm-exclude>`');
    expect(markdown).toContain('`<Callout />`');
    expect(markdown).toContain(
      [
        '```mdx',
        "import { Callout } from './callout';",
        '<llm-exclude>Pour les humains</llm-exclude>',
        '<Callout>Gardé</Callout>',
        '```',
      ].join('\n'),
    );
    expect(markdown).toContain('## Suite');
  });

  it("leaves out MDX's imports, exports, expressions and comments", () => {
    const markdown = llmsMarkdownOf(
      [
        "import { Note } from './note';",
        'export const meta = { draft: false };',
        '',
        '# Titre {props.suffix}',
        '',
        '{/* Une note pour les auteurs. */}',
        '',
        'Texte {1 + 1} suivi.',
      ].join('\n'),
    );

    expect(markdown).toBe('# Titre\n\nTexte suivi.\n');
  });

  it('shows an unmapped component by its content, a self-closing one by nothing, an HTML element by its content', () => {
    const markdown = llmsMarkdownOf(
      [
        '<Callout type="warning">',
        '',
        'Le cœur ne lit **aucun** fichier.',
        '',
        '</Callout>',
        '',
        '<PackageTable />',
        '',
        'Un <span>mot</span> ici.',
      ].join('\n'),
    );

    expect(markdown).toBe('Le cœur ne lit **aucun** fichier.\n\nUn mot ici.\n');
  });

  it('writes a mapped component with its props, literal expressions read, and its content as Markdown', () => {
    const seen: unknown[] = [];
    const markdown = llmsMarkdownOf(
      [
        '<Callout type="warning" open count={3} tags={[\'a\', "b"]} meta={{ level: -1 }} computed={value} {...rest}>',
        '',
        'Le cœur ne lit **aucun** fichier.',
        '',
        '</Callout>',
      ].join('\n'),
      {
        components: {
          Callout: (props, content) => {
            seen.push(props);

            return `> **${String(props['type'])}:** ${content}`;
          },
        },
      },
    );

    // A prop whose value is not a literal (a variable, a spread) is left out: it has no value before the app runs.
    expect(seen).toEqual([{ type: 'warning', open: true, count: 3, tags: ['a', 'b'], meta: { level: -1 } }]);
    expect(markdown).toBe('> **warning:** Le cœur ne lit **aucun** fichier.\n');
  });

  it('converts the components inside a mapped one before giving it its content', () => {
    const markdown = llmsMarkdownOf('<Steps>\n\n<Step>Installer</Step>\n\n<Step>Configurer</Step>\n\n</Steps>', {
      components: {
        Steps: (_, content) => content.replaceAll('STEP ', '1. '),
        Step: (_, content) => `STEP ${content}`,
      },
    });

    expect(markdown).toBe('1. Installer\n\n1. Configurer\n');
  });

  it("keeps GitHub's tables, a code block's meta and the typography as written", () => {
    const source = [
      'Un texte\u00a0: espacé\u202f!',
      '',
      '| Paquet | Rôle |',
      '| --- | --- |',
      '| `core` | Le cœur |',
      '',
      '```sh npm',
      'npm install -D @figatellultimate/cli',
      '```',
    ].join('\n');
    const markdown = llmsMarkdownOf(source);

    expect(markdown).toContain('Un texte\u00a0: espacé\u202f!');
    expect(markdown).toMatch(/\| Paquet +\| Rôle +\|/);
    expect(markdown).toContain('| `core` | Le cœur |');
    expect(markdown).toContain('```sh npm\nnpm install -D @figatellultimate/cli\n```');
  });
});

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { agentCatalogOf, type AgentCatalogEntry, type AgentResource } from '../index.js';

const site = { origin: 'https://docs.example.dev', name: 'Exemple', defaultLocale: 'fr' };
const skill: AgentResource = {
  name: 'skills:use-figatellultimate',
  displayName: 'Utiliser figatellultimate',
  type: 'application/agent-skills+md',
  url: '/skills/use-figatellultimate/SKILL.md',
  description: 'Configurer\u00a0: les collections.',
  tags: ['mdx', 'nextjs'],
  representativeQueries: ['Add a language to my figatellultimate site', 'Fix a figatellultimate build error'],
};

/** ARD v0.91's entry schema: its identifier pattern, its required terms, exactly one of `url` and `data`. */
const ARD_IDENTIFIER = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;
const ardEntryProblems = (entry: AgentCatalogEntry): string[] => [
  ...(ARD_IDENTIFIER.test(entry.identifier) ? [] : ['identifier']),
  ...(entry.displayName === '' ? ['displayName'] : []),
  ...(/^[\w.+-]+\/[\w.+-]+/.test(entry.type) ? [] : ['type']),
  ...('data' in entry ? ['url or data'] : []),
  ...(/^https:\/\/[^\s/]+\/\S*$/.test(entry.url) ? [] : ['url']),
];

describe('agentCatalogOf', () => {
  it('writes a manifest both ARD and AI Catalog read: its version, its host, an entry each spec accepts', () => {
    const catalog = agentCatalogOf({ site, resources: [skill] });

    expect(catalog).toEqual({
      specVersion: '0.9',
      host: { displayName: 'Exemple' },
      entries: [
        {
          identifier: 'urn:air:docs.example.dev:skills:use-figatellultimate',
          displayName: 'Utiliser figatellultimate',
          type: 'application/agent-skills+md',
          url: 'https://docs.example.dev/skills/use-figatellultimate/SKILL.md',
          description: 'Configurer : les collections.',
          tags: ['mdx', 'nextjs'],
          representativeQueries: ['Add a language to my figatellultimate site', 'Fix a figatellultimate build error'],
        },
      ],
    });
    expect(catalog.entries.flatMap(ardEntryProblems)).toEqual([]);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("names its host after the site's origin when the site has no name, and leaves out what a resource does not say", () => {
    const catalog = agentCatalogOf({
      site: { origin: 'https://docs.example.dev/', defaultLocale: 'fr' },
      resources: [{ name: 'a', displayName: 'A', type: 'application/agent-skills+md', url: '/a.md' }],
    });

    expect(catalog.host).toEqual({ displayName: 'docs.example.dev' });
    expect(catalog.entries).toEqual([
      {
        identifier: 'urn:air:docs.example.dev:a',
        displayName: 'A',
        type: 'application/agent-skills+md',
        url: 'https://docs.example.dev/a.md',
      },
    ]);
  });

  it('throws on a name its identifier could not hold (ARD allows letters, digits, dots, dashes, underscores)', () => {
    for (const name of ['', 'skills/use', 'a::b', 'é'])
      expect(() => agentCatalogOf({ site, resources: [{ ...skill, name }] })).toThrow(/identifier/);
  });

  it('gives every valid name an identifier ARD accepts, whatever the display name and description hold', () => {
    const segment = fc.stringMatching(/^[a-zA-Z0-9._-]{1,12}$/);

    fc.assert(
      fc.property(
        fc.array(segment, { minLength: 1, maxLength: 3 }),
        fc.string({ minLength: 1 }).filter((text) => text.trim() !== ''),
        fc.string(),
        (segments, displayName, description) => {
          const [entry] = agentCatalogOf({
            site,
            resources: [{ ...skill, name: segments.join(':'), displayName, description }],
          }).entries;

          expect(entry === undefined ? ['entry'] : ardEntryProblems(entry)).toEqual([]);
        },
      ),
    );
  });
});

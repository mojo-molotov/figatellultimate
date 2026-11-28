/**
 * What the site offers AI agents (ARD): the agent skill teaching figatellultimate, kept in the repository
 * (`skills/use-figatellultimate/SKILL.md`, checked against the code by `tooling/__tests__/skills.test.ts`) and served
 * by the site. Read by the skill's route and by the catalog's (`/.well-known/ard.json`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { agentCatalogOf, type AgentCatalog } from '@figatellultimate/site';

import { site } from '../site';

/** Where the site serves the skill. */
export const SKILL_URL = '/skills/use-figatellultimate/SKILL.md';

/**
 * The skill's text, read from the repository when the route is prerendered (the build runs from the example's folder).
 *
 * @returns The skill's `SKILL.md`, as written.
 */
export const skillText = (): string =>
  readFileSync(join(process.cwd(), '..', '..', 'skills', 'use-figatellultimate', 'SKILL.md'), 'utf8');

/**
 * The site's agent catalog: its skill, an agentic resource as ARD describes them.
 *
 * @returns The manifest both `/.well-known/ard.json` and `/.well-known/ai-catalog.json` serve.
 */
export const agentCatalog = (): AgentCatalog =>
  agentCatalogOf({
    site,
    resources: [
      {
        name: 'skills:use-figatellultimate',
        displayName: 'Use figatellultimate',
        type: 'application/agent-skills+md',
        url: SKILL_URL,
        description:
          'Build and maintain a typed MDX site with figatellultimate: configuration, content, CLI diagnostics, generated code, messages, Next.js, search, faceted listings and llms.txt.',
        tags: ['figatellultimate', 'mdx', 'nextjs', 'content', 'i18n'],
        representativeQueries: [
          'Add an English translation to my figatellultimate site',
          'Fix the errors figatellultimate build reports',
          'Add a blog collection with categories and tags',
          'Serve every figatellultimate page from one Next.js route',
        ],
      },
    ],
  });

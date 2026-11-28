// prettier-ignore
/**
 * What a site offers AI agents, after Agentic Resource Discovery (ARD v0.91, https://agenticresourcediscovery.org):
 * the manifest an agent fetches at `/.well-known/ard.json`, listing the site's agentic resources (an agent skill, an
 * MCP server card, an A2A agent card).
 *
 *     the app's route ──> agentCatalogOf({ site, resources }) ──> /.well-known/ard.json
 *                                                             ──> /.well-known/ai-catalog.json (the same document)
 *
 * Key design decisions:
 *     - One document both formats read, as chosen with the user: ARD's (`entries`, each with an `identifier`
 *       `urn:air:<the site's domain>:<name>`, a `displayName`, a `type` and a `url`) and its predecessor's, AI Catalog
 *       (its `specVersion` and its `host`), which ARD ignores. The app serves it at both well-known paths: ARD's,
 *       which agents must fetch, and the older one, which a tool not yet on ARD (Lighthouse 13.5) still reads.
 *     - The identifier anchored to the site's domain, its name checked against ARD's pattern: a name it could not
 *       hold is a programming error, thrown where it is written, never a manifest an agent rejects.
 *     - Plain spaces, one line, in what an agent reads (the names, the description), as in llms.txt.
 *     - Agentic resources only, as ARD describes them: llms.txt is not one (documentation, not a resource an agent
 *       calls); a skill teaching an agent the site's subject is.
 *
 * Invariants (`agents.test.ts`): a manifest both formats accept, its identifiers ARD's pattern (a property); the host
 * named after the origin without a site name; a name the identifier could not hold throws.
 */
import { absoluteOn, oneLine } from './shared.js';
import type { Site } from './types.js';

/** An agentic resource the site offers. */
export interface AgentResource {
  /** Its name under the site's domain, segments joined by `:` (`skills:use-figatellultimate`). */
  readonly name: string;
  readonly displayName: string;
  /** Its media type: `application/agent-skills+md`, `application/mcp-server-card+json`… */
  readonly type: string;
  /** Where it is: a path on the site, or absolute. */
  readonly url: string;
  readonly description?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  /** Two to five requests it answers, for a registry's search. */
  readonly representativeQueries?: readonly string[] | undefined;
}

/** A catalog entry, as ARD and AI Catalog read it. */
export interface AgentCatalogEntry {
  readonly identifier: string;
  readonly displayName: string;
  readonly type: string;
  readonly url: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly representativeQueries?: readonly string[];
}

/** The manifest: AI Catalog's version and host, ARD's entries. */
export interface AgentCatalog {
  readonly specVersion: '0.9';
  readonly host: { readonly displayName: string };
  readonly entries: readonly AgentCatalogEntry[];
}

/** A domain, as ARD's identifier pattern allows a publisher. */
const DOMAIN = /^[a-zA-Z0-9.-]+$/;
/** A name's segments, as ARD's identifier pattern allows them. */
const NAME = /^[a-zA-Z0-9._-]+(:[a-zA-Z0-9._-]+)*$/;

/**
 * The site's agent catalog, read by ARD (`/.well-known/ard.json`) and by AI Catalog (`/.well-known/ai-catalog.json`).
 *
 * @param input - The site (its origin anchors every identifier and URL, its name names the host) and its resources.
 * @returns The manifest, frozen: `specVersion`, `host`, and an entry per resource.
 * @throws {Error} When the site's origin has no domain (letters, digits, dots and dashes), or a resource's name is not segments of letters, digits, dots, dashes and underscores joined by
 *   `:`: its identifier would break ARD's pattern.
 *
 * @example
 * agentCatalogOf({ site, resources: [{ name: 'skills:use-figatellultimate', displayName: 'Use figatellultimate',
 *   type: 'application/agent-skills+md', url: '/skills/use-figatellultimate/SKILL.md' }] });
 */
export function agentCatalogOf(input: {
  readonly site: Site;
  readonly resources: readonly AgentResource[];
}): AgentCatalog {
  const absolute = absoluteOn(input.site);
  const domain = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(input.site.origin)?.[1] ?? '';

  if (!DOMAIN.test(domain))
    throw new Error(`"${input.site.origin}" has no domain an ARD identifier can be anchored to.`);

  const name = input.site.name === undefined ? '' : oneLine(input.site.name);

  return Object.freeze({
    specVersion: '0.9',
    host: Object.freeze({ displayName: name === '' ? domain : name }),
    entries: Object.freeze(
      input.resources.map((resource): AgentCatalogEntry => {
        if (!NAME.test(resource.name))
          throw new Error(
            `"${resource.name}" cannot end an ARD identifier: segments of letters, digits, dots, dashes and underscores, joined by ":".`,
          );

        const description = resource.description === undefined ? '' : oneLine(resource.description);

        return Object.freeze({
          identifier: `urn:air:${domain}:${resource.name}`,
          displayName: oneLine(resource.displayName),
          type: resource.type,
          url: absolute(resource.url),
          ...(description === '' ? {} : { description }),
          ...(resource.tags === undefined ? {} : { tags: Object.freeze([...resource.tags]) }),
          ...(resource.representativeQueries === undefined
            ? {}
            : { representativeQueries: Object.freeze(resource.representativeQueries.map(oneLine)) }),
        });
      }),
    ),
  });
}

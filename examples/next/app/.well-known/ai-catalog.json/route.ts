/**
 * The same manifest at ARD's predecessor's path (AI Catalog): a tool not yet on ARD (Lighthouse 13.5) still reads it.
 * One document both formats accept (`agentCatalogOf`).
 */
import { agentCatalog } from '../../../lib/agents';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(agentCatalog()), {
    headers: { 'content-type': 'application/ai-catalog+json; charset=utf-8' },
  });
}

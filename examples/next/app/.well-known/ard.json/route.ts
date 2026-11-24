/** The site's Agentic Resource Discovery manifest (ARD v0.91), where agents look for it: its agent skill. */
import { agentCatalog } from '../../../components/agents';

export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(agentCatalog());
}

/** The agent skill teaching figatellultimate, as the repository holds it: listed by the site's ARD catalog. */
import { skillText } from '../../../../components/agents';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(skillText(), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
}

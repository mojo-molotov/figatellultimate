/**
 * Building the descriptor from an assignment: the key (locale-independent, linking translations), the route, the
 * reservation.
 */
import { matchesReservation } from '../../declarations/collection.js';
import type { EntryDescriptor } from '../descriptor.js';
import type { RoutePart } from '../../declarations/grammar.js';
import { INDEX, type Context } from './context.js';
import type { Assignment } from './shape.js';

/**
 * Builds the descriptor from an assignment: key, route and reservation.
 *
 * @param ctx - The path being parsed.
 * @param assignment - The folders assigned to the grammar.
 * @returns The descriptor: `index` yields the folder's key and route; reservations matched.
 */
export function describe(ctx: Context, assignment: Assignment): EntryDescriptor {
  const isIndex = assignment.slug === INDEX;
  const segments: Record<string, string> = {};

  for (const { part, folders } of assignment.values) segments[part.name] = folders.join('/');

  const slugValue = isIndex ? '' : assignment.slug;
  const valueOf = (name: string): string => (name === 'slug' ? slugValue : (segments[name] ?? ''));
  const routeValue = (part: RoutePart): string =>
    typeof part === 'string'
      ? valueOf(part)
      : part.names
          .map(valueOf)
          .filter((value) => value !== '')
          .join(part.separator);

  const key = [...assignment.values.flatMap(({ folders }) => folders), slugValue].filter((v) => v !== '').join('/');
  const routeParts = [ctx.collection.base, ...ctx.collection.route.map(routeValue)].filter((v) => v !== '');

  return Object.freeze({
    collection: ctx.collectionName,
    sourcePath: ctx.sourcePath,
    locale: assignment.locale,
    localeSource: assignment.localeSource,
    segments: Object.freeze(segments),
    slug: assignment.slug,
    isIndex,
    key,
    route: `/${routeParts.join('/')}`,
    // An unmounted collection's entries are all left out of the mounting, as reserved ones.
    reserved: !ctx.collection.mounted || ctx.collection.reserved.some((pattern) => matchesReservation(key, pattern)),
  });
}

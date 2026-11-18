/**
 * Path grammars, as small builders returning plain data: where the segments, the locale folder and the slug sit in
 * a source path.
 *
 * Key design decisions:
 *     - Declarative: a grammar is data, so that the descriptor's types, the getters' parameters and every
 *       structural diagnostic derive from it; one rule turns a path into a descriptor.
 *     - Builders, not a string pattern: autocompletion and inferred literal names, without a mini-language to
 *       parse.
 */
/** One named folder of a path grammar. */
export interface SegmentPart<N extends string = string> {
  readonly kind: 'segment';
  readonly name: N;
}

/** Any number (≥ 0) of folders, joined with `/` in the descriptor (free-depth grammars, e.g. pages). */
export interface RestPart<N extends string = string> {
  readonly kind: 'rest';
  readonly name: N;
}

/** Position of the locale folder. `optional` only matters in the implicit notation. */
export interface LocalePart {
  readonly kind: 'locale';
  readonly optional: boolean;
}

/** The file name without `.mdx`; always the last part. */
export interface SlugPart {
  readonly kind: 'slug';
}

/**
 * One part of a path grammar, in path order.
 *
 */
export type GrammarPart = SegmentPart | RestPart | LocalePart | SlugPart;

/** Route composition joining several values with a separator, e.g. `<category>-<slug>`. */
export interface JoinPart<N extends string = string> {
  readonly kind: 'join';
  readonly separator: string;
  readonly names: readonly N[];
}

/** A route part: one value (a segment name or `'slug'`), or a join of values. */
export type RoutePart<N extends string = string> = N | JoinPart<N>;

/** Names of the segments (named and rest) of a grammar. */
export type SegmentNames<G extends readonly GrammarPart[]> = Extract<
  G[number],
  { readonly kind: 'segment' | 'rest' }
>['name'];

/** Names a route may reference: the segments and the slug. */
export type RouteNames<G extends readonly GrammarPart[]> = SegmentNames<G> | 'slug';

/**
 * A named folder at a fixed position.
 *
 * @param name - Its name: a getter parameter, a key in the messages.
 * @returns The part, frozen.
 *
 * @example
 * segment('category');
 */
export function segment<const N extends string>(name: N): SegmentPart<N> {
  return Object.freeze({ kind: 'segment', name });
}

/**
 * Any number of folders, joined with `/` in the descriptor: a free-depth grammar.
 *
 * @param name - Its name.
 * @returns The part, frozen.
 *
 * @example
 * [locale({ optional: true }), rest('path'), slug()]; // pages: docs/setup.mdx
 */
export function rest<const N extends string>(name: N): RestPart<N> {
  return Object.freeze({ kind: 'rest', name });
}

/**
 * The locale folder's position.
 *
 * @param options - `optional`: whether the folder may be absent (the implicit notation: no folder is the default
 *   locale).
 * @returns The part, frozen.
 */
export function locale(options: { readonly optional?: boolean } = {}): LocalePart {
  return Object.freeze({ kind: 'locale', optional: options.optional ?? false });
}

/**
 * The file name without `.mdx`: always the last part.
 *
 * @returns The part, frozen.
 */
export function slug(): SlugPart {
  return Object.freeze({ kind: 'slug' });
}

/**
 * A route part joining values, e.g. a flat landing page URL.
 *
 * @param separator - Between the values.
 * @param names - Segment names, or `slug`.
 * @returns The route part, frozen.
 *
 * @example
 * route: [join('-', 'category', 'slug')]; // /lp/<category>-<slug>
 */
export function join<const N extends string>(separator: string, ...names: N[]): JoinPart<N> {
  return Object.freeze({ kind: 'join', separator, names: Object.freeze([...names]) });
}

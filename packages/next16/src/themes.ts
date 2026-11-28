/**
 * `@figatellultimate/next16/themes`: static CSS route for lazy non-default site themes (`/themes/<name>.css`), a
 * server entry. Keeps unused theme stylesheets out of the initial CSS bundle while serving immutable static files
 * matched by `siteThemeScript` and `SiteThemePicker` (`stylesheetBase: '/themes/'`).
 *
 *     app/themes/[name]/route.ts
 *       export const dynamic = 'force-static';           ← written in the route: Next reads them as literals
 *       export const dynamicParams = false;
 *       export const { GET, generateStaticParams } = themeStylesheetRoute({ themes, read });
 *
 * Key design decisions:
 *     - Framework-neutral reader (`read`): the app resolves its own CSS source (e.g. `@figatellultimate/themes`),
 *       keeping `@figatellultimate/next16` decoupled from `@figatellultimate/themes` (two adapters stay independent).
 *     - Immutable caching by default: each theme stylesheet is prerendered at build time with a year-long cache header.
 *     - Strict allow-list: any name outside `<theme>.css` returns 404 without calling `read`.
 *
 * Invariants (`themes.test.ts`): one `{ name: '<theme>.css' }` per theme; known theme returns 200 with `text/css`
 * and cache header; unknown name returns 404 without invoking `read`.
 */

/** Options of `themeStylesheetRoute`. */
export interface ThemeStylesheetRouteOptions<T extends string> {
  /** Lazy (non-default) theme names to serve as `<theme>.css`. */
  readonly themes: readonly T[];
  /** Reads a theme's CSS text (e.g. from `@figatellultimate/themes/<theme>.css`). */
  readonly read: (theme: T) => string | Promise<string>;
  /** `Cache-Control` header value; default `'public, max-age=31536000, immutable'`. */
  readonly cacheControl?: string | undefined;
}

/** The route's handlers, to export from `app/themes/[name]/route.ts` beside its literal segment config. */
export interface ThemeStylesheetRoute {
  readonly generateStaticParams: () => { readonly name: string }[];
  readonly GET: (
    request: Request,
    context: { readonly params: Promise<{ readonly name: string }> },
  ) => Promise<Response>;
}

const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Static CSS route for lazy non-default site themes (`/themes/<theme>.css`).
 *
 * @param options - The lazy theme names, a reader returning each theme's CSS, and an optional cache header.
 * @returns `generateStaticParams` and `GET`, to export from the route file beside its literal segment config.
 *
 * @example
 * export const dynamic = 'force-static';
 * export const dynamicParams = false;
 * export const { GET, generateStaticParams } = themeStylesheetRoute({
 *   themes: ['calanque'],
 *   read: (theme) => readFileSync(require.resolve(`@figatellultimate/themes/${theme}.css`), 'utf8'),
 * });
 */
export function themeStylesheetRoute<T extends string>(options: ThemeStylesheetRouteOptions<T>): ThemeStylesheetRoute {
  const { themes, read, cacheControl = DEFAULT_CACHE_CONTROL } = options;

  return {
    generateStaticParams: () => themes.map((theme) => ({ name: `${theme}.css` })),
    GET: async (_request, context) => {
      const { name } = await context.params;
      const theme = themes.find((candidate) => `${candidate}.css` === name);

      if (theme === undefined) return new Response(null, { status: 404 });

      const css = await read(theme);

      return new Response(css, {
        headers: {
          'content-type': 'text/css; charset=utf-8',
          'cache-control': cacheControl,
        },
      });
    },
  };
}

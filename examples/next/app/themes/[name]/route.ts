/**
 * Static CSS routes for non-default site themes (`/themes/calanque.css`, …): keeps unused theme stylesheets out of the
 * initial CSS bundle while allowing instant hover preload and pre-paint loading for returning visitors.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { NextRequest } from 'next/server';

import { SITE_THEMES } from '../../../lib/site-themes';

export const dynamic = 'force-static';
export const dynamicParams = false;

const lazyThemes = SITE_THEMES.slice(1);

export function generateStaticParams(): { readonly name: string }[] {
  return lazyThemes.map((theme) => ({ name: `${theme}.css` }));
}

export async function GET(
  _request: NextRequest,
  context: { readonly params: Promise<{ readonly name: string }> },
): Promise<Response> {
  const { name } = await context.params;
  const theme = lazyThemes.find((candidate) => `${candidate}.css` === name);

  if (theme === undefined) return new Response(null, { status: 404 });

  const css = readFileSync(
    join(process.cwd(), 'node_modules', '@figatellultimate', 'themes', 'dist', `${theme}.css`),
    'utf8',
  );

  return new Response(css, {
    headers: {
      'content-type': 'text/css; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}

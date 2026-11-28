/**
 * Static CSS routes for non-default site themes (`/themes/calanque.css`, …): keeps unused theme stylesheets out of the
 * initial CSS bundle while allowing instant hover preload and pre-paint loading for returning visitors.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { themeStylesheetRoute } from '@figatellultimate/next16/themes';

import { SITE_THEMES } from '../../../lib/site-themes';

export const dynamic = 'force-static';
export const dynamicParams = false;

const resolveFromApp = createRequire(join(process.cwd(), 'package.json')).resolve;

export const { GET, generateStaticParams } = themeStylesheetRoute({
  themes: SITE_THEMES.slice(1),
  read: (theme) => readFileSync(resolveFromApp(`@figatellultimate/themes/${theme}.css`), 'utf8'),
});

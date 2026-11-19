/** The site's identity: its origin, name and default locale. */
import { defaultLocale } from '#figatellultimate/locales';
import type { Site } from '@figatellultimate/site';

/** The published site, declared once. */
export const site: Site = {
  origin: 'https://figatellultimate.vercel.app',
  name: 'Figatellultimate',
  defaultLocale,
};

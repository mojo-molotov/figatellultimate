/** The site's identity: its origin, name and default locale. */
import { defaultLocale } from '#figatellu/locales';
import type { Site } from '@figatellu/site';

/** The published site, declared once. */
export const site: Site = { origin: 'https://example.com', name: 'figatellu', defaultLocale };

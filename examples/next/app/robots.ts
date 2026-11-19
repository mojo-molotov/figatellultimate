/** `robots.txt`, from the site's origin. */
import { toNextRobots } from '@figatellultimate/next16';
import type { MetadataRoute } from 'next';

import { site } from '../site';

// Every crawler welcome: the pages that must not be indexed say so themselves, through their robots metadata.
export default function robots(): MetadataRoute.Robots {
  return toNextRobots(site);
}

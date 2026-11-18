/** The sitemap: every mounted URL with its translations and its modification date. */
import { toNextSitemap } from '@figatellu/next16';
import { sitemapOf } from '@figatellu/site';
import type { MetadataRoute } from 'next';

import { mountedUrls } from '#figatellu/urls';

import { site } from '../site';

export default function sitemap(): MetadataRoute.Sitemap {
  return toNextSitemap(sitemapOf(mountedUrls, site));
}

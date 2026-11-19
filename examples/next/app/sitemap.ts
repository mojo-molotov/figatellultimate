/** The sitemap: every mounted URL with its translations and its modification date. */
import { toNextSitemap } from '@figatellultimate/next16';
import { sitemapOf } from '@figatellultimate/site';
import type { MetadataRoute } from 'next';

import { mountedUrls } from '#figatellultimate/urls';

import { site } from '../site';

export default function sitemap(): MetadataRoute.Sitemap {
  return toNextSitemap(sitemapOf(mountedUrls, site));
}

/** Next's configuration: static generation, and next-intl's plugin. */
import { withPrecompiledMessages } from '@figatellultimate/next16/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Classic static generation: every route prerendered at build time; an unknown URL is a real 404, rendered on demand
// in its locale's layout (`app/[locale]/not-found.tsx`). Cache Components (`cacheComponents: true`) are optional in Next 16.4 and become the
// default in Next 17; see the README to enable them. next-intl routes by locale.
const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    agentUpgrade: 'security',
  },
};

// Every message is precompiled (`i18n/labels.ts`): next-intl formats them with its `format-only` runtime, and no
// page ships the ICU parser.
export default createNextIntlPlugin('./i18n/request.ts')(withPrecompiledMessages(nextConfig));

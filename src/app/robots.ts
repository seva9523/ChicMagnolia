import type { MetadataRoute } from 'next';

import { canonicalUrl } from '@/lib/canonical-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacy', '/terms'],
      disallow: [
        '/api/',
        '/auth/',
        '/dashboard/',
        '/forgot-password',
        '/login',
        '/reset-password',
        '/sign-up',
      ],
    },
    sitemap: canonicalUrl('/sitemap.xml'),
  };
}

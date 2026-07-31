import type { MetadataRoute } from 'next';

import { clientEnv } from '@/lib/env/client';

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
    sitemap: new URL('/sitemap.xml', clientEnv.NEXT_PUBLIC_APP_URL).toString(),
  };
}

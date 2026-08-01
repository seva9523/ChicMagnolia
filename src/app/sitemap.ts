import type { MetadataRoute } from 'next';

import { clientEnv } from '@/lib/env/client';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL;
  const lastModified = new Date();

  return [
    { url: new URL('/', baseUrl).toString(), lastModified, priority: 1 },
    {
      url: new URL('/support', baseUrl).toString(),
      lastModified,
      priority: 0.5,
    },
    {
      url: new URL('/privacy', baseUrl).toString(),
      lastModified,
      priority: 0.4,
    },
    { url: new URL('/terms', baseUrl).toString(), lastModified, priority: 0.4 },
  ];
}

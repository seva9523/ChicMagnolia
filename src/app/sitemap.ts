import type { MetadataRoute } from 'next';

import { canonicalUrl } from '@/lib/canonical-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: canonicalUrl('/'), lastModified, priority: 1 },
    {
      url: canonicalUrl('/support'),
      lastModified,
      priority: 0.5,
    },
    {
      url: canonicalUrl('/privacy'),
      lastModified,
      priority: 0.4,
    },
    { url: canonicalUrl('/terms'), lastModified, priority: 0.4 },
  ];
}

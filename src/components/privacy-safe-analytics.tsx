'use client';

import { Analytics } from '@vercel/analytics/next';

import { redactAnalyticsUrl } from '@/lib/analytics';

export function PrivacySafeAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => ({
        ...event,
        url: redactAnalyticsUrl(event.url),
      })}
    />
  );
}

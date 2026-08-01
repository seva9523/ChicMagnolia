import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function migration(name: string) {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

describe('database privacy controls', () => {
  it('cascades user deletion through every user-owned table', () => {
    const files = [
      '202607280001_create_profiles.sql',
      '202607280002_create_tracked_purchases.sql',
      '202607280003_create_price_checks.sql',
      '202607290001_create_notification_history.sql',
      '202607290002_create_stripe_subscriptions.sql',
      '202607310001_create_legal_acceptances.sql',
    ];

    for (const file of files) {
      expect(migration(file)).toMatch(/references auth\.users\s*\(id\) on delete cascade/i);
    }
  });

  it('enables row-level security for browser-visible personal-data tables', () => {
    const combined = [
      migration('202607280001_create_profiles.sql'),
      migration('202607280002_create_tracked_purchases.sql'),
      migration('202607280003_create_price_checks.sql'),
      migration('202607290001_create_notification_history.sql'),
      migration('202607290002_create_stripe_subscriptions.sql'),
      migration('202607310001_create_legal_acceptances.sql'),
    ].join('\n');

    for (const table of [
      'profiles',
      'tracked_purchases',
      'price_checks',
      'notification_history',
      'subscriptions',
      'legal_acceptances',
    ]) {
      expect(combined).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      );
    }
  });

  it('keeps legal acceptance writes server-controlled', () => {
    const sql = migration('202607310001_create_legal_acceptances.sql');

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/Users can view their own legal acceptances/i);
    expect(sql).not.toMatch(
      /create policy[^;]+legal_acceptances[\s\S]+?for insert/i,
    );
    expect(sql).not.toMatch(
      /create policy[^;]+legal_acceptances[\s\S]+?for update/i,
    );
    expect(sql).not.toMatch(
      /create policy[^;]+legal_acceptances[\s\S]+?for delete/i,
    );
  });
});

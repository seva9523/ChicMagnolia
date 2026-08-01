import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function migration(name: string) {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8',
  );
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
      expect(migration(file)).toMatch(
        /references auth\.users\s*\(id\) on delete cascade/i,
      );
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
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          'i',
        ),
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

  it('keeps support requests private while preserving unresolved cases after user deletion', () => {
    const sql = migration('202608010002_create_support_requests.sql');

    expect(sql).toMatch(/references auth\.users\s*\(id\) on delete set null/i);
    expect(sql).toMatch(
      /alter table public\.support_requests enable row level security/i,
    );
    expect(sql).not.toMatch(/create policy[^;]+support_requests/i);
    expect(sql).toMatch(
      /only the service role can read or mutate the[\s\S]*support queue/i,
    );
  });

  it('treats delayed Stripe events for deleted users as a no-op', () => {
    const sql = migration('202608010001_harden_stripe_subscription_sync.sql');

    expect(sql).toMatch(/from auth\.users/i);
    expect(sql).toMatch(/where id = p_user_id/i);
    expect(sql).toMatch(/return false/i);
    expect(sql.indexOf('return false')).toBeLessThan(
      sql.indexOf('insert into public.subscriptions'),
    );
    expect(sql).toMatch(/grant execute[\s\S]+to service_role/i);
    expect(sql).toMatch(/revoke all[\s\S]+from public, anon, authenticated/i);
  });
});

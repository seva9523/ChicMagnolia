import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function migration(name: string) {
  return readFileSync(
    join(process.cwd(), 'supabase', 'migrations', name),
    'utf8',
  );
}

function createPolicyStatements(sql: string) {
  return sql.match(/create policy[\s\S]*?;/gi) ?? [];
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
      '202608040001_create_private_beta_access.sql',
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
      migration('202608040001_create_private_beta_access.sql'),
    ].join('\n');

    for (const table of [
      'profiles',
      'tracked_purchases',
      'price_checks',
      'notification_history',
      'subscriptions',
      'legal_acceptances',
      'beta_access_grants',
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

  it('keeps private beta invitation tokens hashed and server-controlled', () => {
    const sql = migration('202608040001_create_private_beta_access.sql');
    const indexSql = migration(
      '202608040002_index_beta_invite_redemptions.sql',
    );
    const policies = createPolicyStatements(sql);
    const invitePolicies = policies.filter((policy) =>
      /on public\.beta_invites/i.test(policy),
    );
    const grantPolicies = policies.filter((policy) =>
      /on public\.beta_access_grants/i.test(policy),
    );

    expect(sql).toMatch(/token_hash text not null unique/i);
    expect(sql).toMatch(/token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
    expect(sql).toMatch(
      /alter table public\.beta_invites enable row level security/i,
    );
    expect(invitePolicies).toEqual([]);
    expect(sql).toMatch(
      /alter table public\.beta_access_grants enable row level security/i,
    );
    expect(grantPolicies).toHaveLength(1);
    expect(grantPolicies[0]).toMatch(/for select/i);
    expect(grantPolicies[0]).not.toMatch(/for (insert|update|delete)/i);
    expect(sql).toMatch(
      /create or replace function public\.redeem_beta_invite/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /revoke all on function public\.redeem_beta_invite[\s\S]+from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.redeem_beta_invite[\s\S]+to service_role/i,
    );
    expect(sql).toMatch(/invited_email = null/i);
    expect(indexSql).toMatch(
      /create index if not exists beta_invites_redeemed_by_idx[\s\S]+on public\.beta_invites\(redeemed_by\)/i,
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

  it('keeps Stripe webhook processing records inaccessible to browser roles', () => {
    const sql = migration('202607290002_create_stripe_subscriptions.sql');

    expect(sql).toMatch(
      /alter table public\.stripe_webhook_events enable row level security/i,
    );
    expect(sql).not.toMatch(/create policy[^;]+stripe_webhook_events/i);
    expect(sql).toMatch(
      /only the service role may read or write[\s\S]*Stripe webhook processing records/i,
    );
  });

  it('keeps internal trigger functions private and uses statement-stable RLS identity lookups', () => {
    const sql = migration('202608010003_harden_database_advisors.sql');

    expect(sql).toMatch(
      /alter function public\.set_updated_at\(\)[\s\S]*set search_path = pg_catalog/i,
    );

    for (const functionName of [
      'set_updated_at',
      'handle_new_user',
      'rls_auto_enable',
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke execute on function public\\.${functionName}\\(\\)[\\s\\S]*?from public, anon, authenticated, service_role`,
          'i',
        ),
      );
    }

    expect(
      sql.match(/\(select auth\.uid\(\)\)/gi)?.length ?? 0,
    ).toBeGreaterThanOrEqual(12);
    expect(sql).toMatch(
      /create index if not exists support_requests_user_id_idx[\s\S]*on public\.support_requests\(user_id\)/i,
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

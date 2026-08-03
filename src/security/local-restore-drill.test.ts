import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const script = readFileSync('scripts/restore-backup-locally.sh', 'utf8');
const runbook = readFileSync('docs/LOCAL_RESTORE_DRILL.md', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');

describe('zero-cost local restore drill', () => {
  it('targets only a fixed loopback database and never accepts a remote URL', () => {
    expect(script).toContain(
      "local_db_url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'",
    );
    expect(script).not.toContain('RESTORE_DB_URL');
    expect(script).not.toContain('SUPABASE_DB_URL');
    expect(script.match(/--dbname/g)).toHaveLength(2);
    expect(script.match(/--dbname "\$local_db_url"/g)).toHaveLength(2);
  });

  it('uses the official single-transaction Supabase restore sequence', () => {
    expect(script).toContain('supabase db start');
    expect(script).toContain('--single-transaction');
    expect(script).toContain('--variable ON_ERROR_STOP=1');
    expect(script).toContain('SET session_replication_role = replica');
    expect(script).toContain('--file "$backup_dir/roles.sql"');
    expect(script).toContain('--file "$backup_dir/schema.sql"');
    expect(script).toContain('--file "$backup_dir/data.sql"');
  });

  it('verifies tables, RLS and service-role-only controls after restore', () => {
    for (const table of [
      'profiles',
      'tracked_purchases',
      'price_checks',
      'notification_history',
      'subscriptions',
      'legal_acceptances',
      'support_requests',
      'stripe_webhook_events',
    ]) {
      expect(script).toContain(table);
    }

    expect(script).toContain('NOT c.relrowsecurity');
    expect(script).toContain(
      "tablename IN ('support_requests', 'stripe_webhook_events')",
    );
    expect(script).toContain("has_function_privilege('anon'");
    expect(script).toContain("has_function_privilege('authenticated'");
  });

  it('destroys the temporary local database and workdir by default', () => {
    expect(script).toContain('KEEP_LOCAL_RESTORE');
    expect(script).toContain('supabase stop --no-backup');
    expect(script).toContain('rm -rf "$workdir"');
  });

  it('keeps local recovery reports and restored files out of Git', () => {
    expect(gitignore).toContain('ChicMagnolia-restore-reports/');
    expect(gitignore).toContain('chicmagnolia-local-restore-*.txt');
    expect(gitignore).toContain('restored-backup/');
  });

  it('documents that the drill is local, free of hosted-project creation and not production ready', () => {
    expect(runbook).toContain('creates no hosted Supabase project');
    expect(runbook).toContain('127.0.0.1:54322');
    expect(runbook).toContain('must never be exposed to the internet');
    expect(runbook).toContain('scripts/restore-backup-locally.sh');
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  '.github/workflows/encrypted-database-backup.yml',
  'utf8',
);

describe('encrypted database backup workflow', () => {
  it('does not expose production database settings at job scope', () => {
    expect(workflow).not.toMatch(
      /\n    env:\n      SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}/,
    );
  });

  it('scopes production settings to non-pull-request backup steps', () => {
    expect(workflow).toMatch(
      /- name: Check backup configuration[\s\S]*?if: github\.event_name != 'pull_request'[\s\S]*?env:\n          SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}[\s\S]*?BACKUP_AGE_RECIPIENT: \$\{\{ vars\.BACKUP_AGE_RECIPIENT \}\}/,
    );

    expect(workflow).toMatch(
      /- name: Dump and encrypt database[\s\S]*?if: steps\.configuration\.outputs\.configured == 'true'[\s\S]*?env:\n          SUPABASE_DB_URL: \$\{\{ secrets\.SUPABASE_DB_URL \}\}[\s\S]*?BACKUP_AGE_RECIPIENT: \$\{\{ vars\.BACKUP_AGE_RECIPIENT \}\}/,
    );
  });

  it('keeps pull-request validation synthetic and secret-free', () => {
    const validationStart = workflow.indexOf(
      '- name: Validate backup toolchain',
    );
    const dumpStart = workflow.indexOf('- name: Dump and encrypt database');

    expect(validationStart).toBeGreaterThan(-1);
    expect(dumpStart).toBeGreaterThan(validationStart);

    const validationBlock = workflow.slice(validationStart, dumpStart);

    expect(validationBlock).not.toContain('secrets.SUPABASE_DB_URL');
    expect(validationBlock).not.toContain('vars.BACKUP_AGE_RECIPIENT');
    expect(validationBlock).toContain(
      'No production connection or database dump was attempted.',
    );
  });
});

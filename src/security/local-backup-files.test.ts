import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const gitignore = readFileSync('.gitignore', 'utf8');

describe('local database backup material', () => {
  it.each([
    'chicmagnolia-backup-key.txt',
    'chicmagnolia-database-*.zip',
    'chicmagnolia-database-*.tar.gz*',
    'chicmagnolia-restore-drill*/',
    'chicmagnolia-backup-verified*/',
    'restored-backup/',
    'encrypted-artifact/',
  ])('keeps %s out of source control', (pattern) => {
    expect(gitignore.split('\n')).toContain(pattern);
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'src');
const unspacedBrand = ['Chic', 'Magnolia'].join('');
const standaloneBrandPattern = new RegExp(
  `(?<![A-Za-z0-9_./-])${unspacedBrand}(?![A-Za-z0-9_./-])`,
);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const metadata = statSync(path);
    if (metadata.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe('product branding', () => {
  it('uses the spaced Chic Magnolia name in user-facing source', () => {
    const violations = sourceFiles(sourceRoot)
      .filter((path) => !path.endsWith('brand-name.test.ts'))
      .filter((path) => standaloneBrandPattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repositoryRoot, path));

    expect(violations).toEqual([]);
  });

  it('uses the spaced name in the public email sender example', () => {
    const environmentExample = readFileSync(
      join(repositoryRoot, '.env.example'),
      'utf8',
    );

    expect(environmentExample).toContain('EMAIL_FROM=Chic Magnolia <');
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const sourceRoot = join(repositoryRoot, 'src');
const docsRoot = join(repositoryRoot, 'docs');
const unspacedBrand = ['Chic', 'Magnolia'].join('');
const standaloneBrandPattern = new RegExp(
  `(?<![A-Za-z0-9_./-])${unspacedBrand}(?![A-Za-z0-9_./-])`,
);

function filesMatching(directory: string, pattern: RegExp): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const metadata = statSync(path);
    if (metadata.isDirectory()) return filesMatching(path, pattern);
    return pattern.test(entry) ? [path] : [];
  });
}

function markdownProse(markdown: string): string {
  let inFence = false;
  let fenceMarker = '';

  return markdown
    .split('\n')
    .map((line) => {
      const stripped = line.trimStart();
      if (stripped.startsWith('```') || stripped.startsWith('~~~')) {
        const marker = stripped.slice(0, 3);
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (marker === fenceMarker) {
          inFence = false;
          fenceMarker = '';
        }
        return '';
      }

      if (inFence) return '';
      return line.replace(/`+[^`]*`+/g, '');
    })
    .join('\n');
}

describe('product branding', () => {
  it('uses the spaced Chic Magnolia name in user-facing runtime source', () => {
    const violations = filesMatching(sourceRoot, /\.(?:ts|tsx)$/)
      .filter((path) => !/\.test\.(?:ts|tsx)$/.test(path))
      .filter((path) => standaloneBrandPattern.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repositoryRoot, path));

    expect(violations).toEqual([]);
  });

  it('uses the spaced name in documentation prose', () => {
    const markdownFiles = [
      join(repositoryRoot, 'README.md'),
      join(repositoryRoot, 'SECURITY.md'),
      ...filesMatching(docsRoot, /\.md$/),
    ];
    const violations = markdownFiles
      .filter((path) =>
        standaloneBrandPattern.test(markdownProse(readFileSync(path, 'utf8'))),
      )
      .map((path) => relative(repositoryRoot, path));

    expect(violations).toEqual([]);
  });

  it('uses the spaced name in customer-support response templates', () => {
    const supportPlaybook = readFileSync(
      join(docsRoot, 'SUPPORT_PLAYBOOK.md'),
      'utf8',
    );

    expect(supportPlaybook).not.toContain(unspacedBrand);
  });

  it('keeps operational checks aligned with the public brand', () => {
    const productionSmoke = readFileSync(
      join(repositoryRoot, 'scripts/production-smoke.sh'),
      'utf8',
    );
    const restoreDrill = readFileSync(
      join(repositoryRoot, 'scripts/restore-backup-locally.sh'),
      'utf8',
    );

    expect(productionSmoke).not.toContain(unspacedBrand);
    expect(restoreDrill).toContain('Chic Magnolia local restore drill');
  });

  it('documents the current Resend automation name', () => {
    const rollbackGuide = readFileSync(join(docsRoot, 'ROLLBACK.md'), 'utf8');

    expect(rollbackGuide).toContain(
      '`Chic Magnolia support request notifications` automation.',
    );
  });

  it('documents the customer-facing Stripe product with the spaced name', () => {
    const readme = readFileSync(join(repositoryRoot, 'README.md'), 'utf8');

    expect(readme).toContain('`Chic Magnolia Monthly`');
    expect(readme).not.toContain('`ChicMagnolia Monthly`');
  });

  it('uses the spaced name in the public email sender example', () => {
    const environmentExample = readFileSync(
      join(repositoryRoot, '.env.example'),
      'utf8',
    );

    expect(environmentExample).toContain('EMAIL_FROM=Chic Magnolia <');
  });
});

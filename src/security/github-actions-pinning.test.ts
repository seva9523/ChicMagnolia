import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflowPaths = [
  '.github/workflows/backup-helper-test.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/daily-price-monitoring.yml',
  '.github/workflows/encrypted-database-backup.yml',
  '.github/workflows/production-smoke.yml',
];

const workflows = workflowPaths.map((path) => ({
  path,
  content: readFileSync(path, 'utf8'),
}));

describe('GitHub Actions supply-chain pins', () => {
  it('pins every external action reference to an immutable commit SHA', () => {
    for (const { path, content } of workflows) {
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*uses:\s+([^@\s]+)@([^\s#]+)/);

        if (!match) {
          continue;
        }

        expect(match[2], `${path}: ${line.trim()}`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it('uses the validated Node 24 action releases', () => {
    const allWorkflows = workflows.map(({ content }) => content).join('\n');

    expect(allWorkflows).toContain(
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    );
    expect(allWorkflows).toContain(
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    );
    expect(allWorkflows).toContain(
      'github/codeql-action/init@e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81',
    );
  });

  it('does not retain deprecated Node 20 action releases', () => {
    const allWorkflows = workflows.map(({ content }) => content).join('\n');

    expect(allWorkflows).not.toContain(
      'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    );
    expect(allWorkflows).not.toContain(
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
    );
  });
});

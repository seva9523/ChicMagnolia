import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

const rootLayout = source('src/app/layout.tsx');
const homePage = source('src/app/page.tsx');
const supportLayout = source('src/app/support/layout.tsx');
const supportPage = source('src/app/support/page.tsx');
const privacyLayout = source('src/app/privacy/layout.tsx');
const privacyPage = source('src/app/privacy/page.tsx');
const termsLayout = source('src/app/terms/layout.tsx');
const termsPage = source('src/app/terms/page.tsx');

describe('public page metadata', () => {
  it('does not inherit the homepage canonical URL across every route', () => {
    expect(rootLayout).not.toContain("canonical: '/'");
    expect(rootLayout).not.toContain("template: '%s | ChicMagnolia'");
  });

  it.each([
    [homePage, '/'],
    [supportLayout, '/support'],
    [privacyLayout, '/privacy'],
    [termsLayout, '/terms'],
  ])('publishes the expected route-specific canonical URL', (file, path) => {
    expect(file).toContain(`canonical: '${path}'`);
  });

  it.each([
    [supportPage, 'Support | ChicMagnolia'],
    [privacyPage, 'Privacy notice | ChicMagnolia'],
    [termsPage, 'Terms of service | ChicMagnolia'],
  ])('publishes one brand suffix in the public page title', (file, title) => {
    expect(file).toContain(`title: '${title}'`);
  });
});

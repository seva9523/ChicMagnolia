import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { metadata as homeMetadata } from './page';
import { metadata as privacyMetadata } from './privacy/layout';
import { metadata as privacyPageMetadata } from './privacy/page';
import { metadata as supportMetadata } from './support/layout';
import { metadata as supportPageMetadata } from './support/page';
import { metadata as termsMetadata } from './terms/layout';
import { metadata as termsPageMetadata } from './terms/page';

const rootLayout = readFileSync('src/app/layout.tsx', 'utf8');

describe('public page metadata', () => {
  it('does not inherit the homepage canonical URL across every route', () => {
    expect(rootLayout).not.toContain("canonical: '/'");
    expect(rootLayout).not.toContain("template: '%s | ChicMagnolia'");
  });

  it('publishes a route-specific canonical URL for each public page', () => {
    expect(homeMetadata.alternates?.canonical).toBe('/');
    expect(supportMetadata.alternates?.canonical).toBe('/support');
    expect(privacyMetadata.alternates?.canonical).toBe('/privacy');
    expect(termsMetadata.alternates?.canonical).toBe('/terms');
  });

  it('publishes one non-duplicated brand name in public page titles', () => {
    expect(supportPageMetadata.title).toBe('Support | ChicMagnolia');
    expect(privacyPageMetadata.title).toBe('Privacy notice | ChicMagnolia');
    expect(termsPageMetadata.title).toBe('Terms of service | ChicMagnolia');
  });
});

import { describe, expect, it } from 'vitest';

import { brandedEmailFrom, EMAIL_SENDER_NAME } from './email-from';

describe('brandedEmailFrom', () => {
  it('replaces an old display name while preserving the email address', () => {
    expect(brandedEmailFrom('ChicMagnolia <notifications@example.com>')).toBe(
      'Chic Magnolia <notifications@example.com>',
    );
  });

  it('adds the display name to a plain email address', () => {
    expect(brandedEmailFrom('notifications@example.com')).toBe(
      'Chic Magnolia <notifications@example.com>',
    );
  });

  it('returns undefined when the sender is not configured', () => {
    expect(brandedEmailFrom(undefined)).toBeUndefined();
  });

  it('exports the public sender name', () => {
    expect(EMAIL_SENDER_NAME).toBe('Chic Magnolia');
  });
});

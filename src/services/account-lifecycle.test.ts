import { describe, expect, it } from 'vitest';

import {
  accountDeletionConfirmed,
  isStripeResourceMissing,
} from './account-lifecycle';

describe('account lifecycle safeguards', () => {
  it('requires the authenticated account email before deletion', () => {
    expect(accountDeletionConfirmed('shopper@example.com', 'shopper@example.com')).toBe(
      true,
    );
    expect(accountDeletionConfirmed(' SHOPPER@example.com ', 'shopper@example.com')).toBe(
      true,
    );
    expect(accountDeletionConfirmed('other@example.com', 'shopper@example.com')).toBe(
      false,
    );
    expect(accountDeletionConfirmed('', null)).toBe(false);
  });

  it('recognises an already-deleted Stripe resource without hiding other errors', () => {
    expect(isStripeResourceMissing({ code: 'resource_missing' })).toBe(true);
    expect(isStripeResourceMissing({ code: 'api_error' })).toBe(false);
    expect(isStripeResourceMissing(new Error('network failed'))).toBe(false);
  });
});

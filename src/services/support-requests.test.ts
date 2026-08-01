import { describe, expect, it } from 'vitest';

import {
  parseSupportRequest,
  supportNotificationPayload,
  supportTopicLabel,
} from './support-requests';

function validForm() {
  const form = new FormData();
  form.set('name', 'Sevinj Ahmadova');
  form.set('email', 'user@example.com');
  form.set('topic', 'retailer_check');
  form.set('message', 'The saved size shows a different stock status from the retailer page.');
  form.set('website', '');
  return form;
}

describe('support requests', () => {
  it('validates and normalizes a legitimate request', () => {
    const form = validForm();
    form.set('name', '  Sevinj Ahmadova  ');
    form.set('email', '  user@example.com  ');

    const parsed = parseSupportRequest(form);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('Expected support request to parse.');
    expect(parsed.data.name).toBe('Sevinj Ahmadova');
    expect(parsed.data.email).toBe('user@example.com');
    expect(supportTopicLabel(parsed.data.topic)).toBe('Retailer price or stock check');
  });

  it('rejects invalid email, short messages and honeypot submissions', () => {
    const invalidEmail = validForm();
    invalidEmail.set('email', 'not-an-email');
    expect(parseSupportRequest(invalidEmail).success).toBe(false);

    const shortMessage = validForm();
    shortMessage.set('message', 'Too short');
    expect(parseSupportRequest(shortMessage).success).toBe(false);

    const bot = validForm();
    bot.set('website', 'https://spam.example');
    expect(parseSupportRequest(bot).success).toBe(false);
  });

  it('builds a flat event payload without exposing internal notification configuration', () => {
    const parsed = parseSupportRequest(validForm());
    if (!parsed.success) throw new Error('Expected support request to parse.');

    expect(
      supportNotificationPayload({
        requestId: '11111111-1111-4111-8111-111111111111',
        request: parsed.data,
        submittedAt: '2026-08-01T10:00:00.000Z',
        userId: null,
      }),
    ).toEqual({
      request_id: '11111111-1111-4111-8111-111111111111',
      requester_name: 'Sevinj Ahmadova',
      requester_email: 'user@example.com',
      topic: 'Retailer price or stock check',
      message: 'The saved size shows a different stock status from the retailer page.',
      submitted_at: '2026-08-01T10:00:00.000Z',
      user_id: 'not-signed-in',
    });
  });
});

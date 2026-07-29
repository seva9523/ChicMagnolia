import 'server-only';

import { Resend } from 'resend';

import { serverEnv } from '@/lib/env/server';

let resendClient: Resend | undefined;

export function getResendClient() {
  if (!serverEnv.RESEND_API_KEY) {
    throw new Error('Resend is not configured.');
  }

  resendClient ??= new Resend(serverEnv.RESEND_API_KEY);
  return resendClient;
}

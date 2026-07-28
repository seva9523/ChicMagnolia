import 'server-only';

import { Resend } from 'resend';

import { serverEnv } from '@/lib/env/server';

let resendClient: Resend | undefined;

export function getResendClient() {
  resendClient ??= new Resend(serverEnv.RESEND_API_KEY);
  return resendClient;
}

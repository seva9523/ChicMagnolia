'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { publicAuthErrorMessage, safeAuthErrorLog } from '@/lib/auth-errors';
import { resolveAuthRequestOrigin } from '@/lib/auth-redirects';
import { clientEnv } from '@/lib/env/client';
import {
  legalAcceptanceConfirmed,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '@/lib/legal';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  betaInviteErrorMessage,
  redeemBetaInviteForUser,
  validateBetaInviteForSignup,
} from '@/services/beta-access';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

function signUpRedirectTarget(
  inviteToken: string,
  kind: 'error' | 'message',
  message: string,
) {
  const params = new URLSearchParams({ [kind]: message });
  if (inviteToken) params.set('invite', inviteToken);
  return `/sign-up?${params.toString()}`;
}

async function authCallbackUrl(nextPath: string) {
  const requestHeaders = await headers();
  const origin = resolveAuthRequestOrigin({
    canonicalOrigin: clientEnv.NEXT_PUBLIC_APP_URL,
    forwardedHost: requestHeaders.get('x-forwarded-host'),
    host: requestHeaders.get('host'),
    forwardedProto: requestHeaders.get('x-forwarded-proto'),
  });
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', nextPath);
  return callback.toString();
}

export async function signUp(formData: FormData) {
  const email = value(formData, 'email');
  const password = value(formData, 'password');
  const fullName = value(formData, 'fullName');
  const betaInviteToken = value(formData, 'betaInviteToken');

  if (!betaInviteToken) {
    redirect(
      signUpRedirectTarget(
        '',
        'error',
        'Private beta access requires a personal invitation link.',
      ),
    );
  }
  if (!legalAcceptanceConfirmed(formData.get('legalAccepted'))) {
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        'You must agree to the Terms and acknowledge the Privacy notice.',
      ),
    );
  }

  const admin = createSupabaseAdminClient();
  let inviteValidation;
  try {
    inviteValidation = await validateBetaInviteForSignup(
      admin,
      betaInviteToken,
      email,
    );
  } catch {
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        'We could not verify this private beta invitation. Please try again.',
      ),
    );
  }

  if (!inviteValidation.ok) {
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        betaInviteErrorMessage(inviteValidation.reason),
      ),
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: await authCallbackUrl('/dashboard'),
      data: {
        full_name: fullName,
        legal_accepted: true,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
      },
    },
  });

  if (error) {
    console.error('Supabase sign-up failed', safeAuthErrorLog(error));
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        publicAuthErrorMessage(error, 'sign-up'),
      ),
    );
  }

  const createdUser = data.user;
  if (
    !createdUser ||
    (Array.isArray(createdUser.identities) &&
      createdUser.identities.length === 0)
  ) {
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        'This account could not be created. Sign in if you already have an account.',
      ),
    );
  }

  try {
    await redeemBetaInviteForUser(
      admin,
      inviteValidation.tokenHash,
      createdUser.id,
      email,
    );
  } catch {
    console.error('Private beta invitation redemption failed.');
    const { error: rollbackError } = await admin.auth.admin.deleteUser(
      createdUser.id,
      false,
    );
    if (rollbackError) {
      console.error('Failed to roll back an incomplete private beta sign-up.');
    }
    redirect(
      signUpRedirectTarget(
        betaInviteToken,
        'error',
        'Private beta access could not be activated. Ask for a new invitation.',
      ),
    );
  }

  redirect('/sign-up?message=Check your email to confirm your account.');
}

export async function signIn(formData: FormData) {
  const email = value(formData, 'email');
  const password = value(formData, 'password');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Supabase sign-in failed', safeAuthErrorLog(error));
    redirect(
      `/login?error=${encodeURIComponent(publicAuthErrorMessage(error, 'sign-in'))}`,
    );
  }
  redirect('/dashboard');
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function requestPasswordReset(formData: FormData) {
  const email = value(formData, 'email');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: await authCallbackUrl('/reset-password'),
  });

  if (error) {
    console.error(
      'Supabase password reset request failed',
      safeAuthErrorLog(error),
    );
    redirect(
      `/forgot-password?error=${encodeURIComponent(publicAuthErrorMessage(error, 'password-reset'))}`,
    );
  }
  redirect(
    '/forgot-password?message=Password reset instructions have been sent.',
  );
}

export async function updatePassword(formData: FormData) {
  const password = value(formData, 'password');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Supabase password update failed', safeAuthErrorLog(error));
    redirect(
      `/reset-password?error=${encodeURIComponent(publicAuthErrorMessage(error, 'password-update'))}`,
    );
  }
  redirect('/dashboard?message=Password updated successfully.');
}

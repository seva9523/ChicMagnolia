'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { resolveAuthRequestOrigin } from '@/lib/auth-redirects';
import { clientEnv } from '@/lib/env/client';
import {
  legalAcceptanceConfirmed,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from '@/lib/legal';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
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
  if (!legalAcceptanceConfirmed(formData.get('legalAccepted'))) {
    redirect(
      '/sign-up?error=You must agree to the Terms and acknowledge the Privacy notice.',
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
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

  if (error) redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  redirect('/sign-up?message=Check your email to confirm your account.');
}

export async function signIn(formData: FormData) {
  const email = value(formData, 'email');
  const password = value(formData, 'password');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
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

  if (error) redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  redirect('/forgot-password?message=Password reset instructions have been sent.');
}

export async function updatePassword(formData: FormData) {
  const password = value(formData, 'password');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  redirect('/dashboard?message=Password updated successfully.');
}

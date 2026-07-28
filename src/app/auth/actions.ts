'use server';

import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase/server';

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

export async function signUp(formData: FormData) {
  const email = value(formData, 'email');
  const password = value(formData, 'password');
  const fullName = value(formData, 'fullName');
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: { full_name: fullName },
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
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
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

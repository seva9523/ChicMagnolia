import { NextResponse } from 'next/server';

import { safeAuthNextPath } from '@/lib/auth-redirects';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function redirectWithMessage(
  origin: string,
  pathname: string,
  kind: 'error' | 'message',
  message: string,
) {
  const target = new URL(pathname, origin);
  target.searchParams.set(kind, message);
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeAuthNextPath(url.searchParams.get('next'));

  if (!code) {
    return redirectWithMessage(
      url.origin,
      next === '/reset-password' ? '/forgot-password' : '/login',
      'error',
      next === '/reset-password'
        ? 'This password reset link is invalid or expired. Request a new one.'
        : 'This confirmation link is invalid or expired.',
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) return NextResponse.redirect(new URL(next, url.origin));

  if (next === '/reset-password') {
    return redirectWithMessage(
      url.origin,
      '/forgot-password',
      'error',
      'The password reset link could not open a secure session. Request a new link.',
    );
  }

  return redirectWithMessage(
    url.origin,
    '/login',
    'message',
    'Your email was confirmed, but automatic sign-in could not be completed. Please sign in.',
  );
}

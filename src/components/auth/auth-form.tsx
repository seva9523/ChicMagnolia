import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';

type AuthFormProps = {
  action: (formData: FormData) => Promise<void>;
  mode: 'login' | 'sign-up' | 'forgot' | 'reset';
  error?: string;
  message?: string;
};

export function AuthForm({ action, mode, error, message }: AuthFormProps) {
  const isSignUp = mode === 'sign-up';
  const isReset = mode === 'reset';
  const asksForEmail = !isReset;
  const asksForPassword = mode === 'login' || isSignUp || isReset;
  const title = {
    login: 'Welcome back',
    'sign-up': 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];

  return (
    <>
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="bg-card w-full max-w-md rounded-3xl border p-8 shadow-sm">
          <Link href="/" className="text-primary text-sm font-semibold">
            Chic Magnolia
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Track purchases and catch price drops before your return window
            closes.
          </p>

          {error ? (
            <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-5 rounded-xl bg-green-50 p-3 text-sm text-green-700">
              {message}
            </p>
          ) : null}

          <form action={action} className="mt-6 space-y-4">
            {isSignUp ? (
              <label className="block text-sm font-medium">
                Full name
                <input
                  name="fullName"
                  required
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                />
              </label>
            ) : null}
            {asksForEmail ? (
              <label className="block text-sm font-medium">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                />
              </label>
            ) : null}
            {asksForPassword ? (
              <label className="block text-sm font-medium">
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  autoComplete={
                    isSignUp || isReset ? 'new-password' : 'current-password'
                  }
                  required
                  className="mt-2 w-full rounded-xl border bg-transparent px-4 py-3"
                />
              </label>
            ) : null}
            {isSignUp ? (
              <label className="flex items-start gap-3 rounded-xl border p-3 text-sm leading-6">
                <input
                  className="mt-1 size-4"
                  name="legalAccepted"
                  required
                  type="checkbox"
                />
                <span>
                  I agree to the{' '}
                  <Link
                    className="text-primary font-medium underline"
                    href="/terms"
                  >
                    Terms of service
                  </Link>{' '}
                  and acknowledge the{' '}
                  <Link
                    className="text-primary font-medium underline"
                    href="/privacy"
                  >
                    Privacy notice
                  </Link>
                  .
                </span>
              </label>
            ) : null}
            <Button type="submit" className="w-full">
              {mode === 'login'
                ? 'Sign in'
                : mode === 'sign-up'
                  ? 'Create account'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Update password'}
            </Button>
          </form>

          <div className="text-muted-foreground mt-6 flex justify-between text-sm">
            {mode === 'login' ? (
              <Link href="/sign-up">Create account</Link>
            ) : (
              <Link href="/login">Back to login</Link>
            )}
            {mode === 'login' ? (
              <Link href="/forgot-password">Forgot password?</Link>
            ) : null}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

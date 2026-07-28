import { requestPasswordReset } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/auth-form';

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <AuthForm action={requestPasswordReset} mode="forgot" error={params.error} message={params.message} />;
}

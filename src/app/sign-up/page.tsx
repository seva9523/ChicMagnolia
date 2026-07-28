import { signUp } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/auth-form';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <AuthForm action={signUp} mode="sign-up" error={params.error} message={params.message} />;
}

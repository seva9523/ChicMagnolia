import { signIn } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/auth-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      action={signIn}
      mode="login"
      error={params.error}
      message={params.message}
    />
  );
}

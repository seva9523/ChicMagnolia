import { updatePassword } from '@/app/auth/actions';
import { AuthForm } from '@/components/auth/auth-form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      action={updatePassword}
      mode="reset"
      error={params.error}
      message={params.message}
    />
  );
}

type AuthAction = 'sign-up' | 'sign-in' | 'password-reset' | 'password-update';

type AuthErrorDetails = {
  name: string | null;
  code: string | null;
  status: number | null;
  message: string | null;
};

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readableMessage(message: string | null) {
  if (!message) return null;
  const normalized = message.trim();
  if (!normalized || ['{}', '[]', '[object Object]', 'null', 'undefined'].includes(normalized)) {
    return null;
  }
  return normalized;
}

function redactMessage(message: string | null) {
  return message
    ?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .slice(0, 500) ?? null;
}

export function authErrorDetails(error: unknown): AuthErrorDetails {
  if (!error || typeof error !== 'object') {
    return {
      name: error instanceof Error ? error.name : null,
      code: null,
      status: null,
      message: error instanceof Error ? error.message : null,
    };
  }

  const record = error as Record<string, unknown>;
  return {
    name: stringField(record, 'name'),
    code: stringField(record, 'code'),
    status: numberField(record, 'status'),
    message: stringField(record, 'message'),
  };
}

export function safeAuthErrorLog(error: unknown) {
  const details = authErrorDetails(error);
  return { ...details, message: redactMessage(details.message) };
}

export function publicAuthErrorMessage(error: unknown, action: AuthAction): string {
  const { code, status, message } = authErrorDetails(error);

  if (code === 'email_address_invalid') return 'Enter a valid email address.';
  if (code === 'email_address_not_authorized') {
    return 'Email delivery is not configured for this address yet.';
  }
  if (code === 'over_email_send_rate_limit' || status === 429) {
    return 'Too many authentication emails were requested. Wait a few minutes and try again.';
  }
  if (code === 'user_already_exists') {
    return 'An account already exists for this email. Sign in or reset the password.';
  }

  const safeMessage = readableMessage(message);
  if (safeMessage && status !== 500 && code !== 'unexpected_failure') return safeMessage;

  const fallback: Record<AuthAction, string> = {
    'sign-up': 'We could not create your account or send the confirmation email. Please try again shortly.',
    'sign-in': 'We could not sign you in. Check your details and try again.',
    'password-reset': 'We could not send the password reset email. Please try again shortly.',
    'password-update': 'We could not update your password. Please request a new reset link and try again.',
  };

  return fallback[action];
}

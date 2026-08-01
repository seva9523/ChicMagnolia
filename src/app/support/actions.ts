'use server';

import { redirect } from 'next/navigation';

import { getResendClient } from '@/integrations/resend';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  parseSupportRequest,
  SUPPORT_EVENT_NAME,
  SUPPORT_NOTIFICATION_CONTACT_ID,
  supportNotificationPayload,
} from '@/services/support-requests';

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 3;

function supportRedirect(kind: 'error' | 'message', message: string): never {
  redirect(`/support?${kind}=${encodeURIComponent(message)}`);
}

function firstValidationError(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? 'Check the form and try again.';
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : 'Unknown notification error';
}

export async function submitSupportRequest(formData: FormData) {
  // A hidden field catches basic automated submissions without revealing the rule.
  if (String(formData.get('website') ?? '').trim()) {
    supportRedirect('message', 'Your request has been received.');
  }

  const parsed = parseSupportRequest(formData);
  if (!parsed.success) {
    supportRedirect('error', firstValidationError(parsed.error));
  }

  const request = parsed.data;
  const normalizedEmail = request.email.toLowerCase();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    supportRedirect(
      'error',
      'Support is temporarily unavailable. Please try again later.',
    );
  }

  const cutoff = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const { count, error: countError } = await admin
    .from('support_requests')
    .select('id', { count: 'exact', head: true })
    .eq('email_normalized', normalizedEmail)
    .gte('created_at', cutoff);

  if (countError) {
    supportRedirect(
      'error',
      'Support is temporarily unavailable. Please try again later.',
    );
  }
  if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    supportRedirect(
      'error',
      'Too many recent requests were submitted for this email address. Please wait 15 minutes.',
    );
  }

  const submittedAt = new Date().toISOString();
  const { data: stored, error: insertError } = await admin
    .from('support_requests')
    .insert({
      user_id: user?.id ?? null,
      name: request.name,
      email: request.email,
      email_normalized: normalizedEmail,
      topic: request.topic,
      message: request.message,
      notification_status: 'pending',
    })
    .select('id, created_at')
    .single();

  if (insertError || !stored) {
    supportRedirect(
      'error',
      'Your request could not be saved. Please try again later.',
    );
  }

  let notificationStatus: 'sent' | 'failed' = 'sent';
  let notificationError: string | null = null;

  try {
    const { error } = await getResendClient().events.send({
      event: SUPPORT_EVENT_NAME,
      contactId: SUPPORT_NOTIFICATION_CONTACT_ID,
      payload: supportNotificationPayload({
        requestId: stored.id,
        request,
        submittedAt: stored.created_at ?? submittedAt,
        userId: user?.id ?? null,
      }),
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    notificationStatus = 'failed';
    notificationError = safeErrorMessage(error);
    console.error('Support request notification failed', {
      requestId: stored.id,
      message: notificationError,
    });
  }

  const { error: updateError } = await admin
    .from('support_requests')
    .update({
      notification_status: notificationStatus,
      notification_error: notificationError,
    })
    .eq('id', stored.id);

  if (updateError) {
    console.error('Support request notification status could not be stored', {
      requestId: stored.id,
      code: updateError.code,
    });
  }

  supportRedirect(
    'message',
    `Your request has been received. Reference: ${stored.id}`,
  );
}

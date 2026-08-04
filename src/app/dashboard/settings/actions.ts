'use server';

import { redirect } from 'next/navigation';

import { getStripeClient } from '@/integrations/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  accountDeletionConfirmed,
  isStripeResourceMissing,
} from '@/services/account-lifecycle';
import { getUserSubscription } from '@/services/subscription-access';

function settingsRedirect(message: string): never {
  redirect(`/dashboard/settings?message=${encodeURIComponent(message)}`);
}

export async function deleteAccount(formData: FormData) {
  const confirmationEmail = String(formData.get('confirmationEmail') ?? '');
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  if (!accountDeletionConfirmed(confirmationEmail, user.email)) {
    settingsRedirect(
      'Enter the email address for this account exactly to confirm deletion.',
    );
  }

  let customerId: string | null = null;
  try {
    const subscription = await getUserSubscription(supabase, user.id);
    customerId = subscription?.stripe_customer_id ?? null;
  } catch {
    settingsRedirect(
      'We could not verify the linked billing account. Nothing was deleted.',
    );
  }

  let stripeCustomerRemoved = false;
  if (customerId) {
    try {
      await getStripeClient().customers.del(customerId);
      stripeCustomerRemoved = true;
    } catch (error) {
      if (isStripeResourceMissing(error)) {
        stripeCustomerRemoved = true;
      } else {
        settingsRedirect(
          'We could not stop the linked Stripe billing account. Nothing was deleted. Please try again.',
        );
      }
    }
  }

  const admin = createSupabaseAdminClient();
  const { error: deletionError } = await admin.auth.admin.deleteUser(
    user.id,
    false,
  );
  if (deletionError) {
    settingsRedirect(
      stripeCustomerRemoved
        ? 'Stripe billing was removed, but the Chic Magnolia account could not be deleted. Contact support.'
        : 'The Chic Magnolia account could not be deleted. Please try again.',
    );
  }

  await supabase.auth.signOut({ scope: 'local' });
  redirect(
    `/login?message=${encodeURIComponent(
      'Your Chic Magnolia account and user-owned application data have been deleted.',
    )}`,
  );
}

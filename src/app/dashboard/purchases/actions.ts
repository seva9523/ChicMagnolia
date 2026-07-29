'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  performPriceCheck,
  type TrackedPurchaseForCheck,
} from '@/services/price-monitoring';
import {
  getUserSubscription,
  hasMonitoringAccess,
} from '@/services/subscription-access';

const MAX_ACTIVE_PURCHASES = 10;

const purchaseSchema = z
  .object({
    retailerName: z.string().trim().min(2, 'Retailer is required.').max(100),
    productName: z.string().trim().min(2, 'Product name is required.').max(200),
    productUrl: z.string().trim().url('Enter a valid product URL.'),
    purchasePrice: z.coerce.number().positive('Purchase price must be greater than zero.'),
    purchaseDate: z.string().date('Purchase date is required.'),
    returnDeadline: z.string().date('Return deadline is required.'),
    size: z.string().trim().max(50).optional(),
    colour: z.string().trim().max(50).optional(),
  })
  .refine((data) => data.returnDeadline >= data.purchaseDate, {
    message: 'Return deadline cannot be before the purchase date.',
    path: ['returnDeadline'],
  });

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim();
}

async function requirePaidMonitoringAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  let subscription;
  try {
    subscription = await getUserSubscription(supabase, userId);
  } catch {
    redirect('/dashboard/billing?message=We could not confirm your subscription access.');
  }

  if (!hasMonitoringAccess(subscription)) {
    redirect(
      '/dashboard/billing?message=An active ChicMagnolia subscription is required for monitoring.',
    );
  }
}

export async function createPurchase(formData: FormData) {
  const result = purchaseSchema.safeParse({
    retailerName: field(formData, 'retailerName'),
    productName: field(formData, 'productName'),
    productUrl: field(formData, 'productUrl'),
    purchasePrice: field(formData, 'purchasePrice'),
    purchaseDate: field(formData, 'purchaseDate'),
    returnDeadline: field(formData, 'returnDeadline'),
    size: field(formData, 'size') || undefined,
    colour: field(formData, 'colour') || undefined,
  });

  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Check the form and try again.';
    redirect(`/dashboard/purchases/new?error=${encodeURIComponent(message)}`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  await requirePaidMonitoringAccess(supabase, user.id);

  const { count, error: countError } = await supabase
    .from('tracked_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'tracking');
  if (countError) redirect(`/dashboard/purchases/new?error=${encodeURIComponent(countError.message)}`);
  if ((count ?? 0) >= MAX_ACTIVE_PURCHASES) {
    redirect(
      `/dashboard/purchases/new?error=${encodeURIComponent(
        `The MVP supports up to ${MAX_ACTIVE_PURCHASES} active tracked purchases. Stop tracking or return one before adding another.`,
      )}`,
    );
  }

  const { error } = await supabase.from('tracked_purchases').insert({
    user_id: user.id,
    retailer_name: result.data.retailerName,
    product_name: result.data.productName,
    product_url: result.data.productUrl,
    purchase_price_pence: Math.round(result.data.purchasePrice * 100),
    currency: 'GBP',
    purchase_date: result.data.purchaseDate,
    return_deadline: result.data.returnDeadline,
    size: result.data.size ?? null,
    colour: result.data.colour ?? null,
  });

  if (error) redirect(`/dashboard/purchases/new?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/dashboard');
  redirect('/dashboard?message=Purchase added successfully.');
}

export async function updatePurchaseStatus(formData: FormData) {
  const purchaseId = field(formData, 'purchaseId');
  const status = field(formData, 'status');

  if (!z.string().uuid().safeParse(purchaseId).success) redirect('/dashboard?message=Invalid purchase.');
  if (!['tracking', 'returned', 'stopped'].includes(status)) {
    redirect('/dashboard?message=Invalid purchase status.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase
    .from('tracked_purchases')
    .update({ status })
    .eq('id', purchaseId)
    .eq('user_id', user.id);

  if (error) redirect(`/dashboard?message=${encodeURIComponent(error.message)}`);

  revalidatePath('/dashboard');
  redirect('/dashboard?message=Purchase updated.');
}

export async function checkCurrentPrice(formData: FormData) {
  const purchaseId = field(formData, 'purchaseId');
  if (!z.string().uuid().safeParse(purchaseId).success) redirect('/dashboard?message=Invalid purchase.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await requirePaidMonitoringAccess(supabase, user.id);

  const { data: purchase, error: purchaseError } = await supabase
    .from('tracked_purchases')
    .select(
      'id, user_id, retailer_name, product_name, product_url, purchase_price_pence, currency, return_deadline, size, colour, status',
    )
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .single();

  if (purchaseError || !purchase) redirect('/dashboard?message=Purchase could not be found.');

  const outcome = await performPriceCheck(supabase, purchase as TrackedPurchaseForCheck);
  const message = outcome.ok
    ? 'Current price checked successfully.'
    : `Price check failed: ${outcome.error}`;

  revalidatePath('/dashboard');
  redirect(`/dashboard?message=${encodeURIComponent(message)}`);
}

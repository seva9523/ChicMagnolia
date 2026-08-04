'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateRetailerSelection } from '@/retailers/selection';
import { getUserMonitoringEntitlement } from '@/services/monitoring-access';
import {
  performPriceCheck,
  type TrackedPurchaseForCheck,
} from '@/services/price-monitoring';

const MAX_ACTIVE_PURCHASES = 10;

const purchaseSchema = z
  .object({
    retailerName: z.string().trim().min(2, 'Retailer is required.').max(100),
    productName: z.string().trim().min(2, 'Product name is required.').max(200),
    productUrl: z.string().trim().url('Enter a valid product URL.'),
    purchasePrice: z.coerce
      .number()
      .positive('Purchase price must be greater than zero.'),
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

async function requireMonitoringAccess(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  let access;
  try {
    access = await getUserMonitoringEntitlement(supabase, userId);
  } catch {
    redirect(
      '/dashboard/billing?message=We could not confirm your monitoring access.',
    );
  }

  if (!access.hasAccess) {
    redirect(
      '/dashboard/billing?message=An active private beta invitation or subscription is required for monitoring.',
    );
  }
}

async function activePurchaseCount(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
) {
  const { count, error } = await supabase
    .from('tracked_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'tracking');
  if (error) throw new Error(error.message);
  return count ?? 0;
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
    const message =
      result.error.issues[0]?.message ?? 'Check the form and try again.';
    redirect(`/dashboard/purchases/new?error=${encodeURIComponent(message)}`);
  }

  const retailerSelection = validateRetailerSelection(
    result.data.retailerName,
    result.data.productUrl,
  );
  if (!retailerSelection.ok) {
    redirect(
      `/dashboard/purchases/new?error=${encodeURIComponent(
        retailerSelection.message,
      )}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');
  await requireMonitoringAccess(supabase, user.id);

  let count = 0;
  try {
    count = await activePurchaseCount(supabase, user.id);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Active purchases could not be counted.';
    redirect(`/dashboard/purchases/new?error=${encodeURIComponent(message)}`);
  }
  if (count >= MAX_ACTIVE_PURCHASES) {
    redirect(
      `/dashboard/purchases/new?error=${encodeURIComponent(
        `The MVP supports up to ${MAX_ACTIVE_PURCHASES} active tracked purchases. Stop tracking or return one before adding another.`,
      )}`,
    );
  }

  const { error } = await supabase.from('tracked_purchases').insert({
    user_id: user.id,
    retailer_name: retailerSelection.retailerName,
    product_name: result.data.productName,
    product_url: retailerSelection.productUrl.toString(),
    purchase_price_pence: Math.round(result.data.purchasePrice * 100),
    currency: 'GBP',
    purchase_date: result.data.purchaseDate,
    return_deadline: result.data.returnDeadline,
    size: result.data.size ?? null,
    colour: result.data.colour ?? null,
  });

  if (error)
    redirect(
      `/dashboard/purchases/new?error=${encodeURIComponent(error.message)}`,
    );

  revalidatePath('/dashboard');
  redirect('/dashboard?message=Purchase added successfully.');
}

export async function updatePurchaseStatus(formData: FormData) {
  const purchaseId = field(formData, 'purchaseId');
  const status = field(formData, 'status');

  if (!z.string().uuid().safeParse(purchaseId).success)
    redirect('/dashboard?message=Invalid purchase.');
  if (!['tracking', 'returned', 'stopped'].includes(status)) {
    redirect('/dashboard?message=Invalid purchase status.');
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: existing, error: existingError } = await supabase
    .from('tracked_purchases')
    .select('status')
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existingError || !existing)
    redirect('/dashboard?message=Purchase could not be found.');

  if (status === 'tracking' && existing.status !== 'tracking') {
    await requireMonitoringAccess(supabase, user.id);

    let count = 0;
    try {
      count = await activePurchaseCount(supabase, user.id);
    } catch {
      redirect('/dashboard?message=Active purchases could not be counted.');
    }
    if (count >= MAX_ACTIVE_PURCHASES) {
      redirect(
        `/dashboard?message=Only ${MAX_ACTIVE_PURCHASES} purchases can be actively tracked.`,
      );
    }
  }

  const { error } = await supabase
    .from('tracked_purchases')
    .update({ status })
    .eq('id', purchaseId)
    .eq('user_id', user.id);

  if (error)
    redirect(`/dashboard?message=${encodeURIComponent(error.message)}`);

  revalidatePath('/dashboard');
  redirect('/dashboard?message=Purchase updated.');
}

export async function checkCurrentPrice(formData: FormData) {
  const purchaseId = field(formData, 'purchaseId');
  if (!z.string().uuid().safeParse(purchaseId).success)
    redirect('/dashboard?message=Invalid purchase.');

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  await requireMonitoringAccess(supabase, user.id);

  const { data: purchase, error: purchaseError } = await supabase
    .from('tracked_purchases')
    .select(
      'id, user_id, retailer_name, product_name, product_url, purchase_price_pence, currency, return_deadline, size, colour, status',
    )
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .single();

  if (purchaseError || !purchase)
    redirect('/dashboard?message=Purchase could not be found.');

  const outcome = await performPriceCheck(
    supabase,
    purchase as TrackedPurchaseForCheck,
  );
  const message = outcome.ok
    ? 'Current price checked successfully.'
    : `Price check failed: ${outcome.error}`;

  revalidatePath('/dashboard');
  redirect(`/dashboard?message=${encodeURIComponent(message)}`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { retailerAdapters } from '@/retailers';

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

  const { data: purchase, error: purchaseError } = await supabase
    .from('tracked_purchases')
    .select('id, product_url, size, colour, status')
    .eq('id', purchaseId)
    .eq('user_id', user.id)
    .single();

  if (purchaseError || !purchase) redirect('/dashboard?message=Purchase could not be found.');
  if (purchase.status !== 'tracking') redirect('/dashboard?message=Only active purchases can be checked.');

  let redirectMessage = 'Current price checked successfully.';

  try {
    const url = new URL(purchase.product_url);
    const adapter = retailerAdapters.find((candidate) => candidate.supports(url));
    if (!adapter) throw new Error('This retailer is not supported yet.');

    const snapshot = await adapter.fetchProduct(url, {
      size: purchase.size,
      colour: purchase.colour,
    });

    const { error: checkError } = await supabase.from('price_checks').insert({
      purchase_id: purchase.id,
      user_id: user.id,
      price_pence: snapshot.price.amountMinor,
      currency: snapshot.price.currency,
      in_stock: snapshot.inStock,
      checked_at: snapshot.checkedAt.toISOString(),
      error_message: null,
    });
    if (checkError) throw new Error(checkError.message);

    const { error: updateError } = await supabase
      .from('tracked_purchases')
      .update({
        current_price_pence: snapshot.price.amountMinor,
        current_in_stock: snapshot.inStock,
        last_checked_at: snapshot.checkedAt.toISOString(),
        last_check_error: null,
      })
      .eq('id', purchase.id)
      .eq('user_id', user.id);
    if (updateError) throw new Error(updateError.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Price check failed.';
    redirectMessage = `Price check failed: ${message}`;

    await supabase.from('price_checks').insert({
      purchase_id: purchase.id,
      user_id: user.id,
      price_pence: null,
      currency: 'GBP',
      in_stock: null,
      error_message: message,
    });

    await supabase
      .from('tracked_purchases')
      .update({ last_checked_at: new Date().toISOString(), last_check_error: message })
      .eq('id', purchase.id)
      .eq('user_id', user.id);
  }

  revalidatePath('/dashboard');
  redirect(`/dashboard?message=${encodeURIComponent(redirectMessage)}`);
}

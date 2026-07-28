'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase/server';

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

  if (error) {
    redirect(`/dashboard/purchases/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard');
  redirect('/dashboard?message=Purchase added successfully.');
}

export async function updatePurchaseStatus(formData: FormData) {
  const purchaseId = field(formData, 'purchaseId');
  const status = field(formData, 'status');

  if (!z.string().uuid().safeParse(purchaseId).success) {
    redirect('/dashboard?message=Invalid purchase.');
  }

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
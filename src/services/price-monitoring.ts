import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getResendClient } from '@/integrations/resend';
import { clientEnv } from '@/lib/env/client';
import { serverEnv } from '@/lib/env/server';
import { fetchProductForDailyMonitoring, retailerAdapters } from '@/retailers';
import type { RetailerProductSnapshot } from '@/retailers/types';
import {
  buildPriceDropEmail,
  isPriceDropAlertEligible,
} from '@/services/price-alerts';

export type TrackedPurchaseForCheck = {
  id: string;
  user_id: string;
  retailer_name: string;
  product_name: string;
  product_url: string;
  purchase_price_pence: number;
  currency: string;
  return_deadline: string;
  size: string | null;
  colour: string | null;
  status: string;
};

export type PriceCheckOutcome =
  | { ok: true; snapshot: RetailerProductSnapshot }
  | { ok: false; error: string };

export type MonitoredPurchaseOutcome = {
  check: 'succeeded' | 'failed';
  alert: 'sent' | 'duplicate' | 'not_eligible' | 'missing_email' | 'failed';
  error?: string;
};

type PriceCheckMode = 'interactive' | 'daily';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Price check failed.';
}

async function persistFailedCheck(
  supabase: SupabaseClient,
  purchase: TrackedPurchaseForCheck,
  message: string,
  checkedAt: Date,
) {
  await Promise.allSettled([
    supabase.from('price_checks').insert({
      purchase_id: purchase.id,
      user_id: purchase.user_id,
      price_pence: null,
      currency: purchase.currency || 'GBP',
      in_stock: null,
      checked_at: checkedAt.toISOString(),
      error_message: message,
    }),
    supabase
      .from('tracked_purchases')
      .update({
        last_checked_at: checkedAt.toISOString(),
        last_check_error: message,
      })
      .eq('id', purchase.id)
      .eq('user_id', purchase.user_id),
  ]);
}

export async function performPriceCheck(
  supabase: SupabaseClient,
  purchase: TrackedPurchaseForCheck,
  mode: PriceCheckMode = 'interactive',
): Promise<PriceCheckOutcome> {
  try {
    if (purchase.status !== 'tracking')
      throw new Error('Only active purchases can be checked.');

    const url = new URL(purchase.product_url);
    const variant = {
      size: purchase.size,
      colour: purchase.colour,
    };

    const snapshot =
      mode === 'daily'
        ? await fetchProductForDailyMonitoring(url, variant)
        : await (async () => {
            const adapter = retailerAdapters.find((candidate) =>
              candidate.supports(url),
            );
            if (!adapter)
              throw new Error('This retailer is not supported yet.');
            return adapter.fetchProduct(url, variant);
          })();

    const { error: checkError } = await supabase.from('price_checks').insert({
      purchase_id: purchase.id,
      user_id: purchase.user_id,
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
      .eq('user_id', purchase.user_id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true, snapshot };
  } catch (error) {
    const message = errorMessage(error);
    await persistFailedCheck(supabase, purchase, message, new Date());
    return { ok: false, error: message };
  }
}

async function sendPriceDropAlert(
  supabase: SupabaseClient,
  purchase: TrackedPurchaseForCheck,
  snapshot: RetailerProductSnapshot,
  userEmail: string,
): Promise<'sent' | 'duplicate' | 'failed'> {
  const currentPricePence = snapshot.price.amountMinor;
  const savingsPence = purchase.purchase_price_pence - currentPricePence;

  try {
    const { data: existing, error: existingError } = await supabase
      .from('notification_history')
      .select('id')
      .eq('purchase_id', purchase.id)
      .eq('notification_type', 'price_drop')
      .eq('current_price_pence', currentPricePence)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return 'duplicate';

    if (!serverEnv.EMAIL_FROM)
      throw new Error('Email sender is not configured.');

    const email = buildPriceDropEmail({
      retailerName: purchase.retailer_name,
      productName: purchase.product_name,
      productUrl: purchase.product_url,
      dashboardUrl: new URL(
        '/dashboard',
        clientEnv.NEXT_PUBLIC_APP_URL,
      ).toString(),
      purchasePricePence: purchase.purchase_price_pence,
      currentPricePence,
      currency: snapshot.price.currency,
      inStock: snapshot.inStock,
      returnDeadline: purchase.return_deadline,
      size: purchase.size,
      colour: purchase.colour,
    });

    const { data, error } = await getResendClient().emails.send({
      from: serverEnv.EMAIL_FROM,
      to: userEmail,
      subject: email.subject,
      html: email.html,
    });
    if (error) throw new Error(error.message);

    const { error: historyError } = await supabase
      .from('notification_history')
      .insert({
        purchase_id: purchase.id,
        user_id: purchase.user_id,
        notification_type: 'price_drop',
        channel: 'email',
        status: 'sent',
        purchase_price_pence: purchase.purchase_price_pence,
        current_price_pence: currentPricePence,
        savings_pence: savingsPence,
        provider_message_id: data?.id ?? null,
        error_message: null,
        sent_at: new Date().toISOString(),
      });
    if (historyError && historyError.code !== '23505')
      throw new Error(historyError.message);

    return historyError?.code === '23505' ? 'duplicate' : 'sent';
  } catch (error) {
    const message = errorMessage(error);

    await supabase.from('notification_history').insert({
      purchase_id: purchase.id,
      user_id: purchase.user_id,
      notification_type: 'price_drop',
      channel: 'email',
      status: 'failed',
      purchase_price_pence: purchase.purchase_price_pence,
      current_price_pence: currentPricePence,
      savings_pence: savingsPence,
      provider_message_id: null,
      error_message: message,
      sent_at: null,
    });

    return 'failed';
  }
}

export async function monitorTrackedPurchase(
  supabase: SupabaseClient,
  purchase: TrackedPurchaseForCheck,
  userEmail: string | null,
  now = new Date(),
): Promise<MonitoredPurchaseOutcome> {
  const check = await performPriceCheck(supabase, purchase, 'daily');
  if (!check.ok)
    return { check: 'failed', alert: 'not_eligible', error: check.error };

  if (!userEmail) return { check: 'succeeded', alert: 'missing_email' };
  if (check.snapshot.price.currency !== purchase.currency) {
    return { check: 'succeeded', alert: 'not_eligible' };
  }

  const eligible = isPriceDropAlertEligible(
    {
      purchasePricePence: purchase.purchase_price_pence,
      currentPricePence: check.snapshot.price.amountMinor,
      currency: check.snapshot.price.currency,
      inStock: check.snapshot.inStock,
      returnDeadline: purchase.return_deadline,
    },
    now,
  );
  if (!eligible) return { check: 'succeeded', alert: 'not_eligible' };

  const alert = await sendPriceDropAlert(
    supabase,
    purchase,
    check.snapshot,
    userEmail,
  );
  return { check: 'succeeded', alert };
}

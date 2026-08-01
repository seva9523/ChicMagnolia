type AccountIdentity = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

type SubscriptionInput = Record<string, unknown> | null;

export type AccountExportInput = {
  exportedAt: string;
  account: AccountIdentity;
  profile: Record<string, unknown> | null;
  legalAcceptances: unknown[];
  purchases: unknown[];
  priceChecks: unknown[];
  notifications: unknown[];
  subscription: SubscriptionInput;
};

function publicSubscription(subscription: SubscriptionInput) {
  if (!subscription) return null;

  return {
    status: subscription.status ?? null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    current_period_start: subscription.current_period_start ?? null,
    current_period_end: subscription.current_period_end ?? null,
    trial_end: subscription.trial_end ?? null,
    ended_at: subscription.ended_at ?? null,
    created_at: subscription.created_at ?? null,
    updated_at: subscription.updated_at ?? null,
  };
}

export function buildAccountExport(input: AccountExportInput) {
  return {
    format_version: 1,
    exported_at: input.exportedAt,
    account: {
      id: input.account.id,
      email: input.account.email,
      created_at: input.account.createdAt,
      last_sign_in_at: input.account.lastSignInAt,
    },
    profile: input.profile,
    legal_acceptances: input.legalAcceptances,
    tracked_purchases: input.purchases,
    price_checks: input.priceChecks,
    notification_history: input.notifications,
    subscription: publicSubscription(input.subscription),
  };
}

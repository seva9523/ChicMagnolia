-- A signed Stripe event can arrive after the corresponding auth user has been deleted.
-- Treat that event as a successful no-op instead of attempting an insert that violates
-- subscriptions_user_id_fkey. The application webhook performs the same guard; this
-- database check is defense in depth for retries, older deployments and future callers.
create or replace function public.sync_stripe_subscription(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_trial_end timestamptz,
  p_ended_at timestamptz,
  p_event_created bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in (
    'inactive',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
  ) then
    raise exception 'Unsupported Stripe subscription status: %', p_status;
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_user_id
  ) then
    return false;
  end if;

  insert into public.subscriptions (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    status,
    cancel_at_period_end,
    current_period_start,
    current_period_end,
    trial_end,
    ended_at,
    last_event_created
  )
  values (
    p_user_id,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_price_id,
    p_status,
    p_cancel_at_period_end,
    p_current_period_start,
    p_current_period_end,
    p_trial_end,
    p_ended_at,
    p_event_created
  )
  on conflict (user_id) do update
  set
    stripe_customer_id = coalesce(excluded.stripe_customer_id, subscriptions.stripe_customer_id),
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_end = excluded.trial_end,
    ended_at = excluded.ended_at,
    last_event_created = excluded.last_event_created,
    updated_at = now()
  where subscriptions.last_event_created <= excluded.last_event_created;

  return found;
end;
$$;

revoke all on function public.sync_stripe_subscription(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  bigint
) from public, anon, authenticated;

grant execute on function public.sync_stripe_subscription(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  bigint
) to service_role;

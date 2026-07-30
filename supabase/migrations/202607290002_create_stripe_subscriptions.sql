create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive'
    check (status in (
      'inactive',
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )),
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  ended_at timestamptz,
  last_event_created bigint not null default 0 check (last_event_created >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_status_idx
  on public.subscriptions(status);

create index if not exists subscriptions_customer_idx
  on public.subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

alter table public.subscriptions enable row level security;

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription"
on public.subscriptions
for select
using (auth.uid() = user_id);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  event_created bigint not null check (event_created >= 0),
  processing_status text not null default 'processing'
    check (processing_status in ('processing', 'processed', 'failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_event_state check (
    (processing_status = 'processed' and processed_at is not null and error_message is null)
    or (processing_status = 'failed' and processed_at is null and error_message is not null)
    or (processing_status = 'processing' and processed_at is null)
  )
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events(processing_status, updated_at);

alter table public.stripe_webhook_events enable row level security;

-- No browser-facing policies are created. Only the service role may read or write
-- Stripe webhook processing records.

drop trigger if exists stripe_webhook_events_set_updated_at on public.stripe_webhook_events;
create trigger stripe_webhook_events_set_updated_at
before update on public.stripe_webhook_events
for each row execute procedure public.set_updated_at();

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

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.tracked_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null default 'price_drop'
    check (notification_type in ('price_drop')),
  channel text not null default 'email'
    check (channel in ('email')),
  status text not null
    check (status in ('sent', 'failed')),
  purchase_price_pence integer not null check (purchase_price_pence > 0),
  current_price_pence integer not null check (current_price_pence > 0),
  savings_pence integer not null check (savings_pence > 0),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_history_status_details check (
    (status = 'sent' and sent_at is not null and error_message is null)
    or (status = 'failed' and error_message is not null)
  )
);

create index if not exists notification_history_user_created_idx
  on public.notification_history(user_id, created_at desc);

create index if not exists notification_history_purchase_created_idx
  on public.notification_history(purchase_id, created_at desc);

create unique index if not exists notification_history_sent_price_unique
  on public.notification_history(purchase_id, notification_type, current_price_pence)
  where status = 'sent';

alter table public.notification_history enable row level security;

drop policy if exists "Users can view their own notification history"
  on public.notification_history;
create policy "Users can view their own notification history"
on public.notification_history
for select
using (auth.uid() = user_id);

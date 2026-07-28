alter table public.tracked_purchases
  add column if not exists current_price_pence integer,
  add column if not exists current_in_stock boolean,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_check_error text;

create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.tracked_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_pence integer,
  currency text not null default 'GBP',
  in_stock boolean,
  checked_at timestamptz not null default now(),
  error_message text,
  constraint price_checks_result_present check (
    price_pence is not null or error_message is not null
  )
);

create index if not exists price_checks_purchase_checked_idx
  on public.price_checks(purchase_id, checked_at desc);

create index if not exists price_checks_user_idx
  on public.price_checks(user_id);

alter table public.price_checks enable row level security;

drop policy if exists "Users can view their own price checks" on public.price_checks;
create policy "Users can view their own price checks"
on public.price_checks
for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own price checks" on public.price_checks;
create policy "Users can create their own price checks"
on public.price_checks
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.tracked_purchases
    where tracked_purchases.id = purchase_id
      and tracked_purchases.user_id = auth.uid()
  )
);

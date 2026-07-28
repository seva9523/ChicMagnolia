create table if not exists public.tracked_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  retailer_name text not null,
  product_name text not null,
  product_url text not null,
  purchase_price_pence integer not null check (purchase_price_pence > 0),
  currency text not null default 'GBP' check (currency = 'GBP'),
  purchase_date date not null,
  return_deadline date not null,
  size text,
  colour text,
  status text not null default 'tracking'
    check (status in ('tracking', 'returned', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_deadline_not_before_purchase
    check (return_deadline >= purchase_date)
);

create index if not exists tracked_purchases_user_id_idx
on public.tracked_purchases(user_id);

create index if not exists tracked_purchases_status_idx
on public.tracked_purchases(status);

alter table public.tracked_purchases enable row level security;

drop policy if exists "Users can view their own purchases" on public.tracked_purchases;
create policy "Users can view their own purchases"
on public.tracked_purchases for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own purchases" on public.tracked_purchases;
create policy "Users can create their own purchases"
on public.tracked_purchases for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own purchases" on public.tracked_purchases;
create policy "Users can update their own purchases"
on public.tracked_purchases for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own purchases" on public.tracked_purchases;
create policy "Users can delete their own purchases"
on public.tracked_purchases for delete
using (auth.uid() = user_id);

drop trigger if exists tracked_purchases_set_updated_at on public.tracked_purchases;
create trigger tracked_purchases_set_updated_at
before update on public.tracked_purchases
for each row execute procedure public.set_updated_at();
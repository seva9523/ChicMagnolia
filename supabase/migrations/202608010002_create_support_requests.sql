create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 320),
  email_normalized text not null check (email_normalized = lower(email_normalized)),
  topic text not null check (topic in (
    'account_access',
    'billing',
    'retailer_check',
    'privacy_request',
    'security_report',
    'other'
  )),
  message text not null check (char_length(message) between 20 and 5000),
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'spam')),
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_email_created_idx
  on public.support_requests(email_normalized, created_at desc);

create index if not exists support_requests_status_created_idx
  on public.support_requests(status, created_at desc);

alter table public.support_requests enable row level security;

-- No browser-facing policies are created. Public and authenticated visitors submit
-- through the validated server action; only the service role can read or mutate the
-- support queue. User deletion deliberately sets user_id to null so an existing support
-- or privacy request is not silently destroyed while it is still being handled.

drop trigger if exists support_requests_set_updated_at on public.support_requests;
create trigger support_requests_set_updated_at
before update on public.support_requests
for each row execute procedure public.set_updated_at();

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  source text not null default 'sign_up'
    check (source in ('sign_up', 'settings')),
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

create index if not exists legal_acceptances_user_accepted_idx
  on public.legal_acceptances(user_id, accepted_at desc);

alter table public.legal_acceptances enable row level security;

drop policy if exists "Users can view their own legal acceptances"
  on public.legal_acceptances;
create policy "Users can view their own legal acceptances"
on public.legal_acceptances
for select
using (auth.uid() = user_id);

-- Browser roles intentionally receive no insert, update or delete policy. Acceptance
-- records are created by the trusted auth trigger so users cannot rewrite the audit trail.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_terms_version text;
  accepted_privacy_version text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  accepted_terms_version := nullif(new.raw_user_meta_data ->> 'terms_version', '');
  accepted_privacy_version := nullif(new.raw_user_meta_data ->> 'privacy_version', '');

  if coalesce(new.raw_user_meta_data ->> 'legal_accepted', 'false') = 'true'
    and accepted_terms_version is not null
    and accepted_privacy_version is not null then
    insert into public.legal_acceptances (
      user_id,
      terms_version,
      privacy_version,
      source
    )
    values (
      new.id,
      accepted_terms_version,
      accepted_privacy_version,
      'sign_up'
    )
    on conflict (user_id, terms_version, privacy_version) do nothing;
  end if;

  return new;
end;
$$;

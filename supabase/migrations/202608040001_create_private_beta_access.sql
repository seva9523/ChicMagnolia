create table if not exists public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_email text
    check (
      invited_email is null
      or invited_email = lower(btrim(invited_email))
    ),
  expires_at timestamptz not null,
  grant_expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint beta_invites_expiry_after_creation
    check (expires_at > created_at),
  constraint beta_invites_grant_expiry_after_creation
    check (grant_expires_at is null or grant_expires_at > created_at),
  constraint beta_invites_redemption_state
    check (
      (redeemed_at is null and redeemed_by is null)
      or redeemed_at is not null
    )
);

create index if not exists beta_invites_available_idx
  on public.beta_invites(expires_at)
  where redeemed_at is null and revoked_at is null;

alter table public.beta_invites enable row level security;

-- No browser-facing policies are created. Invitation tokens are hashed and only
-- the service role may inspect, create, redeem or revoke invitations.

create table if not exists public.beta_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  invite_id uuid not null unique references public.beta_invites(id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beta_access_expiry_after_start
    check (expires_at is null or expires_at > starts_at),
  constraint beta_access_revocation_after_start
    check (revoked_at is null or revoked_at >= starts_at)
);

create index if not exists beta_access_grants_active_idx
  on public.beta_access_grants(user_id, expires_at)
  where revoked_at is null;

alter table public.beta_access_grants enable row level security;

drop policy if exists "Users can view their own beta access"
  on public.beta_access_grants;
create policy "Users can view their own beta access"
on public.beta_access_grants
for select
using ((select auth.uid()) = user_id);

-- Browser roles intentionally receive no insert, update or delete policy. Beta
-- access is granted and revoked only through trusted server-side operations.

drop trigger if exists beta_access_grants_set_updated_at
  on public.beta_access_grants;
create trigger beta_access_grants_set_updated_at
before update on public.beta_access_grants
for each row execute procedure public.set_updated_at();

create or replace function public.redeem_beta_invite(
  p_token_hash text,
  p_user_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invite_record public.beta_invites%rowtype;
  authenticated_email text;
  submitted_email text;
  grant_id uuid;
begin
  if p_token_hash is null
    or lower(p_token_hash) !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid private beta invitation.'
      using errcode = '22023';
  end if;

  submitted_email := nullif(lower(btrim(p_email)), '');

  select lower(btrim(email))
  into authenticated_email
  from auth.users
  where id = p_user_id;

  if authenticated_email is null
    or submitted_email is null
    or authenticated_email <> submitted_email then
    raise exception 'The account email does not match the invitation.'
      using errcode = '22023';
  end if;

  select *
  into invite_record
  from public.beta_invites
  where token_hash = lower(p_token_hash)
  for update;

  if not found
    or invite_record.revoked_at is not null
    or invite_record.redeemed_at is not null
    or invite_record.expires_at <= now()
    or (
      invite_record.grant_expires_at is not null
      and invite_record.grant_expires_at <= now()
    ) then
    raise exception 'This private beta invitation is invalid or unavailable.'
      using errcode = '22023';
  end if;

  if invite_record.invited_email is not null
    and invite_record.invited_email <> authenticated_email then
    raise exception 'Use the email address that received this invitation.'
      using errcode = '22023';
  end if;

  insert into public.beta_access_grants (
    user_id,
    invite_id,
    starts_at,
    expires_at
  )
  values (
    p_user_id,
    invite_record.id,
    now(),
    invite_record.grant_expires_at
  )
  returning id into grant_id;

  update public.beta_invites
  set
    redeemed_at = now(),
    redeemed_by = p_user_id,
    invited_email = null
  where id = invite_record.id;

  return grant_id;
end;
$$;

revoke all on function public.redeem_beta_invite(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.redeem_beta_invite(text, uuid, text)
  to service_role;

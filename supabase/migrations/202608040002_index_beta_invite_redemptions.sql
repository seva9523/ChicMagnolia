create index if not exists beta_invites_redeemed_by_idx
  on public.beta_invites(redeemed_by)
  where redeemed_by is not null;

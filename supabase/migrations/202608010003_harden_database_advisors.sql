-- Keep internal trigger functions out of the exposed PostgREST RPC surface.
-- Their owning role can still execute them, and existing database triggers continue
-- to invoke them without granting browser-facing roles direct EXECUTE access.
alter function public.set_updated_at()
  set search_path = pg_catalog;

revoke execute on function public.set_updated_at()
  from public, anon, authenticated, service_role;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- Cache auth.uid() once per statement instead of evaluating it for every candidate
-- row. This preserves the existing ownership rules while avoiding RLS init-plan
-- warnings and unnecessary work as the private beta grows.
alter policy "Users can view their own profile"
  on public.profiles
  using ((select auth.uid()) = id);

alter policy "Users can update their own profile"
  on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "Users can view their own purchases"
  on public.tracked_purchases
  using ((select auth.uid()) = user_id);

alter policy "Users can create their own purchases"
  on public.tracked_purchases
  with check ((select auth.uid()) = user_id);

alter policy "Users can update their own purchases"
  on public.tracked_purchases
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete their own purchases"
  on public.tracked_purchases
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own price checks"
  on public.price_checks
  using ((select auth.uid()) = user_id);

alter policy "Users can create their own price checks"
  on public.price_checks
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.tracked_purchases
      where tracked_purchases.id = price_checks.purchase_id
        and tracked_purchases.user_id = (select auth.uid())
    )
  );

alter policy "Users can view their own notification history"
  on public.notification_history
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own subscription"
  on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "Users can view their own legal acceptances"
  on public.legal_acceptances
  using ((select auth.uid()) = user_id);

-- Support records retain their optional account link after a request is created.
-- Indexing that foreign key avoids a table scan when an auth user is deleted and
-- PostgreSQL applies ON DELETE SET NULL.
create index if not exists support_requests_user_id_idx
  on public.support_requests(user_id);

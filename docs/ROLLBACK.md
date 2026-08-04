# Chic Magnolia rollback procedure

Use this procedure when a production merge, deployment, migration or provider change causes
material user impact. Keep Stripe in sandbox mode until the separate live-launch checklist is
approved.

## 1. Stabilise first

1. Stop making unrelated changes.
2. Record the incident start time, affected feature, current Git commit, Vercel deployment ID
   and any relevant Stripe, Supabase or Resend event IDs.
3. Preserve logs and screenshots, but never copy passwords, API keys, full card data, session
   cookies or raw retailer HTML into an issue or support request.
4. Decide whether the problem is limited to presentation, application code, a retailer
   adapter, a scheduled job, database state or an external provider.
5. Prefer the smallest reversible action that stops further harm.

## 2. Application rollback in Vercel

Use this when the previous production deployment was healthy and the failure is caused by a
new application build.

1. Open the Chic Magnolia Vercel project and select **Deployments**.
2. Identify the most recent known-good production deployment. Confirm its Git commit before
   promoting it.
3. Use Vercel's rollback or promote action to restore that deployment to the production
   aliases.
4. Verify all of the following:
   - `https://www.chicmagnolia.com/api/health` returns HTTP 200;
   - `/login`, `/dashboard`, `/privacy`, `/terms` and `/support` open correctly;
   - the expected security headers remain present;
   - Stripe Checkout is still in sandbox mode;
   - the daily-monitoring endpoint still rejects missing and incorrect bearer tokens.
5. Create a GitHub repair branch from `main`, revert or fix the faulty merge, run the full CI
   suite and merge through a pull request. Do not force-push `main`.

Baseline recorded on 1 August 2026 before this operations-hardening block:

```text
Git commit: 1a59b1d24701fe68a0afd947eb8a9af4e91b03cc
Vercel deployment: dpl_2YQDZWJWzWzRXqEMvBc9H4Rh6PLe
```

Replace this baseline in the incident notes with the latest known-good production deployment
at the time of an incident.

## 3. Database rollback and recovery

Database migrations are applied independently from Vercel deployments. Rolling back the app
does not undo a Supabase schema change.

1. Pause the application path that writes affected data when continued writes could make the
   incident worse.
2. Export or query the affected rows before changing them.
3. Prefer a new forward migration that restores compatibility. Do not edit an already-applied
   migration file and assume production changed with it.
4. For additive changes, leave the new table or column in place until the repaired application
   is deployed, then remove it only through a separately reviewed migration when safe.
5. For destructive or corrupting changes, use the Supabase backup or point-in-time recovery
   option available to the project. Confirm the restore point and expected data loss window
   before proceeding.
6. Re-run Row Level Security checks after any recovery. A restored table must not become
   browser-readable by accident.

Current sensitive tables and expected ownership rules include:

- `profiles`, `tracked_purchases`, `price_checks`, `notification_history`, `subscriptions` and
  `legal_acceptances`: user-owned with RLS and user deletion cascades;
- `support_requests`: service-role-only, RLS enabled with no browser policy, and its optional
  `user_id` becomes null when an account is deleted;
- `stripe_webhook_events`: service-role-only idempotency and processing history.

Never drop one of these tables during an incident without a verified export or restore plan.

## 4. Stripe incident rollback

1. Confirm the Stripe dashboard is in **Sandbox** before changing test configuration.
2. If webhook processing is causing bad writes, temporarily disable only the affected sandbox
   endpoint or event type. Do not delete production/live configuration as a shortcut.
3. Restore the last known-good application deployment or webhook code.
4. Re-enable the exact event list used by Chic Magnolia:
   - `checkout.session.completed`;
   - `customer.subscription.created`;
   - `customer.subscription.updated`;
   - `customer.subscription.deleted`;
   - `customer.subscription.paused`;
   - `customer.subscription.resumed`;
   - `invoice.paid`;
   - `invoice.payment_succeeded`;
   - `invoice.payment_failed`;
   - `invoice.payment_action_required`.
5. Replay only the required signed sandbox events after confirming idempotency records and user
   mappings. A delayed event for a deleted user must be processed as a successful no-op.
6. Rotate a webhook secret only when it is compromised or the endpoint is intentionally
   replaced. Update Vercel and redeploy before resuming delivery.

Never mix sandbox keys, price IDs or webhook secrets with live resources.

## 5. Resend and support rollback

1. If the support automation sends incorrect or repeated messages, disable the
   `Chic Magnolia support request notifications` automation.
2. Keep the support form available when storage is healthy. Requests are written to
   `support_requests` before notification, so failed notifications can be recovered.
3. Query rows where `notification_status = 'failed'`, fix the template or automation, then
   resend deliberately and mark the record accurately.
4. If sending-domain authentication fails, keep the stored queue and restore the verified
   `notify.chicmagnolia.com` SPF/DKIM configuration before retrying.
5. Do not expose a personal founder email address on the public site as a temporary fix.

## 6. Daily monitoring rollback

1. Disable the **Daily price monitoring** workflow temporarily if scheduled checks are causing
   repeated bad writes, excessive provider spend or user-facing false alerts.
2. Do not delete the cron secret. Preserve it unless compromise is suspected.
3. Pause only the failing retailer adapter when possible; keep healthy retailers available.
4. Repair the parser, add a regression test using the observed page structure, run a manual
   production check and then re-enable the workflow.
5. Confirm the workflow's authentication preflight passes before processing real batches.

## 7. Recovery validation

Before declaring recovery complete:

- run format, lint, typecheck, tests and production build;
- confirm Vercel production is `READY`;
- confirm `/api/health` returns 200;
- test signup confirmation and password recovery if auth changed;
- verify one safe retailer price check if monitoring changed;
- verify Stripe sandbox webhook delivery if billing changed;
- verify one support request is stored and notified if support changed;
- check Supabase for failed webhook, support-notification or price-check records;
- document the root cause and the permanent regression test.

## 8. Post-incident follow-up

Within one working day, record:

- user impact and duration;
- exact root cause;
- rollback or repair actions;
- any data correction performed;
- credentials rotated;
- monitoring or tests added;
- whether affected users need a direct explanation.

Do not enable Stripe live mode or public paid acquisition merely because the application has
recovered. Those remain explicit founder decisions after legal and operational review.

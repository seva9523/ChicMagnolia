# ChicMagnolia private beta launch checklist

This checklist is for the first private cohort. It deliberately excludes growth features and
Stripe live-mode activation until the legal, operational and support steps are complete.

## 1. Legal and privacy

- [ ] Confirm the final operator/controller identity and update the Privacy notice and Terms
      if ChicMagnolia is incorporated or begins trading under a different legal name.
- [ ] Review the Privacy notice and Terms with a qualified UK adviser before a public paid
      launch.
- [x] Apply `supabase/migrations/202607310001_create_legal_acceptances.sql`.
- [x] Apply `supabase/migrations/202608010002_create_support_requests.sql`.
- [x] Create a fresh account after the legal migration and confirm a `legal_acceptances` row
      is recorded with the current Terms and Privacy versions.
- [x] Confirm the Privacy and Terms links are visible on the homepage and sign-up form.
- [x] Confirm authenticated users can download their JSON account export without internal
      Stripe identifiers or payment data.
- [x] Test account deletion with a disposable Stripe test customer and verify:
  - the Stripe test customer is deleted;
  - the test subscription is ended;
  - the Supabase auth user is deleted;
  - profile, purchases, checks, notifications, legal acceptances and subscription state are
    removed by cascade;
  - later signed Stripe events are acknowledged without recreating the deleted user.
- [x] Confirm deleting an account removes the support request's user link without silently
      deleting an unresolved support or privacy request.

## 2. Security

- [ ] Confirm all production secrets exist only in Vercel or GitHub secret storage.
- [ ] Rotate any credential that has ever appeared in a terminal recording, screenshot,
      support message or temporary file.
- [ ] Review Supabase Row Level Security policies from a second non-owner account.
- [x] Verify the service-role key is never exposed in browser bundles or public environment
      variables.
- [x] In Supabase Authentication → URL Configuration, set the Site URL to the canonical
      production origin and add these allowed redirect patterns:
  - `http://localhost:3000/**`;
  - `https://*-seva9523s-projects.vercel.app/**`;
  - the exact production `/auth/callback` URL for `chicmagnolia.com`,
    `www.chicmagnolia.com` and the Vercel production alias in use.
- [x] Create a disposable account from a Vercel Preview URL and confirm the email link returns
      to the same Preview origin, establishes the session and opens the dashboard without an
      erroneous confirmation failure.
- [x] Request a password reset from Preview and confirm the email link opens a secure reset
      session on the same initiating origin.
- [x] Confirm Stripe webhook signature verification rejects an invalid signature.
- [ ] Confirm the cron endpoint rejects missing or incorrect bearer tokens in production.
- [x] Confirm account export and dashboard routes redirect or return 401 when signed out.
- [x] Check the production security headers.
- [x] Configure weekly Dependabot updates for npm and GitHub Actions dependencies.
- [x] Configure CodeQL analysis for JavaScript and TypeScript on pull requests, `main` and a
      weekly schedule.
- [ ] Confirm GitHub secret scanning and push protection settings in the repository Security
      tab.
- [x] Route private security reports through the monitored support form.

## 3. Billing

- [x] Keep Stripe in test mode while completing this checklist.
- [x] Confirm Checkout, webhook sync, Customer Portal and cancel-at-period-end behaviour in
      test mode.
- [x] Confirm account deletion uses immediate Stripe customer deletion rather than
      cancel-at-period-end.
- [x] Confirm delayed signed subscription events for a missing user are processed as a no-op
      and do not recreate a subscription row.
- [x] Restrict the production webhook endpoint to the exact event types used by the app.
- [x] Confirm the £4.99 price, renewal language and cancellation route are visible before
      Checkout.
- [ ] Before live mode, create separate live product, price, webhook and portal settings.
- [x] Never mix test and live keys, price IDs or webhook secrets.
- [ ] Review UK consumer subscription and cooling-off obligations immediately before live
      payments are enabled.

## 4. Email and support

- [x] Verify the Resend sending domain and SPF/DKIM records.
- [x] Configure Supabase Auth SMTP with `auth@notify.chicmagnolia.com`.
- [x] Test signup confirmation and password-recovery delivery through Resend.
- [x] Deploy the public support form with validation, honeypot and per-email rate limiting.
- [x] Store support requests in a service-role-only Supabase queue before notification.
- [x] Confirm the `support.requested` Resend automation delivers to the monitored founder
      inbox without publishing a personal email address.
- [x] Confirm notification failure does not discard the stored support request.
- [x] Test one successful price-drop email and one suppressed duplicate alert.
- [x] Prepare founder support replies for retailer failures, billing access, account deletion,
      authentication, privacy requests and security reports in `docs/SUPPORT_PLAYBOOK.md`.
- [x] Do not include full product-page HTML, credentials or payment data in support tickets.

## 5. Monitoring and retailer quality

- [x] Run a production smoke test for Zara, Mango, Next, ASOS, UNIQLO, H&M and COS.
- [x] For each retailer, test an available and unavailable saved size where possible.
- [x] Confirm sale prices are used instead of original, crossed-out or historical prices.
- [x] Confirm no retailer borrows another colour or size's price or stock.
- [ ] Trigger the GitHub daily workflow manually and confirm its authentication preflight and
      all due batches finish without a Vercel timeout after the operations-hardening merge.
- [ ] Review Oxylabs and Browserless usage limits and set spend alerts.
- [x] Define the response: pause the failing adapter, display a clear error, repair the parser
      and add a regression test before re-enabling it.

## 6. Production and recovery

- [x] Confirm `chicmagnolia.com`, `www.chicmagnolia.com` and the Vercel production alias use
      HTTPS.
- [x] Confirm `/api/health`, `/robots.txt` and `/sitemap.xml` return successfully.
- [x] Confirm Preview and Production use the intended Supabase and Stripe test projects.
- [ ] Verify Supabase backup and point-in-time recovery options appropriate to the beta.
- [x] Record the last known-good Vercel deployment before inviting users.
- [x] Document application, database, Stripe, Resend and monitoring rollback steps in
      `docs/ROLLBACK.md`.
- [x] Avoid destructive database changes without a tested rollback or export.

## 7. Cohort launch

- [ ] Invite no more users than the founder can support directly.
- [ ] Give beta users a clear statement that retailer integrations may occasionally fail.
- [ ] Ask users to report the product URL, saved colour, saved size, expected result and actual
      result without sharing credentials.
- [ ] Review failed price checks, support notifications, email failures and Stripe webhook
      failures daily during the first two weeks.
- [ ] Collect feedback on whether alerts caused useful action, not only whether a scraper ran.
- [ ] Do not enable Stripe live mode or public acquisition until the legal and operational
      checklist is signed off.

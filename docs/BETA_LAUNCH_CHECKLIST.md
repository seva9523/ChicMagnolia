# ChicMagnolia private beta launch checklist

This checklist is for the first private cohort. It deliberately excludes growth features and
Stripe live-mode activation until the legal, operational and support steps are complete.

## 1. Legal and privacy

- [ ] Confirm the final operator/controller identity and update the Privacy notice and Terms
      if ChicMagnolia is incorporated or begins trading under a different legal name.
- [ ] Create or forward `support@chicmagnolia.com` and test inbound delivery.
- [ ] Review the Privacy notice and Terms with a qualified UK adviser before a public paid
      launch.
- [ ] Apply `supabase/migrations/202607310001_create_legal_acceptances.sql`.
- [ ] Create a fresh account after the migration and confirm a `legal_acceptances` row is
      recorded with the current Terms and Privacy versions.
- [ ] Confirm the Privacy and Terms links are visible on the homepage and sign-up form.
- [ ] Confirm authenticated users can download their JSON account export.
- [ ] Test account deletion with a disposable Stripe test customer and verify:
  - the Stripe test customer is deleted;
  - the test subscription is ended;
  - the Supabase auth user is deleted;
  - profile, purchases, checks, notifications, legal acceptances and subscription state are
    removed by cascade;
  - later Stripe webhook events are acknowledged without recreating the deleted user.

## 2. Security

- [ ] Confirm all production secrets exist only in Vercel or GitHub secret storage.
- [ ] Rotate any credential that has ever appeared in a terminal recording, screenshot,
      support message or temporary file.
- [ ] Review Supabase Row Level Security policies from a second non-owner account.
- [ ] Verify the service-role key is never exposed in browser bundles or public environment
      variables.
- [ ] In Supabase Authentication → URL Configuration, set the Site URL to the canonical
      production origin and add these allowed redirect patterns:
  - `http://localhost:3000/**`;
  - `https://*-seva9523s-projects.vercel.app/**`;
  - the exact production `/auth/callback` URL for `chicmagnolia.com`,
    `www.chicmagnolia.com` and the Vercel production alias in use.
- [ ] Create a disposable account from a Vercel Preview URL and confirm the email link returns
      to the same Preview origin, establishes the session and opens the dashboard without an
      erroneous confirmation failure.
- [ ] Request a password reset from Preview and Production and confirm each email link opens a
      secure reset session on the same initiating origin.
- [ ] Confirm Stripe webhook signature verification rejects an invalid signature.
- [ ] Confirm the cron endpoint rejects missing or incorrect bearer tokens.
- [ ] Confirm account export and dashboard routes redirect or return 401 when signed out.
- [ ] Check the production security headers in the browser network panel.
- [ ] Enable GitHub dependency and secret scanning for the repository.
- [ ] Document who will respond to security reports and account-access incidents.

## 3. Billing

- [ ] Keep Stripe in test mode while completing this checklist.
- [ ] Confirm Checkout, webhook sync, Customer Portal and cancel-at-period-end behaviour in
      test mode.
- [ ] Confirm account deletion uses immediate Stripe customer deletion rather than
      cancel-at-period-end.
- [ ] Confirm the £4.99 price, renewal language and cancellation route are visible before
      Checkout.
- [ ] Before live mode, create separate live product, price, webhook and portal settings.
- [ ] Never mix test and live keys, price IDs or webhook secrets.
- [ ] Review UK consumer subscription and cooling-off obligations immediately before live
      payments are enabled.

## 4. Email and support

- [ ] Verify the Resend sending domain and SPF/DKIM records.
- [ ] Test one successful price-drop email and one suppressed duplicate alert.
- [ ] Confirm replies and support messages reach a monitored mailbox.
- [ ] Prepare short support replies for failed retailer checks, billing access and account
      deletion.
- [ ] Do not include full product-page HTML, credentials or payment data in support tickets.

## 5. Monitoring and retailer quality

- [ ] Run a production smoke test for Zara, Mango, Next, ASOS, UNIQLO, H&M and COS.
- [ ] For each retailer, test one in-stock and one unavailable saved size where possible.
- [ ] Confirm sale prices are used instead of original, crossed-out or historical prices.
- [ ] Confirm no retailer borrows another colour or size's price or stock.
- [ ] Trigger the GitHub daily workflow manually and confirm all batches finish without a
      Vercel timeout.
- [ ] Review Oxylabs and Browserless usage limits and set spend alerts.
- [ ] Define the response: pause the failing adapter, display a clear error, repair the parser
      and add a regression test before re-enabling it.

## 6. Production and recovery

- [ ] Confirm `chicmagnolia.com`, `www.chicmagnolia.com` and the Vercel production alias use
      HTTPS.
- [ ] Confirm `/api/health`, `/robots.txt` and `/sitemap.xml` return successfully.
- [ ] Confirm Preview and Production use the intended Supabase and Stripe test projects.
- [ ] Verify Supabase backup and point-in-time recovery options appropriate to the beta.
- [ ] Record the last known-good Vercel deployment before inviting users.
- [ ] Prepare a rollback procedure for a broken merge or migration.
- [ ] Avoid destructive database changes without a tested rollback or export.

## 7. Cohort launch

- [ ] Invite no more users than the founder can support directly.
- [ ] Give beta users a clear statement that retailer integrations may occasionally fail.
- [ ] Ask users to report the product URL, saved colour, saved size, expected result and actual
      result without sharing credentials.
- [ ] Review failed price checks, email failures and Stripe webhook failures daily during the
      first two weeks.
- [ ] Collect feedback on whether alerts caused useful action, not only whether a scraper ran.
- [ ] Do not enable Stripe live mode or public acquisition until the legal and operational
      checklist is signed off.

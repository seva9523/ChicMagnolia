# Chic Magnolia private beta launch checklist

This checklist is for the first founder-supported cohort. It deliberately excludes referral
rewards, paid acquisition and Stripe live-mode activation until the product, legal, recovery and
operational gates are complete.

## 1. Legal and privacy

- [x] Confirm the current private-beta operator and data controller as Sevinj Ahmadova and
      identify her in the Privacy notice and Terms. Revisit this immediately if Chic Magnolia is
      incorporated or begins trading under a different legal identity.
- [ ] Review the Privacy notice and Terms with a qualified UK adviser before a public paid launch.
- [x] Apply `supabase/migrations/202607310001_create_legal_acceptances.sql`.
- [x] Apply `supabase/migrations/202608010002_create_support_requests.sql`.
- [x] Apply `supabase/migrations/202608010003_harden_database_advisors.sql`.
- [x] Apply `supabase/migrations/202608040001_create_private_beta_access.sql`.
- [x] Apply `supabase/migrations/202608040002_index_beta_invite_redemptions.sql`.
- [x] Version the Privacy notice and Terms for invitation and beta-access processing on
      4 August 2026.
- [x] Create a fresh account after the original legal migration and confirm a
      `legal_acceptances` row is recorded.
- [ ] Complete one end-to-end invited sign-up and confirm the new Terms and Privacy versions are
      recorded for that account.
- [x] Confirm Privacy and Terms links are visible on the homepage and invited sign-up form.
- [x] Confirm authenticated users can download a JSON account export without invitation tokens,
      invitation IDs, internal Stripe identifiers or payment data.
- [x] Test account deletion with a disposable Stripe test customer and verify the Stripe customer,
      subscription, Auth user and user-owned application rows are removed as designed.
- [x] Confirm deleting an Auth user cascades through `beta_access_grants`, while a redeemed
      invitation loses its user link and retains only non-personal redemption state.
- [x] Confirm deleting an account removes the support request's user link without silently
      deleting an unresolved support or privacy request.

## 2. Private beta invitations

- [x] Make direct sign-up invite-only.
- [x] Generate invitation tokens from 32 random bytes and store only SHA-256 hashes.
- [x] Bind invitations to a normalized email address and enforce single-use redemption.
- [x] Clear the invited email from the invitation record after successful redemption.
- [x] Keep `beta_invites` service-role-only with RLS enabled and no browser policy.
- [x] Allow signed-in users to read only their own `beta_access_grants` row, with no browser
      insert, update or delete policy.
- [x] Restrict `redeem_beta_invite` execution to `service_role`.
- [x] Roll back a newly created Auth user if invitation redemption or grant creation fails.
- [x] Validate in a rolled-back production transaction that email mismatch and invitation reuse
      are rejected and a valid redemption creates a grant.
- [x] Validate live RLS with owner, different authenticated and anonymous identities; cross-user
      and anonymous reads returned zero and browser updates affected zero rows.
- [x] Create the first personal test invitation.
- [ ] Complete the first real invitation → sign-up → email confirmation → dashboard flow.
- [ ] Confirm the redeemed invitation's `invited_email` is cleared and the account has one active
      beta access grant.
- [ ] Confirm the same link cannot create a second account.

## 3. Security

- [ ] Confirm all production secrets exist only in Vercel or GitHub secret storage.
- [ ] Rotate any credential that has ever appeared in a terminal recording, screenshot, support
      message or temporary file.
- [x] Exercise production RLS using a simulated second authenticated identity. It could read zero
      profile, purchase, price-check, notification, subscription or legal-acceptance rows, while
      the owner identity retained access to its own rows.
- [x] Verify the service-role key is never exposed in browser bundles or public environment
      variables.
- [x] Remove internal trigger functions from the browser-facing RPC surface, set a fixed function
      search path and clear the targeted Supabase Security Advisor findings.
- [x] Rewrite user-owned RLS policies to use statement-stable identity lookups and clear the
      targeted Supabase Performance Advisor warnings.
- [x] Configure canonical and Preview Auth redirect URLs.
- [x] Test confirmation and password-reset callbacks from a Vercel Preview origin.
- [x] Confirm Stripe webhook signature verification rejects an invalid signature.
- [x] Confirm the production cron endpoint returns HTTP 401 for missing and invalid bearer tokens.
- [x] Confirm account export and dashboard routes redirect or return 401 when signed out.
- [x] Check production security and private-route noindex headers.
- [x] Configure weekly Dependabot updates and weekly CodeQL analysis.
- [ ] Enable leaked-password protection in Supabase Authentication, or formally accept the
      limitation while the project remains on the Free plan.
- [x] Confirm GitHub secret scanning and push protection are enabled.
- [x] Route private security reports through the monitored support form.

## 4. Billing

- [x] Keep Stripe in test mode while completing this checklist.
- [x] Keep private-beta grants separate from Stripe subscription rows.
- [x] Hide test Checkout from users with active private-beta access.
- [x] Confirm Checkout, webhook sync, Customer Portal and cancel-at-period-end behaviour in test
      mode.
- [x] Confirm account deletion uses immediate Stripe customer deletion rather than
      cancel-at-period-end.
- [x] Confirm delayed signed subscription events for a missing user do not recreate a subscription
      row.
- [x] Restrict the production webhook endpoint to the exact event types used by the app.
- [x] Confirm the £4.99 price, renewal language and cancellation route are visible before test
      Checkout.
- [ ] Before live mode, create separate live product, price, webhook and portal settings.
- [x] Never mix test and live keys, price IDs or webhook secrets.
- [ ] Review UK consumer subscription and cooling-off obligations immediately before live payments
      are enabled.

## 5. Email and support

- [x] Verify the Resend sending domain and SPF/DKIM records.
- [x] Configure Supabase Auth SMTP with `auth@notify.chicmagnolia.com`.
- [x] Test signup confirmation and password-recovery delivery through Resend.
- [x] Deploy the public support form with validation, honeypot and per-email rate limiting.
- [x] Store support requests in a service-role-only Supabase queue before notification.
- [x] Confirm the `support.requested` Resend automation delivers to the monitored founder inbox.
- [x] Confirm notification failure does not discard the stored support request.
- [x] Test one successful price-drop email and one suppressed duplicate alert.
- [x] Prepare founder support replies in `docs/SUPPORT_PLAYBOOK.md`.
- [x] Do not include full product-page HTML, credentials or payment data in support tickets.

## 6. Monitoring and retailer quality

- [x] Run a production smoke test for Zara, Mango, Next, ASOS, UNIQLO, H&M and COS.
- [x] For each retailer, test an available and unavailable saved size where possible.
- [x] Confirm sale prices are used instead of original, crossed-out or historical prices.
- [x] Confirm no retailer borrows another colour or size's price or stock.
- [x] Include users with active private-beta access in scheduled monitoring without creating fake
      Stripe subscriptions.
- [x] Run the GitHub daily workflow against production and confirm the authenticated batch returns
      HTTP 2xx without a Vercel timeout.
- [ ] Review Oxylabs and Browserless usage limits and set spend alerts.
- [x] Define the retailer-failure response: pause the adapter, show a clear error, repair the parser
      and add a regression test before re-enabling it.

## 7. Production and recovery

- [x] Confirm `chicmagnolia.com`, `www.chicmagnolia.com` and the Vercel production alias use HTTPS.
- [x] Confirm `/api/health`, `/robots.txt` and `/sitemap.xml` return successfully.
- [x] Confirm Preview and Production use the intended Supabase and Stripe test projects.
- [x] Document the Supabase Free-plan backup strategy in `docs/BACKUP.md`.
- [x] Add a daily encrypted logical-backup workflow.
- [x] Generate and protect the offline age identity and configure the GitHub backup secrets.
- [x] Run the first configured encrypted backup.
- [x] Download the first artifact, verify its outer and inner checksums, decrypt it locally and
      confirm `roles.sql`, `schema.sql` and `data.sql` are readable.
- [ ] Complete a full restore drill. The local attempts currently stop on hosted-role
      `log_min_messages` compatibility; track this in GitHub issue #61 before live billing or broad
      public launch.
- [x] Confirm failed local restore attempts clean up the temporary database, containers and Docker
      network.
- [x] Record the last known-good Vercel deployment before inviting users.
- [x] Document application, database, Stripe, Resend and monitoring rollback steps.
- [x] Avoid destructive database changes without a tested rollback or export.

## 8. First cohort

- [ ] Complete the founder's end-to-end invitation test before sending a link to another person.
- [ ] Select 3–5 UK testers who regularly buy from the seven supported retailers.
- [ ] Give each tester a separate email-bound invitation link.
- [ ] Ask each tester to add at least two genuine eligible purchases.
- [ ] Give testers a clear statement that retailer integrations may occasionally fail.
- [ ] Ask users to report product URL, saved colour, saved size, expected result and actual result
      without sharing credentials.
- [ ] Review failed price checks, support notifications, email failures, invitation failures and
      Stripe webhook failures daily during the first two weeks.
- [ ] Measure activation, second-purchase creation, seven-day return and willingness to pay.
- [ ] Collect feedback on whether alerts caused useful action, not only whether a scraper ran.
- [ ] Do not add referral rewards until retention and live-billing readiness are demonstrated.
- [ ] Do not enable Stripe live mode, paid advertising or broad public acquisition until the legal,
      recovery and operational gates are signed off.

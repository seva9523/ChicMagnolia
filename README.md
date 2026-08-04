# Chic Magnolia

Chic Magnolia helps UK shoppers track fashion purchases during their return windows,
check the saved size and colour, and spot price drops while the item can still be
returned.

## Current MVP state

The repository currently includes:

- Supabase email authentication and protected dashboard routes
- manual purchase tracking with purchase price, date, return deadline, size, and colour
- returned and stopped-tracking statuses
- on-demand current-price and stock checks
- Zara UK, Mango UK, Next UK, ASOS UK, UNIQLO UK, H&M UK, and COS UK retailer adapters
- retailer-specific anti-bot fallbacks: ASOS uses one rendered UK Oxylabs request; H&M
  and COS use direct fetch followed by Oxylabs; UNIQLO and the earlier adapters retain
  their existing direct, Browserless, and Oxylabs routes
- current sale-price parsing with saved size and colour variant isolation
- ASOS `colourWayId` preservation for the exact saved colourway
- H&M exact-size offer availability and sale-price parsing
- COS exact-size item stock with regular and historical prices excluded from current price
- daily monitoring through GitHub Actions
- Resend email alerts when the saved item is cheaper, in stock, and still returnable
- notification history and duplicate-alert protection
- one £4.99 monthly Stripe plan through hosted Checkout
- signed, idempotent Stripe webhook subscription synchronisation
- Stripe Customer Portal billing and cancellation management
- server-side paid-access enforcement for purchase creation, manual checks, and scheduled
  monitoring
- public Privacy notice and Terms of service with versioned sign-up acknowledgement
- authenticated JSON account export without card data or internal Stripe identifiers
- self-service account deletion with immediate linked Stripe-customer deletion
- deletion-safe Stripe webhook processing that does not recreate removed users
- a public support form backed by a private Supabase queue and monitored Resend automation
- security headers, private-route robots rules and a public sitemap
- database privacy regression tests and a private beta launch checklist

Stripe remains in sandbox/test mode. Live-mode activation, final legal-entity details and
public acquisition are manual launch decisions rather than automatic code changes.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS and shadcn/ui
- Supabase Auth and PostgreSQL
- Resend
- Stripe Checkout, Billing, webhooks, and Customer Portal
- GitHub Actions
- Vercel
- Vitest

## Requirements

- Node.js 22
- npm 10 or newer
- a Supabase project
- a Vercel deployment
- an Oxylabs Web Scraper API account
- a verified Resend sender or domain
- an enabled Resend support-notification automation
- a Stripe account with test and live products

## Local setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/seva9523/ChicMagnolia.git
   cd ChicMagnolia
   npm install
   ```

2. Create the local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add development credentials to `.env.local`. Never commit this file.

4. Apply every SQL file in `supabase/migrations` to the Supabase project in filename
   order.

5. Start the application:

   ```bash
   npm run dev
   ```

6. Open `http://localhost:3000`. The health endpoint is available at
   `http://localhost:3000/api/health`.

## Environment variables

| Variable                        | Visibility  | Purpose                                               |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | Browser     | Canonical application URL                             |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser     | Supabase project URL                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser     | Supabase publishable key                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only | Background and privileged Supabase operations         |
| `BROWSERLESS_TOKEN`             | Server only | Browserless fallback access                           |
| `OXYLABS_USERNAME`              | Server only | Oxylabs Web Scraper API username                      |
| `OXYLABS_PASSWORD`              | Server only | Oxylabs Web Scraper API password                      |
| `RESEND_API_KEY`                | Server only | Resend API authentication                             |
| `EMAIL_FROM`                    | Server only | Verified sender address                               |
| `CRON_SECRET`                   | Server only | Bearer token protecting the daily-monitoring endpoint |
| `STRIPE_SECRET_KEY`             | Server only | Stripe test or live secret                            |
| `STRIPE_WEBHOOK_SECRET`         | Server only | Stripe endpoint signing secret                        |
| `STRIPE_PRICE_ID`               | Server only | Recurring GBP monthly price for the £4.99 plan        |

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Store
production values in Vercel project settings.

## Privacy and account lifecycle setup

Apply:

```text
supabase/migrations/202607310001_create_legal_acceptances.sql
supabase/migrations/202608010002_create_support_requests.sql
```

The legal-acceptance migration creates a read-only-to-users audit table and updates the
trusted new-user trigger. New sign-ups must tick the Terms and Privacy acknowledgement;
the trigger records the policy versions and server timestamp. Existing beta accounts can
continue to use the service, but the final public launch process should decide whether they
must accept a later version.

Authenticated users can open `/dashboard/settings` to:

- review account details and legal links;
- download a JSON export of user-owned application data;
- permanently delete the account.

Account export uses the signed-in Supabase client and Row Level Security. It includes
profile, legal acceptance, purchase, price-check, notification and non-sensitive
subscription state. It intentionally excludes card data, Stripe customer and subscription
IDs, price IDs and webhook internals.

Account deletion requires the authenticated email address. If a Stripe customer is linked,
Chic Magnolia first deletes the Stripe customer, immediately ending active subscriptions and
preventing future use of saved payment details. It then deletes the Supabase auth user;
foreign-key cascades remove the profile, purchases, price checks, notifications,
subscription state and legal acceptances. Stripe webhooks arriving after deletion are
acknowledged without recreating the user.

Support requests are intentionally different from user-owned dashboard records. They are
stored in a service-role-only queue with no browser-facing policy. When an account is
deleted, an existing support request keeps its reference and loses the user link rather
than being silently destroyed while it is being handled.

Replace the operator/controller description when the final legal entity or sole-trader
disclosure is confirmed. Review the legal copy with a qualified UK adviser before public
live billing.

## Support form setup

The public `/support` page accepts account, billing, retailer, privacy and security reports.
The server action validates the fields, uses a hidden honeypot, limits an email address to
three requests in 15 minutes and stores the request before attempting notification.

Notification uses the Resend custom event `support.requested`. The enabled automation sends
the published support-request template to the monitored founder contact identified by
`SUPPORT_NOTIFICATION_CONTACT_ID` in `src/services/support-requests.ts`. The contact ID is
not a credential; API access still requires the server-only `RESEND_API_KEY`.

If Resend notification fails, the request remains in `public.support_requests` with
`notification_status = 'failed'` so it can be recovered from Supabase rather than being
lost. Do not expose this table through a browser RLS policy.

## Stripe subscription setup

Chic Magnolia deliberately has one MVP plan: £4.99 GBP every month. Do not add coupons,
annual billing, or additional tiers.

1. In Stripe test mode, create a product named `ChicMagnolia Monthly` with one recurring
   monthly GBP price of `£4.99`.
2. Store its `price_...` ID as `STRIPE_PRICE_ID` and the matching test secret key as
   `STRIPE_SECRET_KEY` in Vercel Preview and Production while testing.
3. Apply `supabase/migrations/202607290002_create_stripe_subscriptions.sql` and
   `supabase/migrations/202608010001_harden_stripe_subscription_sync.sql`.
4. Register the production webhook endpoint:

   ```text
   https://your-production-domain/api/stripe/webhook
   ```

   Subscribe it to:

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`

5. Store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET` and redeploy.
6. Activate and configure the Stripe Customer Portal to allow payment-method updates,
   invoice history, and cancellation at period end.
7. Repeat the product, price, webhook and environment configuration in live mode only after
   the beta launch checklist is complete. Never mix test IDs with live keys.

The signed webhook is authoritative. Returning from Checkout only shows a pending
message and never grants access by itself. Active and trialing users can monitor.
Cancel-at-period-end users retain access until the recorded period end. Past-due,
unpaid, paused, incomplete, and canceled states retain read access to existing data but
cannot create purchases or run monitoring. The MVP limit is 10 active purchases per
subscriber.

## Retailer return deadlines

The purchase form stores the exact return deadline from the user's order rather than
recalculating it during each price check. This is important because retailer exceptions
can shorten the standard window. H&M UK currently states a 30-day return period for
full-price purchases and 14 days for sale items; users should therefore enter the date
shown for their specific order. COS UK uses a 30-day standard online return period.

## Daily monitoring setup

The scheduled workflow is `.github/workflows/daily-price-monitoring.yml`. It runs at
06:17 UTC and can also be started manually from GitHub Actions.

Create these GitHub repository secrets:

- `CHICMAGNOLIA_APP_URL`: the production URL, for example
  `https://chic-magnolia.vercel.app`
- `CHICMAGNOLIA_CRON_SECRET`: the same random value stored as `CRON_SECRET` in Vercel

Use a random `CRON_SECRET` of at least 24 characters. The workflow safely exits without
running when either GitHub secret is missing.

The endpoint checks three purchases per request to remain inside the Vercel request
limit. The workflow runs up to 50 batches, covering up to 150 due purchases each day.
Only users with active paid monitoring access are included. Scheduled retailer checks
use the fast rendered UK Oxylabs route immediately. ASOS reads the exact colourway,
current sale price, and selected-size stock from raw page state. UNIQLO reads its current
sale price and the selected size's hydrated strike state. H&M uses the exact saved size's
offer and availability. COS uses the exact saved size item from its product state and
ignores regular and lowest-historical reference prices.

An email is sent only when all of these conditions are true:

- the current price is below the recorded purchase price
- the selected item is in stock
- the return deadline has not passed
- the same purchase and current price have not already produced a successful alert

## Security and privacy controls

- user-owned tables use Supabase Row Level Security;
- support requests use a private service-role-only queue;
- server secrets remain in server-only environment variables;
- Stripe webhooks use the raw body and signature verification;
- account export is authenticated and marked `private, no-store`;
- analytics query strings and fragments are removed before transmission;
- Vercel Web Analytics is used for aggregated, cookie-free product analytics;
- security headers deny framing, MIME sniffing, camera, microphone and geolocation access;
- private dashboard, API and authentication routes are excluded from crawler indexing;
- `SECURITY.md` documents private vulnerability reporting through the monitored form.

The security controls reduce common risks but do not replace periodic review, dependency
updates, provider configuration and live RLS testing with separate accounts.

## Private beta launch

Use [`docs/BETA_LAUNCH_CHECKLIST.md`](docs/BETA_LAUNCH_CHECKLIST.md) before inviting users.
The checklist covers legal identity, support-form delivery, legal acceptance, account
export and deletion, Stripe test-mode verification, RLS, secrets, email delivery, retailer
smoke tests, monitoring spend, rollback and the first beta cohort.

Do not enable Stripe live mode or business verification as part of routine deployment.
Those are explicit founder decisions after the checklist and legal review are complete.

## Quality checks

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The CI workflow runs formatting, linting, type checking, tests and a production build for
pull requests and pushes to `main`.

## Project structure

```text
.github/workflows/       CI and daily scheduler
docs/                    Operational and beta-launch checklists
src/app/                 App Router pages, actions and route handlers
src/components/ui/       shadcn/ui components
src/integrations/        Stripe and Resend clients
src/lib/env/             Runtime environment validation
src/lib/supabase/        Browser, session and admin Supabase clients
src/retailers/           Retailer adapters and variant parsers
src/security/            Static database privacy regression tests
src/services/            Monitoring, billing, support, export and account lifecycle logic
supabase/migrations/     PostgreSQL schema changes
```

# ChicMagnolia

ChicMagnolia helps UK shoppers track fashion purchases during their return windows,
check the saved size and colour, and spot price drops while the item can still be
returned.

## Current MVP state

The repository currently includes:

- Supabase email authentication and protected dashboard routes
- manual purchase tracking with purchase price, date, return deadline, size, and colour
- returned and stopped-tracking statuses
- on-demand current-price and stock checks
- Zara UK, Mango UK, and Next UK retailer adapters
- Browserless and Oxylabs fallbacks for retailer anti-bot protection
- variant-aware stock checks
- daily monitoring through GitHub Actions
- Resend email alerts when the saved item is cheaper, in stock, and still returnable
- notification history and duplicate-alert protection

ASOS, Uniqlo, H&M, COS, subscriptions, and beta-launch controls remain later-sprint work.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS and shadcn/ui
- Supabase Auth and PostgreSQL
- Resend
- Stripe
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

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Browser | Canonical application URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Background and privileged Supabase operations |
| `BROWSERLESS_TOKEN` | Server only | Browserless fallback access |
| `OXYLABS_USERNAME` | Server only | Oxylabs Web Scraper API username |
| `OXYLABS_PASSWORD` | Server only | Oxylabs Web Scraper API password |
| `RESEND_API_KEY` | Server only | Resend API authentication |
| `EMAIL_FROM` | Server only | Verified sender address |
| `CRON_SECRET` | Server only | Bearer token protecting the daily-monitoring endpoint |
| `STRIPE_SECRET_KEY` | Server only | Stripe test or live secret |
| `STRIPE_WEBHOOK_SECRET` | Server only | Stripe webhook signature verification |

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Store
production values in Vercel project settings.

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

An email is sent only when all of these conditions are true:

- the current price is below the recorded purchase price
- the selected item is in stock
- the return deadline has not passed
- the same purchase and current price have not already produced a successful alert

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The CI workflow runs formatting, linting, type checking, tests, and a production build
for pull requests and pushes to `main`.

## Project structure

```text
.github/workflows/       CI and daily scheduler
src/app/                 App Router pages, actions, and route handlers
src/components/ui/       shadcn/ui components
src/integrations/        Stripe and Resend clients
src/lib/env/             Runtime environment validation
src/lib/supabase/        Browser, session, and admin Supabase clients
src/retailers/           Retailer adapters and variant parsers
src/services/            Monitoring and alert business logic
supabase/migrations/     PostgreSQL schema changes
```

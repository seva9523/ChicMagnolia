# ChicMagnolia

ChicMagnolia helps shoppers track eligible purchases and spot price drops before
their return windows close. This repository currently contains the Sprint 0
application foundation only.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS and shadcn/ui
- Supabase
- Stripe
- Resend
- Vitest

Authentication, subscriptions, retailer scrapers, alerts, and the customer
dashboard are intentionally outside Sprint 0.

## Requirements

- Node.js 22
- npm 10 or newer
- A Supabase project
- Stripe and Resend test credentials

## Local setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/seva9523/ChicMagnolia.git
   cd ChicMagnolia
   npm ci
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add test/development credentials to `.env.local`. Never commit this file.

4. Start the application:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). The health endpoint is
   available at [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Quality checks

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The CI workflow runs formatting, linting, type checking, tests, and a production
build for pull requests and pushes to `main`.

## Environment variables

| Variable                        | Visibility  | Purpose                               |
| ------------------------------- | ----------- | ------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | Browser     | Canonical application URL             |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser     | Supabase project URL                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser     | Supabase publishable/anon key         |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server only | Privileged Supabase operations        |
| `STRIPE_SECRET_KEY`             | Server only | Stripe test/live secret               |
| `STRIPE_WEBHOOK_SECRET`         | Server only | Stripe webhook signature verification |
| `RESEND_API_KEY`                | Server only | Resend API authentication             |
| `EMAIL_FROM`                    | Server only | Verified sender address               |

Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Store
production values in Vercel project settings and CI values in GitHub Actions
secrets.

## Project structure

```text
src/
  app/                  App Router pages and route handlers
  components/ui/        shadcn/ui components
  integrations/         Stripe and Resend server-only clients
  lib/env/              Runtime environment validation
  lib/supabase/         Browser and server Supabase clients
  retailers/            Retailer adapter contracts and future adapters
  test/                 Shared test setup
```

## Deployment

Import the GitHub repository into Vercel, add all environment variables from
`.env.example`, and deploy. No Vercel-specific runtime configuration is required
for Sprint 0.

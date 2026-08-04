# Chic Magnolia production smoke monitoring

The production smoke check verifies that the canonical public service is reachable, secure and
serving the release that triggered the workflow. It complements unit tests, the production build,
Vercel deployment checks and retailer-specific monitoring.

## Automated workflow

The workflow is:

```text
.github/workflows/production-smoke.yml
```

It runs:

- after every push to `main`;
- daily at 07:11 UTC;
- when manually started from GitHub Actions.

After a push to `main`, the workflow waits for the canonical health endpoint to report the exact
Git commit that triggered the workflow. This prevents a successful request to the previous Vercel
deployment from being mistaken for validation of the new release.

Scheduled and manual runs validate whichever release is currently live.

## Checks performed

The script `scripts/production-smoke.sh` verifies:

- `/api/health` returns HTTP 200, `status = ok`, `service = chicmagnolia` and the production
  environment;
- push-triggered runs observe the expected full Git commit SHA;
- health responses are not cached;
- HSTS, frame denial, MIME-sniffing protection and camera, microphone and geolocation denials are
  present;
- the homepage, Privacy notice, Terms and Support page return HTTP 200 and contain their expected
  public content;
- public pages do not expose the retired `support@chicmagnolia.com` mailbox;
- an unauthenticated `/dashboard` request redirects into the login flow;
- `robots.txt` protects private and API routes;
- `robots.txt` points to the canonical sitemap;
- the sitemap contains the public support, privacy and terms routes.

The smoke check does not submit the support form, create an account, run a retailer scrape or
create a Stripe Checkout session. Those flows have separate integration and operational tests.

## Manual use

Run the current production check from any trusted machine with Bash, curl and jq:

```bash
bash scripts/production-smoke.sh https://www.chicmagnolia.com
```

To require a particular release:

```bash
bash scripts/production-smoke.sh \
  https://www.chicmagnolia.com \
  FULL_GIT_COMMIT_SHA
```

The release-specific check waits for up to ten minutes so that Vercel can build and promote the
new deployment.

## Responding to a failure

1. Do not invite new beta users while the production smoke workflow is failing.
2. Open the failed GitHub Actions run and identify the first failed assertion.
3. Check the current Vercel production deployment and runtime logs.
4. Use [`ROLLBACK.md`](ROLLBACK.md) when the canonical deployment is unhealthy or serves the wrong
   release.
5. When the failure is limited to public copy or metadata, correct it through a tested pull
   request rather than weakening the assertion.
6. Re-run the smoke workflow after recovery and record the incident in the private operating log.

A smoke test is evidence of basic availability and controls at one moment. It is not proof that
every retailer page, alert or billing flow is working.

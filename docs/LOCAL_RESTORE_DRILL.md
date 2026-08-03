# Zero-cost local database restore drill

This runbook verifies that an encrypted ChicMagnolia backup can be restored without creating a
second hosted Supabase project or changing the production database. It runs a temporary Supabase
Postgres instance on the founder's own computer, restores the verified SQL files, performs
security and row-count checks, then destroys the temporary database.

The local stack is for recovery testing only. It uses default local credentials, has no TLS and
must never be exposed to the internet or used as a production service.

## Cost and isolation

The drill creates no hosted Supabase project and does not upgrade the production plan. It uses:

- a Docker-compatible runtime on the local Mac;
- the Supabase CLI;
- local Postgres on `127.0.0.1:54322`;
- `psql` for the single-transaction restore.

The helper does not accept a database URL. Its target is hard-coded to the loopback-only local
address, so a pasted production connection string cannot redirect the restore.

## Prerequisites on macOS

Install and start one Docker-compatible runtime supported by Supabase, such as Docker Desktop,
OrbStack, Rancher Desktop, Podman or Colima. Do not expose its local ports to other machines.

Install the Supabase CLI and Postgres client tools:

```bash
brew install supabase/tap/supabase
brew install libpq
```

Confirm the tools and Docker daemon are available:

```bash
docker info >/dev/null
supabase --version
"$(brew --prefix libpq)/bin/psql" --version
```

The first local start downloads Supabase Postgres images and can take several minutes.

## Required backup directory

First run `scripts/verify-encrypted-backup.sh`. Use only the resulting verified directory, which
must contain exactly:

```text
roles.sql
schema.sql
data.sql
manifest.txt
manifest.sha256
```

The directory contains plaintext production data. Keep it local and do not upload, email or
commit it.

## Run the drill

From a current checkout of `main`:

```bash
bash scripts/restore-backup-locally.sh \
  "$HOME/Downloads/chicmagnolia-backup-verified-20260803-140329/restored-backup"
```

The helper:

1. rechecks the internal manifest checksums;
2. refuses to continue when Docker, Supabase CLI or `psql` is unavailable;
3. refuses to use local port `54322` when another process already owns it;
4. initializes a unique temporary Supabase work directory;
5. starts only local Supabase Postgres, matching the first backup's Postgres release by default;
6. restores roles, schema and data in one transaction with `ON_ERROR_STOP=1`;
7. verifies all expected ChicMagnolia tables exist;
8. verifies RLS is enabled on personal-data and internal tables;
9. verifies `support_requests` and `stripe_webhook_events` have no browser-facing policies;
10. verifies internal database functions are not executable by `anon` or `authenticated`;
11. records only non-sensitive row counts and recovery metadata in a local report;
12. destroys the temporary database and work directory automatically.

A successful run ends with:

```text
Local restore drill completed successfully.
Schema, data import, RLS, private queues and internal function privileges passed.
```

The report is written under:

```text
$HOME/ChicMagnolia-restore-reports/
```

It contains counts and technical verification results, not row contents, credentials or SQL.

## Keep the temporary restore for inspection

Normal runs delete the local database immediately. To inspect it deliberately, run:

```bash
KEEP_LOCAL_RESTORE=1 \
  bash scripts/restore-backup-locally.sh \
  "/path/to/restored-backup"
```

The helper prints the exact work directory and cleanup commands. While retained, the database is
available only at:

```text
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Destroy it as soon as inspection finishes. Never point a public deployment at this local stack.

## Postgres version override

The first encrypted backup came from Supabase Postgres `17.6.1.147`, which is the helper's default.
For a future backup taken after a platform database upgrade, pass the confirmed source version:

```bash
CHICMAGNOLIA_POSTGRES_VERSION='NEW_VERSION' \
  bash scripts/restore-backup-locally.sh \
  "/path/to/restored-backup"
```

Record the production Postgres version at the time of each backup or restore drill.

## After a successful drill

1. Keep the non-sensitive restore report.
2. Delete the decrypted backup directory.
3. Keep the encrypted artifact and the private `age` identity in separate protected locations.
4. Keep a second encrypted recovery copy of the private identity.
5. Repeat the drill monthly while relying on logical exports from the Supabase Free plan.

A local restore proves the SQL backup is structurally recoverable. Before a public paid launch,
perform an additional replacement-project exercise when a suitable hosted test environment is
available, because hosted Auth, SMTP, redirect URLs, API keys and provider configuration are not
contained in the database dump.

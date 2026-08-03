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

The helper does not accept a database URL. Its restore and verification targets are hard-coded to
the loopback address, so a pasted production connection string cannot redirect the restore. It
also creates a unique Docker bridge network with
`com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, verifies that option before starting
Postgres, passes the network explicitly to the Supabase CLI and removes the network afterward.

Every Supabase CLI command receives an explicit temporary `--workdir`. The helper therefore does
not initialize `supabase/config.toml` or other local CLI state inside the ChicMagnolia repository.

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

## Hosted role settings and local compatibility

A hosted Supabase role dump can contain role-level `log_min_messages` configuration that the
restricted local `postgres` role is not allowed to apply to another managed role. The local
Supabase stack already supplies its own logging configuration, and this setting does not contain
application schema or user data.

The helper therefore creates a private temporary copy of `roles.sql` and removes only statements
matching an `ALTER ROLE` or `ALTER USER` operation that sets `log_min_messages`. It does not edit
the verified backup. The original role dump remains protected by `manifest.sha256`, and every
other role statement is passed to `psql` unchanged.

The number of omitted compatibility statements is recorded as:

```text
roles_compatibility_statements_skipped=N
```

A different permission error is not ignored. The restore stops, rolls back and cleans up so the
new incompatibility can be reviewed explicitly.

## Run the drill

From a current checkout of `main`:

```bash
bash scripts/restore-backup-locally.sh \
  "$HOME/Downloads/chicmagnolia-backup-verified-20260803-185443/restored-backup"
```

The helper:

1. rechecks the internal manifest checksums;
2. refuses to continue when Docker, Supabase CLI or `psql` is unavailable;
3. refuses to use local port `54322` when another process already owns it;
4. creates a temporary role-restore copy that omits only hosted `log_min_messages` role settings;
5. initializes a unique temporary Supabase work directory using the explicit CLI `--workdir` flag;
6. creates and verifies a dedicated Docker network whose host binding is `127.0.0.1`;
7. starts only local Supabase Postgres on that network, matching the first backup's Postgres release by default;
8. restores roles, schema and data in one transaction with `ON_ERROR_STOP=1`;
9. verifies all expected ChicMagnolia tables exist;
10. verifies RLS is enabled on personal-data and internal tables;
11. verifies `support_requests` and `stripe_webhook_events` have no browser-facing policies;
12. verifies internal database functions are not executable by `anon` or `authenticated`;
13. records only non-sensitive row counts, compatibility counts and recovery metadata in a local report;
14. destroys the temporary database, Docker network and work directory automatically.

A successful run ends with:

```text
Local restore drill completed successfully.
Schema, data import, RLS, private queues and internal function privileges passed.
```

The report is written under:

```text
$HOME/ChicMagnolia-restore-reports/
```

It contains counts and technical verification results, not row contents, credentials or SQL. It
also records `database_host_binding=127.0.0.1` and the role compatibility statement count so the
recovery evidence includes both network isolation and any narrowly scoped local normalization.

## Clean up stale repository-local CLI files

An older version of the helper could leave these untracked files in a checkout:

```text
supabase/.gitignore
supabase/config.toml
```

Before running the current helper, use `git status --short`. Delete those two paths only when Git
shows them as untracked and there are no other unexpected changes. The current helper uses
`--workdir` explicitly and does not recreate them.

## Keep the temporary restore for inspection

Normal runs delete the local database immediately. To inspect it deliberately, run:

```bash
KEEP_LOCAL_RESTORE=1 \
  bash scripts/restore-backup-locally.sh \
  "/path/to/restored-backup"
```

The helper prints the exact work directory, Docker network and cleanup commands. While retained,
the database is available only at:

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

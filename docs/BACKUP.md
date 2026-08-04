# Chic Magnolia database backup and recovery

This runbook protects the Supabase database used by the Chic Magnolia private beta. It covers
logical database backups, encrypted off-site retention, decryption and restore drills. It does
not replace the broader incident procedure in [`ROLLBACK.md`](ROLLBACK.md).

## Current backup decision

The connected Supabase project is on the Free plan. Supabase provides automatic daily backups
for Pro, Team and Enterprise projects, while Free projects are expected to export data and keep
backups off-site. Point-in-Time Recovery is a paid add-on and also requires paid compute.

Until the founder explicitly upgrades the project, Chic Magnolia uses the repository workflow:

```text
.github/workflows/encrypted-database-backup.yml
```

The workflow is safe to merge before credentials are configured. Scheduled and manual runs exit
with a warning and create no files unless both required settings exist.

## Recovery objectives for the private beta

- **Recovery point objective:** no more than 24 hours of database changes lost.
- **Recovery time objective:** begin recovery immediately and restore a small beta database to a
  disposable replacement project within four hours.
- **Retention:** 14 encrypted daily artifacts in GitHub Actions.
- **Restore drill:** at least once before inviting external beta users, then monthly while the
  service remains on the Free plan.

These are operational targets, not contractual guarantees.

## What the encrypted database backup contains

The Supabase CLI creates three logical exports:

- `roles.sql`: database roles supported by the Supabase dump process;
- `schema.sql`: schemas, tables, functions, triggers, policies and other database structure;
- `data.sql`: database rows, including application and authentication data covered by the
  Supabase dump process.

A manifest records the UTC timestamp, Git commit, Supabase CLI version, file sizes and SHA-256
checksums. The SQL files and manifest are placed in a compressed archive, then encrypted with
`age`. Only the encrypted archive and its encrypted-file checksum are uploaded.

The workflow deliberately excludes the current Supabase vector-storage metadata tables from the
data dump, matching Supabase's documented restore guidance.

## What is not protected by this workflow

A database dump does not independently preserve every external service or configuration. Keep
separate records for:

- Vercel environment variables, domains and project settings;
- Stripe products, prices, webhook endpoints, portal settings and payment records;
- Resend domains, templates, contacts and automations;
- Supabase Auth provider, SMTP and redirect-URL settings;
- GitHub repository secrets and variables;
- Oxylabs and Browserless account configuration;
- Supabase Storage object bytes if Chic Magnolia later starts using Storage.

The repository preserves application code and SQL migrations. Provider secrets must remain in
provider secret stores and must never be copied into a backup artifact or committed to Git.

## One-time encryption-key setup

Generate the `age` identity on a trusted offline machine:

```bash
age-keygen -o chicmagnolia-backup-key.txt
age-keygen -y chicmagnolia-backup-key.txt
```

The second command prints a public recipient beginning with `age1`.

Store `chicmagnolia-backup-key.txt` in an encrypted password manager or other protected offline
location. Keep a second protected recovery copy. Never add the private identity to GitHub,
Supabase, Vercel, source control, screenshots or support messages.

The public `age1...` recipient is not secret. It can encrypt backups but cannot decrypt them.

## GitHub configuration

Configure these repository settings:

### Secret: `SUPABASE_DB_URL`

Use the production project's **Session pooler** connection string on port `5432`, with the
current database password and SSL required. The password must be URL-encoded when it contains
reserved URL characters.

Example shape only:

```text
postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
```

Do not paste the real connection string into an issue, pull request, workflow log or committed
file. Rotate the database password immediately if it is exposed.

### Repository variable: `BACKUP_AGE_RECIPIENT`

Set this to the public `age1...` recipient produced by the offline key-generation step. Do not
store the private identity in any GitHub variable or secret.

The workflow scopes these values only to the configuration check and real database-dump step.
Pull-request validation and third-party setup actions do not receive the production database
connection string.

## First configured backup status

The first configured backup completed successfully on 2 August 2026:

```text
GitHub Actions run: 30738550186
Source commit: b122587d94ce80c6e7158b9c18f0e1e7d49bc8c6
Artifact: chicmagnolia-database-20260802T074954Z
Retention expiry: 16 August 2026
```

The artifact contains only:

```text
chicmagnolia-database-20260802T074954Z.tar.gz.age
chicmagnolia-database-20260802T074954Z.tar.gz.age.sha256
```

The encrypted-file checksum was independently verified. No plaintext SQL was uploaded. The
backup is not yet considered recoverable until the founder completes local decryption, internal
manifest verification and a disposable Supabase restore drill.

## First backup validation

1. Open **GitHub Actions → Encrypted database backup → Run workflow**.
2. Confirm all configured steps succeed.
3. Download the encrypted artifact from the workflow run.
4. Follow [`LOCAL_BACKUP_VERIFICATION.md`](LOCAL_BACKUP_VERIFICATION.md) and run the repository
   helper against the downloaded ZIP and offline identity.
5. Confirm the helper verifies the encrypted checksum, decrypts successfully and validates the
   internal manifest.
6. Perform a restore drill into a disposable Supabase project.
7. Record the date and result in the private operational log. Do not commit user data or the
   decrypted files.

A successful workflow run alone is not enough. A backup is considered usable only after a
successful decryption and restore drill.

## Verify and decrypt an artifact

The tested local helper is:

```text
scripts/verify-encrypted-backup.sh
```

For the first artifact and the founder's current key location, run this from a local checkout of
`main`:

```bash
bash scripts/verify-encrypted-backup.sh \
  "$HOME/Downloads/chicmagnolia-database-20260802T074954Z.zip" \
  "$HOME/chicmagnolia-backup-key.txt" \
  "$HOME/Downloads/chicmagnolia-backup-verified"
```

The helper verifies the outer checksum, decrypts locally, rejects unsafe or unexpected entries,
checks the five expected files and verifies the internal manifest checksums. It never prints or
copies the private identity.

Do not send decrypted SQL files by email or upload them to cloud drives without an approved
encryption and access-control decision.

## Restore drill

Never test a logical restore against the active production database.

1. Create a disposable Supabase project in the same region where practical.
2. Enable any non-default extensions required by the migrations.
3. Copy the new project's Session pooler connection string and keep it only in a local shell
   variable.
4. Restore roles, schema and data in one transaction:

```bash
export RESTORE_DB_URL='postgresql://postgres.NEW_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require'

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$HOME/Downloads/chicmagnolia-backup-verified/restored-backup/roles.sql" \
  --file "$HOME/Downloads/chicmagnolia-backup-verified/restored-backup/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$HOME/Downloads/chicmagnolia-backup-verified/restored-backup/data.sql" \
  --dbname "$RESTORE_DB_URL"
```

5. Apply or compare the repository migrations if the target platform version requires it.
6. Verify key objects and row counts:

```sql
select count(*) from auth.users;
select count(*) from public.profiles;
select count(*) from public.tracked_purchases;
select count(*) from public.price_checks;
select count(*) from public.notification_history;
select count(*) from public.subscriptions;
select count(*) from public.legal_acceptances;
select count(*) from public.support_requests;
```

7. Confirm RLS is enabled, the support queue has no browser policy and internal trigger functions
   retain their restricted privileges.
8. Point a temporary local application instance at the disposable project and test sign-in,
   dashboard read access and one disposable purchase.
9. Delete the disposable project after the drill and securely delete the decrypted local files.

Existing Supabase sessions will not automatically transfer to a new project because project JWT
secrets differ. Users should expect to sign in again after a full project replacement.

## Daily operating check

During the first two beta weeks, confirm each morning that the most recent scheduled workflow
completed and produced one encrypted artifact. Investigate immediately when:

- the workflow is skipped because configuration is missing;
- the database dump fails;
- encryption or artifact upload fails;
- the encrypted artifact is unexpectedly much smaller than the previous successful artifact;
- no successful artifact exists within the previous 26 hours.

## Key rotation

Generate a new offline age identity when the private key may have been exposed, when the person
responsible for recovery changes, or at least annually. Update `BACKUP_AGE_RECIPIENT` to the new
public recipient and run a manual backup. Retain the old private identity until every artifact
encrypted to it has expired or been securely re-encrypted.

## Moving to a paid Supabase plan

Before public live billing, decide whether to upgrade to a Supabase plan with managed daily
backups or enable Point-in-Time Recovery. A paid Supabase backup improves platform recovery but
does not protect against project deletion together with provider-held backups. Retain a periodic
encrypted off-site logical export even after upgrading.

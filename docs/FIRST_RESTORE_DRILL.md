# First ChicMagnolia backup restore drill

This runbook completes the first restore test for the encrypted database backup created on
2 August 2026. It is intentionally written so the private `age` identity never leaves the
founder's Mac.

## Verified starting point

The first configured backup completed successfully on GitHub Actions run `30738550186` from
`main` commit `b122587d94ce80c6e7158b9c18f0e1e7d49bc8c6`.

The artifact is named:

```text
chicmagnolia-database-20260802T074954Z
```

It contains only:

```text
chicmagnolia-database-20260802T074954Z.tar.gz.age
chicmagnolia-database-20260802T074954Z.tar.gz.age.sha256
```

The encrypted-file checksum has been independently verified. The artifact expires on
16 August 2026. The remaining work is local decryption, manifest verification and a restore into
a disposable Supabase project.

## Local prerequisites

On the founder's Mac, confirm these commands exist:

```bash
age --version
unzip -v | head -n 1
tar --version | head -n 1
```

The private identity is expected at:

```text
$HOME/chicmagnolia-backup-key.txt
```

Do not open, copy, upload or screenshot the private identity. The file should be readable only by
the owner:

```bash
chmod 600 "$HOME/chicmagnolia-backup-key.txt"
```

## Download the artifact

Open **GitHub → ChicMagnolia → Actions → Encrypted database backup → run #5** and download the
artifact. The expected downloaded ZIP name is:

```text
chicmagnolia-database-20260802T074954Z.zip
```

A browser may append a suffix such as ` (1)` when the file already exists. Use the exact local
filename in the command below.

## Verify and decrypt with the repository helper

From a local ChicMagnolia repository checkout, run:

```bash
bash scripts/verify-backup-artifact.sh \
  "$HOME/Downloads/chicmagnolia-database-20260802T074954Z.zip" \
  "$HOME/chicmagnolia-backup-key.txt" \
  "$HOME/chicmagnolia-restore-drill-20260802"
```

The helper:

- verifies the outer encrypted-file checksum;
- decrypts with the local private identity;
- rejects unsafe archive paths and unexpected files;
- extracts only `roles.sql`, `schema.sql`, `data.sql`, `manifest.txt` and `manifest.sha256`;
- verifies the inner manifest checksums;
- keeps the decrypted files outside the source repository by default;
- never prints the private identity or SQL contents.

Expected final output includes:

```text
Backup verification passed.
Verified decrypted files: .../chicmagnolia-restore-drill-20260802
```

Do not upload the restored directory or any SQL file to ChatGPT, email, GitHub, cloud drives or
support systems.

## Disposable Supabase project

Create a new disposable Supabase project for the restore drill. Do not restore into the active
production project.

Use the disposable project's Session pooler connection string on port `5432` and keep it only in
the local shell:

```bash
export RESTORE_DB_URL='postgresql://postgres.NEW_REF:URL_ENCODED_PASSWORD@POOLER_HOST:5432/postgres?sslmode=require'
```

Restore from the verified directory:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$HOME/chicmagnolia-restore-drill-20260802/roles.sql" \
  --file "$HOME/chicmagnolia-restore-drill-20260802/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$HOME/chicmagnolia-restore-drill-20260802/data.sql" \
  --dbname "$RESTORE_DB_URL"
```

Never put `RESTORE_DB_URL` in a committed file, screenshot, support ticket or chat message.

## Restore verification

Run these checks in the disposable project:

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

Also confirm:

- RLS remains enabled on user-owned tables;
- a simulated second authenticated identity cannot read or modify another user's rows;
- `support_requests` remains inaccessible to browser roles;
- internal trigger functions retain their restricted privileges;
- a temporary local application can sign in and read its own dashboard data.

Existing production sessions are not expected to transfer to the disposable project because the
project JWT secrets are different.

## Cleanup

After recording the private result:

1. delete the disposable Supabase project;
2. unset the local connection string;
3. remove the decrypted restore directory and downloaded ZIP;
4. keep the encrypted GitHub artifact until normal retention expires;
5. retain the protected offline `age` identity and its recovery copy.

```bash
unset RESTORE_DB_URL
rm -rf "$HOME/chicmagnolia-restore-drill-20260802"
rm -f "$HOME/Downloads/chicmagnolia-database-20260802T074954Z.zip"
```

Deletion on modern SSDs is not a guarantee of forensic erasure. Keep decrypted files short-lived,
private and outside synchronized folders.

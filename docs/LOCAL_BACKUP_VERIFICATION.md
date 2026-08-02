# Verify an encrypted ChicMagnolia database backup locally

Use this procedure after downloading an artifact from **GitHub Actions → Encrypted database
backup**. It verifies that the encrypted file arrived intact, decrypts it with the offline `age`
identity and checks every file listed in the internal manifest.

The process is local-only. Do not upload the private identity, decrypted archive or SQL files to
GitHub, ChatGPT, email or an unapproved cloud drive.

## Prerequisites

On macOS:

```bash
brew install age
```

The machine must also have `unzip`, `tar` and either `shasum` or `sha256sum`. Standard macOS
includes `unzip`, `tar` and `shasum`.

Before running the helper, protect the private identity:

```bash
chmod 600 "$HOME/chicmagnolia-backup-key.txt"
```

Confirm that it produces the same public recipient stored in GitHub as
`BACKUP_AGE_RECIPIENT`:

```bash
age-keygen -y "$HOME/chicmagnolia-backup-key.txt"
```

The output begins with `age1`. The public recipient may be compared safely, but never print,
copy or share the private identity file contents.

## One-command verification

Run this from a local clone of the ChicMagnolia repository. Replace the artifact ZIP path when
the downloaded name differs:

```bash
bash scripts/verify-encrypted-backup.sh \
  "$HOME/Downloads/chicmagnolia-database-20260802T074954Z.zip" \
  "$HOME/chicmagnolia-backup-key.txt" \
  "$HOME/Downloads/chicmagnolia-backup-verified"
```

The output directory must not already exist. This is intentional so an earlier restore drill
cannot be overwritten silently.

The helper performs all of the following:

1. validates the private `age` identity without printing it;
2. rejects unsafe paths in the downloaded ZIP and decrypted archive;
3. verifies the SHA-256 checksum of the encrypted `.age` file;
4. decrypts the archive locally;
5. confirms `roles.sql`, `schema.sql`, `data.sql`, `manifest.txt` and `manifest.sha256` exist;
6. verifies every checksum in `manifest.sha256`;
7. verifies the expected manifest metadata keys;
8. removes the intermediate decrypted `.tar.gz` copy after extraction.

A successful run ends with:

```text
Encrypted backup verification completed successfully.
WARNING: This directory contains plaintext production data.
```

The verified SQL files remain under:

```text
$HOME/Downloads/chicmagnolia-backup-verified/restored-backup
```

## After verification

Do not open or upload `data.sql` unless it is necessary for the controlled restore drill. It may
contain authentication and application data.

Move the private identity to a protected hidden directory after the first successful decrypt:

```bash
mkdir -p "$HOME/.chicmagnolia-secrets"
chmod 700 "$HOME/.chicmagnolia-secrets"
mv "$HOME/chicmagnolia-backup-key.txt" \
  "$HOME/.chicmagnolia-secrets/chicmagnolia-backup-key.txt"
chmod 600 "$HOME/.chicmagnolia-secrets/chicmagnolia-backup-key.txt"
```

Keep a second encrypted recovery copy in a trusted password manager or equivalent offline
location. The private identity must never be stored in GitHub.

The backup is not considered recoverable until the files are restored into a disposable
Supabase project and the application-level checks in [`BACKUP.md`](BACKUP.md) pass.

After the restore drill, delete the disposable project and securely remove the plaintext output
directory from the Mac.

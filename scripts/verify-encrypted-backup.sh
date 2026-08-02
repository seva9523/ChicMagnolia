#!/usr/bin/env bash

set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage:
  bash scripts/verify-encrypted-backup.sh ARTIFACT_ZIP AGE_IDENTITY [OUTPUT_DIR]

Arguments:
  ARTIFACT_ZIP  ZIP downloaded from the Encrypted database backup workflow.
  AGE_IDENTITY  Private age identity used to decrypt the backup.
  OUTPUT_DIR    Optional new directory for verified output. It must not exist.

The script verifies the encrypted checksum, decrypts the archive locally,
checks the manifest checksums and leaves the verified SQL files in OUTPUT_DIR.
It never prints or copies the private age identity.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

check_sha256() {
  local checksum_file=$1

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check "$checksum_file"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$checksum_file"
  else
    fail 'Neither sha256sum nor shasum is available.'
  fi
}

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  usage >&2
  exit 64
fi

artifact_zip=$1
identity_file=$2
output_dir=${3:-"$PWD/chicmagnolia-backup-verified-$(date -u +'%Y%m%dT%H%M%SZ')"}

require_command age
require_command age-keygen
require_command unzip
require_command tar
require_command find

[ -f "$artifact_zip" ] || fail "Artifact ZIP not found: $artifact_zip"
[ -f "$identity_file" ] || fail "Age identity not found: $identity_file"
[ ! -e "$output_dir" ] || fail "Output path already exists: $output_dir"

chmod 600 "$identity_file"
recipient=$(age-keygen -y "$identity_file")
case "$recipient" in
  age1*) ;;
  *) fail 'The supplied identity is not a native age identity.' ;;
esac
unset recipient

mkdir -p "$output_dir/encrypted-artifact" "$output_dir/restored-backup"
chmod 700 "$output_dir" "$output_dir/encrypted-artifact" "$output_dir/restored-backup"

success=false
cleanup_on_failure() {
  if [ "$success" != true ]; then
    rm -rf "$output_dir"
  fi
}
trap cleanup_on_failure EXIT INT TERM

while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      fail "Unsafe path in artifact ZIP: $entry"
      ;;
  esac
done < <(unzip -Z1 "$artifact_zip")

unzip -q "$artifact_zip" -d "$output_dir/encrypted-artifact"

encrypted_count=$(find "$output_dir/encrypted-artifact" -type f \
  -name 'chicmagnolia-database-*.tar.gz.age' | wc -l | tr -d ' ')
[ "$encrypted_count" -eq 1 ] || fail \
  "Expected exactly one encrypted database archive, found $encrypted_count."

encrypted_file=$(find "$output_dir/encrypted-artifact" -type f \
  -name 'chicmagnolia-database-*.tar.gz.age' -print)
encrypted_dir=$(dirname "$encrypted_file")
encrypted_name=$(basename "$encrypted_file")
encrypted_checksum="${encrypted_file}.sha256"
[ -f "$encrypted_checksum" ] || fail \
  "Encrypted checksum file not found: ${encrypted_name}.sha256"

printf 'Verifying encrypted artifact checksum...\n'
(
  cd "$encrypted_dir"
  check_sha256 "${encrypted_name}.sha256"
)

plain_archive="$output_dir/chicmagnolia-database-backup.tar.gz"
printf 'Decrypting backup locally...\n'
age --decrypt \
  --identity "$identity_file" \
  --output "$plain_archive" \
  "$encrypted_file"

while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      fail "Unsafe path in decrypted archive: $entry"
      ;;
  esac
done < <(tar -tzf "$plain_archive")

tar -xzf "$plain_archive" -C "$output_dir/restored-backup"

for expected_file in roles.sql schema.sql data.sql manifest.txt manifest.sha256; do
  [ -f "$output_dir/restored-backup/$expected_file" ] || fail \
    "Expected file missing from decrypted backup: $expected_file"
done

printf 'Verifying decrypted manifest checksums...\n'
(
  cd "$output_dir/restored-backup"
  check_sha256 manifest.sha256
)

for required_key in \
  generated_at_utc \
  source_git_sha \
  workflow_run_id \
  supabase_cli_version \
  roles_bytes \
  schema_bytes \
  data_bytes; do
  grep -q "^${required_key}=" "$output_dir/restored-backup/manifest.txt" || fail \
    "Manifest key missing: $required_key"
done

rm -f "$plain_archive"
success=true
trap - EXIT INT TERM

printf '\nEncrypted backup verification completed successfully.\n'
printf 'Verified SQL files: %s\n' "$output_dir/restored-backup"
printf 'WARNING: This directory contains plaintext production data.\n'
printf 'Keep it local, use it only for the restore drill, then delete it securely.\n'

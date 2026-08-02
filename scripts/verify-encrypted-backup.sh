#!/usr/bin/env bash

set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage:
  bash scripts/verify-encrypted-backup.sh ARTIFACT_ZIP [AGE_IDENTITY] [OUTPUT_DIR]

Arguments:
  ARTIFACT_ZIP  ZIP downloaded from the Encrypted database backup workflow.
  AGE_IDENTITY  Private age identity. Defaults to $HOME/chicmagnolia-backup-key.txt.
  OUTPUT_DIR    New directory for verified output. Defaults to
                $HOME/chicmagnolia-restore-drill. It must not already exist.

The script verifies the encrypted checksum, decrypts the archive locally,
checks every internal manifest checksum and leaves only the verified backup
files under OUTPUT_DIR/restored-backup. It never prints or copies the private
age identity.
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

if [ "${1:-}" = '-h' ] || [ "${1:-}" = '--help' ]; then
  usage
  exit 0
fi

if [ "$#" -lt 1 ] || [ "$#" -gt 3 ]; then
  usage >&2
  exit 64
fi

artifact_zip=$1
identity_file=${2:-"$HOME/chicmagnolia-backup-key.txt"}
output_dir=${3:-"$HOME/chicmagnolia-restore-drill"}

require_command age
require_command age-keygen
require_command unzip
require_command tar
require_command grep
require_command basename

[ -f "$artifact_zip" ] || fail "Artifact ZIP not found: $artifact_zip"
[ -r "$artifact_zip" ] || fail "Artifact ZIP is not readable: $artifact_zip"
[ -f "$identity_file" ] || fail "Age identity not found: $identity_file"
[ -r "$identity_file" ] || fail "Age identity is not readable: $identity_file"
[ ! -e "$output_dir" ] || fail "Output path already exists: $output_dir"

chmod 600 "$identity_file"
recipient=$(age-keygen -y "$identity_file")
case "$recipient" in
  age1*) ;;
  *) fail 'The supplied identity is not a native age identity.' ;;
esac
unset recipient

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/chicmagnolia-backup-verify.XXXXXX")
artifact_dir="$temp_dir/artifact"
plain_archive="$temp_dir/chicmagnolia-database-backup.tar.gz"
restored_dir="$output_dir/restored-backup"
completed=false

cleanup() {
  rm -rf "$temp_dir"

  if [ "$completed" != true ] && [ -e "$output_dir" ]; then
    rm -rf "$output_dir"
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$artifact_dir"

while IFS= read -r entry; do
  case "$entry" in
    '' ) ;;
    /*|..|../*|*/../*|*/..)
      fail "Unsafe path in artifact ZIP: $entry"
      ;;
  esac
done < <(unzip -Z1 "$artifact_zip")

unzip -q "$artifact_zip" -d "$artifact_dir"

shopt -s nullglob dotglob
artifact_entries=("$artifact_dir"/*)
shopt -u nullglob dotglob

[ "${#artifact_entries[@]}" -eq 2 ] || fail \
  "Expected exactly two files in the artifact, found ${#artifact_entries[@]}."

for artifact_entry in "${artifact_entries[@]}"; do
  [ -f "$artifact_entry" ] || fail \
    "Artifact contains a non-file entry: $(basename "$artifact_entry")"

  case "$(basename "$artifact_entry")" in
    chicmagnolia-database-*.tar.gz.age|chicmagnolia-database-*.tar.gz.age.sha256)
      ;;
    *)
      fail "Artifact contains an unexpected file: $(basename "$artifact_entry")"
      ;;
  esac
done

shopt -s nullglob
encrypted_files=("$artifact_dir"/chicmagnolia-database-*.tar.gz.age)
shopt -u nullglob

[ "${#encrypted_files[@]}" -eq 1 ] || fail \
  "Expected exactly one encrypted database archive, found ${#encrypted_files[@]}."

encrypted_file=${encrypted_files[0]}
encrypted_name=$(basename "$encrypted_file")
encrypted_checksum="${encrypted_file}.sha256"
[ -f "$encrypted_checksum" ] || fail \
  "Encrypted checksum file not found: ${encrypted_name}.sha256"

printf 'Verifying encrypted artifact checksum...\n'
(
  cd "$artifact_dir"
  check_sha256 "${encrypted_name}.sha256"
)

printf 'Decrypting backup locally...\n'
age --decrypt \
  --identity "$identity_file" \
  --output "$plain_archive" \
  "$encrypted_file"

while IFS= read -r entry; do
  case "$entry" in
    '' ) ;;
    /*|..|../*|*/../*|*/..)
      fail "Unsafe path in decrypted archive: $entry"
      ;;
  esac
done < <(tar -tzf "$plain_archive")

mkdir -p "$restored_dir"
chmod 700 "$output_dir" "$restored_dir"
tar -xzf "$plain_archive" -C "$restored_dir"

for expected_file in roles.sql schema.sql data.sql manifest.txt manifest.sha256; do
  [ -f "$restored_dir/$expected_file" ] || fail \
    "Expected file missing from decrypted backup: $expected_file"
done

shopt -s nullglob dotglob
restored_entries=("$restored_dir"/*)
shopt -u nullglob dotglob

[ "${#restored_entries[@]}" -eq 5 ] || fail \
  "Expected exactly five files in the decrypted backup, found ${#restored_entries[@]}."

for restored_entry in "${restored_entries[@]}"; do
  [ -f "$restored_entry" ] || fail \
    "Decrypted backup contains a non-file entry: $(basename "$restored_entry")"

  case "$(basename "$restored_entry")" in
    roles.sql|schema.sql|data.sql|manifest.txt|manifest.sha256)
      ;;
    *)
      fail "Decrypted backup contains an unexpected file: $(basename "$restored_entry")"
      ;;
  esac
done

printf 'Verifying decrypted manifest checksums...\n'
(
  cd "$restored_dir"
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
  grep -q "^${required_key}=" "$restored_dir/manifest.txt" || fail \
    "Manifest key missing: $required_key"
done

chmod 600 "$restored_dir"/*
completed=true

printf '\nEncrypted backup verification completed successfully.\n'
printf 'Verified SQL files: %s\n' "$restored_dir"
printf 'WARNING: This directory contains plaintext production data.\n'
printf 'Keep it local, use it only for the restore drill, then delete it securely.\n'

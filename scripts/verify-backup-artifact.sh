#!/usr/bin/env bash

set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage:
  scripts/verify-backup-artifact.sh ARTIFACT_ZIP [AGE_IDENTITY] [OUTPUT_DIR]

Arguments:
  ARTIFACT_ZIP  GitHub Actions artifact ZIP downloaded from the encrypted backup workflow.
  AGE_IDENTITY  Private age identity file. Defaults to $HOME/chicmagnolia-backup-key.txt.
  OUTPUT_DIR    New directory for verified decrypted files. Defaults to
                $HOME/chicmagnolia-restore-drill.

The script verifies the encrypted-file checksum, decrypts the archive, rejects unsafe archive
paths, extracts only the expected backup files and verifies the manifest checksums. It never
prints the age identity or SQL contents.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' was not found."
}

verify_sha256_file() {
  local checksum_file=$1
  local directory=$2
  local checksum_name

  checksum_name=$(basename "$checksum_file")

  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "$directory"
      sha256sum --check "$checksum_name"
    )
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    (
      cd "$directory"
      shasum -a 256 --check "$checksum_name"
    )
    return
  fi

  fail "Neither sha256sum nor shasum is available."
}

if [[ ${1:-} == '-h' || ${1:-} == '--help' ]]; then
  usage
  exit 0
fi

artifact_zip=${1:-}
age_identity=${2:-"${HOME}/chicmagnolia-backup-key.txt"}
output_dir=${3:-"${HOME}/chicmagnolia-restore-drill"}

[[ -n "$artifact_zip" ]] || {
  usage >&2
  exit 2
}

require_command unzip
require_command age
require_command tar

[[ -f "$artifact_zip" ]] || fail "Artifact ZIP was not found: $artifact_zip"
[[ -r "$artifact_zip" ]] || fail "Artifact ZIP is not readable: $artifact_zip"
[[ -f "$age_identity" ]] || fail "Private age identity was not found: $age_identity"
[[ -r "$age_identity" ]] || fail "Private age identity is not readable: $age_identity"

if [[ -e "$output_dir" ]]; then
  fail "Output path already exists. Choose a new directory or remove it securely first: $output_dir"
fi

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/chicmagnolia-backup-verify.XXXXXX")
artifact_dir="${temp_dir}/artifact"
decrypted_archive="${temp_dir}/database-backup.tar.gz"
completed=false

cleanup() {
  rm -rf "$temp_dir"

  if [[ "$completed" != true && -e "$output_dir" ]]; then
    rm -rf "$output_dir"
  fi
}
trap cleanup EXIT

mkdir -p "$artifact_dir"
unzip -q "$artifact_zip" -d "$artifact_dir"

shopt -s nullglob
encrypted_files=("${artifact_dir}"/*.tar.gz.age)
shopt -u nullglob

if (( ${#encrypted_files[@]} != 1 )); then
  fail "Expected exactly one encrypted .tar.gz.age file in the artifact."
fi

encrypted_file=${encrypted_files[0]}
encrypted_checksum="${encrypted_file}.sha256"
[[ -f "$encrypted_checksum" ]] || fail "Encrypted-file checksum is missing."

unexpected_file=$(find "$artifact_dir" -maxdepth 1 -type f \
  ! -name '*.tar.gz.age' \
  ! -name '*.tar.gz.age.sha256' \
  -print -quit)

if [[ -n "$unexpected_file" ]]; then
  fail "Artifact contains an unexpected file: $(basename "$unexpected_file")"
fi

printf 'Verifying encrypted artifact checksum...\n'
verify_sha256_file "$encrypted_checksum" "$artifact_dir"

printf 'Decrypting backup archive...\n'
age --decrypt \
  --identity "$age_identity" \
  --output "$decrypted_archive" \
  "$encrypted_file"

while IFS= read -r archive_entry; do
  case "$archive_entry" in
    '' ) ;;
    /* | .. | ../* | */../* )
      fail "Archive contains an unsafe path: $archive_entry"
      ;;
  esac
done < <(tar -tzf "$decrypted_archive")

mkdir -p "$output_dir"
chmod 700 "$output_dir"
tar -xzf "$decrypted_archive" -C "$output_dir"

required_files=(
  roles.sql
  schema.sql
  data.sql
  manifest.txt
  manifest.sha256
)

for required_file in "${required_files[@]}"; do
  [[ -f "${output_dir}/${required_file}" ]] || fail "Required backup file is missing: $required_file"
done

unexpected_extracted=$(find "$output_dir" -mindepth 1 -maxdepth 1 \
  ! -type f \
  -o -type f \
  ! -name 'roles.sql' \
  ! -name 'schema.sql' \
  ! -name 'data.sql' \
  ! -name 'manifest.txt' \
  ! -name 'manifest.sha256' \
  -print -quit)

if [[ -n "$unexpected_extracted" ]]; then
  fail "Decrypted archive contains an unexpected entry: $(basename "$unexpected_extracted")"
fi

printf 'Verifying decrypted backup manifest...\n'
verify_sha256_file "${output_dir}/manifest.sha256" "$output_dir"
chmod 600 "${output_dir}"/*

printf '\nBackup verification passed.\n'
printf 'Verified decrypted files: %s\n' "$output_dir"
printf 'Manifest summary:\n'
grep -E '^(generated_at_utc|source_git_sha|workflow_run_id|supabase_cli_version)=' \
  "${output_dir}/manifest.txt" || true
printf '\nKeep this directory private and delete it after the disposable restore drill.\n'

completed=true

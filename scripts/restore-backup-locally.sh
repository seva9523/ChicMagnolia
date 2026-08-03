#!/usr/bin/env bash

set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Usage:
  bash scripts/restore-backup-locally.sh VERIFIED_BACKUP_DIR [REPORT_DIR]

Arguments:
  VERIFIED_BACKUP_DIR  Directory produced by verify-encrypted-backup.sh. It
                       must contain roles.sql, schema.sql, data.sql,
                       manifest.txt and manifest.sha256.
  REPORT_DIR           Optional directory for a non-sensitive restore report.
                       Defaults to $HOME/ChicMagnolia-restore-reports.

This command performs a destructive restore only against a temporary Supabase
Postgres instance published through a dedicated Docker network whose host
binding is fixed to 127.0.0.1. It never accepts a remote database URL and never
connects to the hosted production project.

Prerequisites:
  - Docker-compatible runtime running locally
  - Supabase CLI installed
  - psql installed (Homebrew libpq is detected automatically on macOS)

By default the temporary database, Docker network and working directory are
destroyed after verification. Set KEEP_LOCAL_RESTORE=1 only when you
deliberately need to inspect the local instance before deleting it.
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

resolve_psql() {
  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    local brew_psql
    brew_psql="$(brew --prefix libpq 2>/dev/null)/bin/psql"
    if [ -x "$brew_psql" ]; then
      printf '%s\n' "$brew_psql"
      return 0
    fi
  fi

  return 1
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

port_in_use() {
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 54322 >/dev/null 2>&1
    return $?
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:54322 -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  return 1
}

if [ "${1:-}" = '-h' ] || [ "${1:-}" = '--help' ]; then
  usage
  exit 0
fi

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  usage >&2
  exit 64
fi

backup_dir=${1%/}
report_dir=${2:-"$HOME/ChicMagnolia-restore-reports"}
keep_local=${KEEP_LOCAL_RESTORE:-0}
postgres_version=${CHICMAGNOLIA_POSTGRES_VERSION:-17.6.1.147}
local_db_url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'

[ -d "$backup_dir" ] || fail "Verified backup directory not found: $backup_dir"
[ "$keep_local" = '0' ] || [ "$keep_local" = '1' ] || fail \
  'KEEP_LOCAL_RESTORE must be 0 or 1.'

case "$postgres_version" in
  *[!0-9A-Za-z._-]*|'')
    fail 'CHICMAGNOLIA_POSTGRES_VERSION contains unsupported characters.'
    ;;
esac

for required_file in roles.sql schema.sql data.sql manifest.txt manifest.sha256; do
  [ -f "$backup_dir/$required_file" ] || fail \
    "Expected backup file missing: $required_file"
done

for required_key in \
  generated_at_utc \
  source_git_sha \
  workflow_run_id \
  supabase_cli_version \
  roles_bytes \
  schema_bytes \
  data_bytes; do
  grep -q "^${required_key}=" "$backup_dir/manifest.txt" || fail \
    "Manifest key missing: $required_key"
done

require_command docker
require_command supabase
require_command grep
require_command awk
require_command mktemp
require_command date

psql_bin=$(resolve_psql) || fail \
  'psql was not found. On macOS run: brew install libpq'

docker info >/dev/null 2>&1 || fail \
  'Docker is installed but is not running. Start Docker Desktop or another compatible runtime.'

if port_in_use; then
  fail 'Local port 54322 is already in use. Stop the existing local Supabase database first.'
fi

printf 'Rechecking verified backup manifest...\n'
(
  cd "$backup_dir"
  check_sha256 manifest.sha256
)

workdir=$(mktemp -d "${TMPDIR:-/tmp}/chicmagnolia-local-restore.XXXXXX")
network_id="chicmagnolia-restore-${workdir##*.}"
report_tmp="$workdir/restore-report.txt"
started=false
network_created=false
completed=false

cleanup() {
  local status=$?
  local cleanup_failed=false
  set +e

  if [ "$started" = true ] && [ "$keep_local" != '1' ]; then
    if ! SUPABASE_WORKDIR="$workdir" \
      supabase --network-id "$network_id" stop --no-backup \
      >/dev/null 2>&1; then
      cleanup_failed=true
      printf '\nWARNING: Automatic local Supabase cleanup failed.\n' >&2
    fi
  fi

  if [ "$network_created" = true ] && [ "$keep_local" != '1' ]; then
    if ! docker network rm "$network_id" >/dev/null 2>&1; then
      cleanup_failed=true
      printf '\nWARNING: Automatic Docker network cleanup failed.\n' >&2
    fi
  fi

  if [ "$cleanup_failed" = true ]; then
    printf 'Run these commands manually before deleting the workdir:\n' >&2
    printf '  SUPABASE_WORKDIR=%q supabase --network-id %q stop --no-backup\n' \
      "$workdir" "$network_id" >&2
    printf '  docker network rm %q\n' "$network_id" >&2
    printf '  rm -rf %q\n' "$workdir" >&2
  elif [ "$keep_local" != '1' ]; then
    rm -rf "$workdir"
  elif [ "$started" = true ]; then
    printf '\nTemporary local restore was kept intentionally.\n'
    printf 'Workdir: %s\n' "$workdir"
    printf 'Docker network: %s\n' "$network_id"
    printf 'Database: %s\n' "$local_db_url"
    printf 'Destroy it when finished with:\n'
    printf '  SUPABASE_WORKDIR=%q supabase --network-id %q stop --no-backup\n' \
      "$workdir" "$network_id"
    printf '  docker network rm %q\n' "$network_id"
    printf '  rm -rf %q\n' "$workdir"
  fi

  if [ "$cleanup_failed" = true ] && [ "$status" -eq 0 ]; then
    status=1
  fi

  if [ "$status" -ne 0 ] && [ "$completed" != true ]; then
    if [ "$cleanup_failed" = false ] && [ "$keep_local" != '1' ]; then
      printf 'Local restore drill failed; the temporary database and network were cleaned up.\n' >&2
    else
      printf 'Local restore drill failed; review the retained local resources.\n' >&2
    fi
  fi

  trap - EXIT
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Initializing an isolated local Supabase workdir...\n'
printf 'n\n' | SUPABASE_WORKDIR="$workdir" supabase init >/dev/null
mkdir -p "$workdir/supabase/.temp"
printf '%s\n' "$postgres_version" > "$workdir/supabase/.temp/postgres-version"

printf 'Creating a Docker network bound to 127.0.0.1...\n'
docker network create \
  --label 'com.chicmagnolia.restore-drill=true' \
  --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' \
  "$network_id" \
  >/dev/null
network_created=true

network_binding=$(docker network inspect "$network_id" \
  --format '{{ index .Options "com.docker.network.bridge.host_binding_ipv4" }}')
[ "$network_binding" = '127.0.0.1' ] || fail \
  "Docker network host binding is '${network_binding}', not 127.0.0.1."
unset network_binding

printf 'Starting local Supabase Postgres %s...\n' "$postgres_version"
started=true
SUPABASE_WORKDIR="$workdir" \
  supabase --network-id "$network_id" db start

printf 'Restoring roles, schema and data into the loopback-only database...\n'
PGCONNECT_TIMEOUT=10 "$psql_bin" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$backup_dir/roles.sql" \
  --file "$backup_dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$backup_dir/data.sql" \
  --dbname "$local_db_url" \
  >/dev/null

printf 'Verifying restored objects, RLS and service-role-only queues...\n'
PGCONNECT_TIMEOUT=10 "$psql_bin" \
  --variable ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --dbname "$local_db_url" \
  > "$report_tmp" <<'SQL'
\set ON_ERROR_STOP on

DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(expected_table ORDER BY expected_table)
  INTO missing
  FROM unnest(ARRAY[
    'public.profiles',
    'public.tracked_purchases',
    'public.price_checks',
    'public.notification_history',
    'public.subscriptions',
    'public.legal_acceptances',
    'public.support_requests',
    'public.stripe_webhook_events'
  ]) AS expected(expected_table)
  WHERE to_regclass(expected_table) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing expected restored tables: %', missing;
  END IF;
END
$$;

DO $$
DECLARE
  unprotected text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = ANY(ARRAY[
      'profiles',
      'tracked_purchases',
      'price_checks',
      'notification_history',
      'subscriptions',
      'legal_acceptances',
      'support_requests',
      'stripe_webhook_events'
    ])
    AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is disabled on restored tables: %', unprotected;
  END IF;
END
$$;

DO $$
DECLARE
  exposed_policy_count integer;
BEGIN
  SELECT count(*)
  INTO exposed_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('support_requests', 'stripe_webhook_events');

  IF exposed_policy_count <> 0 THEN
    RAISE EXCEPTION 'Internal service-role queues unexpectedly have % browser-facing policies',
      exposed_policy_count;
  END IF;
END
$$;

DO $$
DECLARE
  exposed_function_count integer;
BEGIN
  SELECT count(*)
  INTO exposed_function_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'handle_new_user',
      'set_updated_at',
      'rls_auto_enable',
      'sync_stripe_subscription'
    )
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  IF exposed_function_count <> 0 THEN
    RAISE EXCEPTION '% internal functions are executable by browser roles',
      exposed_function_count;
  END IF;
END
$$;

SELECT 'restore_verified_at_utc=' || to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
SELECT 'postgres_server_version=' || current_setting('server_version');
SELECT 'database_host_binding=127.0.0.1';
SELECT 'auth_users=' || count(*) FROM auth.users;
SELECT 'profiles=' || count(*) FROM public.profiles;
SELECT 'tracked_purchases=' || count(*) FROM public.tracked_purchases;
SELECT 'price_checks=' || count(*) FROM public.price_checks;
SELECT 'notification_history=' || count(*) FROM public.notification_history;
SELECT 'subscriptions=' || count(*) FROM public.subscriptions;
SELECT 'legal_acceptances=' || count(*) FROM public.legal_acceptances;
SELECT 'support_requests=' || count(*) FROM public.support_requests;
SELECT 'stripe_webhook_events=' || count(*) FROM public.stripe_webhook_events;
SELECT 'rls_verification=passed';
SELECT 'service_role_queue_verification=passed';
SELECT 'internal_function_privilege_verification=passed';
SQL

mkdir -p "$report_dir"
chmod 700 "$report_dir"
report_file="$report_dir/chicmagnolia-local-restore-$(date -u +%Y%m%dT%H%M%SZ).txt"
{
  printf 'ChicMagnolia local restore drill\n'
  printf 'source_generated_at_utc=%s\n' "$(awk -F= '$1 == "generated_at_utc" { print $2; exit }' "$backup_dir/manifest.txt")"
  printf 'source_git_sha=%s\n' "$(awk -F= '$1 == "source_git_sha" { print $2; exit }' "$backup_dir/manifest.txt")"
  printf 'source_workflow_run_id=%s\n' "$(awk -F= '$1 == "workflow_run_id" { print $2; exit }' "$backup_dir/manifest.txt")"
  cat "$report_tmp"
} > "$report_file"
chmod 600 "$report_file"

completed=true

printf '\nLocal restore drill completed successfully.\n'
printf 'The production backup restored into an isolated loopback-only Supabase database.\n'
printf 'Schema, data import, RLS, private queues and internal function privileges passed.\n'
printf 'Non-sensitive count report: %s\n' "$report_file"

if [ "$keep_local" != '1' ]; then
  printf 'The temporary local database and Docker network will now be destroyed automatically.\n'
fi

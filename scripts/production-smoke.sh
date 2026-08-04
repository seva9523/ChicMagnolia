#!/usr/bin/env bash

set -euo pipefail

APP_URL="${1:-https://www.chicmagnolia.com}"
EXPECTED_RELEASE="${2:-}"
APP_URL="${APP_URL%/}"

workdir=$(mktemp -d)
trap 'rm -rf "${workdir}"' EXIT

log() {
  printf '[production-smoke] %s\n' "$*"
}

fail() {
  printf '[production-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

fetch_to_file() {
  local url="$1"
  local output="$2"
  local code

  code=$(curl \
    --silent \
    --show-error \
    --location \
    --retry 3 \
    --retry-all-errors \
    --connect-timeout 10 \
    --max-time 30 \
    --output "${output}" \
    --write-out '%{http_code}' \
    "${url}")

  if [ "${code}" != '200' ]; then
    fail "${url} returned HTTP ${code}; expected 200."
  fi
}

wait_for_health() {
  local health_file="${workdir}/health.json"
  local headers_file="${workdir}/health.headers"
  local attempts=60

  for attempt in $(seq 1 "${attempts}"); do
    local code
    code=$(curl \
      --silent \
      --show-error \
      --retry 2 \
      --retry-all-errors \
      --connect-timeout 10 \
      --max-time 30 \
      --dump-header "${headers_file}" \
      --output "${health_file}" \
      --write-out '%{http_code}' \
      "${APP_URL}/api/health" || true)

    if [ "${code}" = '200' ] && jq -e \
      '.status == "ok" and .service == "chicmagnolia" and (.timestamp | type == "string")' \
      "${health_file}" >/dev/null 2>&1; then
      local release
      local environment
      release=$(jq -r '.release // ""' "${health_file}")
      environment=$(jq -r '.environment // ""' "${health_file}")

      if [ "${environment}" != 'production' ]; then
        fail "Canonical health endpoint reported environment '${environment}', not production."
      fi

      if [ -z "${EXPECTED_RELEASE}" ] || [ "${release}" = "${EXPECTED_RELEASE}" ]; then
        log "Health check passed for release ${release}."
        return 0
      fi

      log "Attempt ${attempt}/${attempts}: production still serves ${release}; waiting for ${EXPECTED_RELEASE}."
    else
      log "Attempt ${attempt}/${attempts}: health endpoint is not ready yet (HTTP ${code:-000})."
    fi

    sleep 10
  done

  if [ -s "${health_file}" ]; then
    cat "${health_file}" >&2
  fi
  fail "Production did not expose the expected healthy release within 10 minutes."
}

assert_security_headers() {
  local headers_file="${workdir}/health.headers"
  local normalized="${workdir}/health.headers.normalized"

  tr -d '\r' < "${headers_file}" | tr '[:upper:]' '[:lower:]' > "${normalized}"

  grep -Eq '^cache-control: .*no-store' "${normalized}" ||
    fail 'Health responses are not marked no-store.'
  grep -Eq '^strict-transport-security: .*includesubdomains' "${normalized}" ||
    fail 'Strict-Transport-Security is missing includeSubDomains.'
  grep -Eq '^x-frame-options: deny$' "${normalized}" ||
    fail 'X-Frame-Options is not DENY.'
  grep -Eq '^x-content-type-options: nosniff$' "${normalized}" ||
    fail 'X-Content-Type-Options is not nosniff.'
  grep -Eq '^permissions-policy: .*camera=\(\)' "${normalized}" ||
    fail 'Permissions-Policy does not deny camera access.'
  grep -Eq '^permissions-policy: .*microphone=\(\)' "${normalized}" ||
    fail 'Permissions-Policy does not deny microphone access.'
  grep -Eq '^permissions-policy: .*geolocation=\(\)' "${normalized}" ||
    fail 'Permissions-Policy does not deny geolocation access.'
  grep -Eq '^x-robots-tag: noindex, nofollow, noarchive$' "${normalized}" ||
    fail 'API responses do not carry the required X-Robots-Tag.'

  log 'Security headers passed.'
}

assert_public_page() {
  local path="$1"
  local marker="$2"
  local name="$3"
  local expected_title="$4"
  local expected_canonical="$5"
  local output="${workdir}/${name}.html"

  fetch_to_file "${APP_URL}${path}" "${output}"
  grep -Fq "${marker}" "${output}" ||
    fail "${path} did not contain the expected marker: ${marker}"
  grep -Fq "<title>${expected_title}</title>" "${output}" ||
    fail "${path} did not contain the expected title: ${expected_title}"
  grep -Fq "<link rel=\"canonical\" href=\"${expected_canonical}\"/>" "${output}" ||
    fail "${path} did not contain the expected canonical URL: ${expected_canonical}"

  if grep -Fq 'support@chicmagnolia.com' "${output}"; then
    fail "${path} still exposes the retired support mailbox."
  fi

  log "${path} passed."
}

assert_private_route_redirect() {
  local headers_file="${workdir}/dashboard.headers"
  local normalized="${workdir}/dashboard.headers.normalized"
  local code
  local location

  code=$(curl \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    --dump-header "${headers_file}" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "${APP_URL}/dashboard")

  case "${code}" in
    302|303|307|308) ;;
    *) fail "/dashboard returned HTTP ${code}; expected an authentication redirect." ;;
  esac

  location=$(tr -d '\r' < "${headers_file}" | awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/^[^:]+:[[:space:]]*/, ""); print; exit }')

  case "${location}" in
    *'/login'*) ;;
    *) fail "/dashboard redirected to '${location}', not the login flow." ;;
  esac

  tr -d '\r' < "${headers_file}" | tr '[:upper:]' '[:lower:]' > "${normalized}"
  grep -Eq '^x-robots-tag: noindex, nofollow, noarchive$' "${normalized}" ||
    fail 'The private dashboard redirect does not carry the required X-Robots-Tag.'

  log 'Private dashboard redirect passed.'
}

assert_public_metadata() {
  local robots="${workdir}/robots.txt"
  local sitemap="${workdir}/sitemap.xml"

  fetch_to_file "${APP_URL}/robots.txt" "${robots}"
  grep -Fq 'Disallow: /api/' "${robots}" ||
    fail 'robots.txt does not protect API routes.'
  grep -Fq 'Disallow: /dashboard/' "${robots}" ||
    fail 'robots.txt does not protect dashboard routes.'
  grep -Fq "${APP_URL}/sitemap.xml" "${robots}" ||
    fail 'robots.txt does not reference the canonical sitemap.'

  fetch_to_file "${APP_URL}/sitemap.xml" "${sitemap}"
  for path in '/support' '/privacy' '/terms'; do
    grep -Fq "${APP_URL}${path}" "${sitemap}" ||
      fail "sitemap.xml does not contain ${path}."
  done

  log 'robots.txt and sitemap.xml passed.'
}

wait_for_health
assert_security_headers
assert_public_page \
  '/' \
  'Catch price drops before your return window closes.' \
  'home' \
  'Chic Magnolia' \
  "${APP_URL}"
assert_public_page \
  '/privacy' \
  'Privacy notice' \
  'privacy' \
  'Privacy notice | Chic Magnolia' \
  "${APP_URL}/privacy"
assert_public_page \
  '/terms' \
  'Terms of service' \
  'terms' \
  'Terms of service | Chic Magnolia' \
  "${APP_URL}/terms"
assert_public_page \
  '/support' \
  'Send request' \
  'support' \
  'Support | Chic Magnolia' \
  "${APP_URL}/support"
assert_private_route_redirect
assert_public_metadata

log 'All production smoke checks passed.'

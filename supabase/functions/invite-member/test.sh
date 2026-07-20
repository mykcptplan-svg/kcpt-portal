#!/usr/bin/env bash
#
# Manual verification script for the invite-member Edge Function.
#
# Export these before running:
#   SUPABASE_PROJECT_URL  — e.g. https://your-project.supabase.co
#   SUPABASE_ANON_KEY     — project anon key (apikey header)
#   ADMIN_JWT             — access_token for a user with profiles.role = 'admin'
#   MEMBER_JWT            — access_token for a user with profiles.role = 'member'
#
# Usage:
#   export SUPABASE_PROJECT_URL=https://your-project.supabase.co
#   export SUPABASE_ANON_KEY=eyJ...
#   export ADMIN_JWT=eyJ...
#   export MEMBER_JWT=eyJ...
#   ./supabase/functions/invite-member/test.sh
#
# Obtaining ADMIN_JWT / MEMBER_JWT:
#   - Log in via the app, then read access_token from browser DevTools
#     > Application > Local Storage (Supabase auth session key), or
#   - curl -X POST "$SUPABASE_PROJECT_URL/auth/v1/token?grant_type=password" \
#       -H "apikey: $SUPABASE_ANON_KEY" \
#       -H "Content-Type: application/json" \
#       -d '{"email":"your@email.com","password":"your-password"}'
#     and copy access_token from the JSON response.

set -euo pipefail

ENDPOINT="${SUPABASE_PROJECT_URL:?SUPABASE_PROJECT_URL is not set}/functions/v1/invite-member"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY is not set}"
: "${ADMIN_JWT:?ADMIN_JWT is not set}"
: "${MEMBER_JWT:?MEMBER_JWT is not set}"

print_body() {
  local body="$1"
  if command -v jq >/dev/null 2>&1; then
    set +e
    printf '%s\n' "$body" | jq .
    local jq_status=$?
    set -e
    if [[ $jq_status -ne 0 ]]; then
      printf '%s\n' "$body"
    fi
  else
    printf '%s\n' "$body"
  fi
}

run_test() {
  local label="$1"
  local expected="$2"
  shift 2

  echo ""
  echo "================================================================"
  echo "$label"
  echo "Expected: $expected"
  echo "----------------------------------------------------------------"

  set +e
  local raw
  raw="$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    "$@")"
  local curl_status=$?
  set -e

  if [[ $curl_status -ne 0 ]]; then
    echo "HTTP status: (curl failed with exit code $curl_status)"
    echo "Response body:"
    print_body "$raw"
    return 0
  fi

  local http_status="${raw##*HTTP_STATUS:}"
  local body="${raw%HTTP_STATUS:*}"
  body="${body%$'\n'}"

  echo "HTTP status: $http_status"
  echo "Response body:"
  print_body "$body"
}

echo "Testing invite-member at: $ENDPOINT"

run_test \
  "1. No Authorization header, valid email" \
  "401 (gateway verify_jwt) or 403" \
  -d '{"email":"test@example.com"}'

run_test \
  "2. MEMBER_JWT, valid email" \
  "403 Forbidden (role check fails)" \
  -H "Authorization: Bearer $MEMBER_JWT" \
  -d '{"email":"test@example.com"}'

run_test \
  "3. ADMIN_JWT, valid throwaway email" \
  "200 success" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d "{\"email\":\"test+$(date +%s)@example.com\"}"

run_test \
  "4. ADMIN_JWT, invalid email" \
  "400 validation error" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"email":"not-an-email"}'

echo ""
echo "Done — all 4 scenarios completed."

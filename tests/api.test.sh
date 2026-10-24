#!/usr/bin/env bash
# End-to-end tests for the licensing API.
#
#   1. start the worker:  cd website && npx wrangler dev --port 8788
#   2. run this:         ./tests/api.test.sh
#
# Everything runs against a local D1 database, so the keys created here are
# throwaway.
set -uo pipefail

BASE="${1:-http://127.0.0.1:8788}"
TOKEN="${ADMIN_TOKEN:-local-admin-token-change-me}"

pass=0
fail=0

ok()   { pass=$((pass + 1)); echo "  ok    $1"; }
bad()  { fail=$((fail + 1)); echo "  FAIL  $1 — expected $2, got $3"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi; }

# --- readiness ---------------------------------------------------------------
for _ in $(seq 1 40); do
  if curl -s -m 2 -o /dev/null "$BASE/get-pro-key.html"; then break; fi
  sleep 1
done

echo "Edit.or.lynk licensing API tests ($BASE)"

# --- static assets -----------------------------------------------------------
code=$(curl -s -m 5 -L -o /dev/null -w "%{http_code}" "$BASE/get-pro-key.html")
check "Pro Key page serves" "200" "$code"

code=$(curl -s -m 5 -L -o /dev/null -w "%{http_code}" "$BASE/admin.html")
check "Admin page serves" "200" "$code"

ctype=$(curl -s -m 5 -L -o /dev/null -w "%{content_type}" "$BASE/get-pro-key.html")
case "$ctype" in text/html*) ok "Pro Key page is HTML" ;; *) bad "Pro Key page is HTML" "text/html*" "$ctype" ;; esac

# --- admin gating ------------------------------------------------------------
code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "$BASE/api/admin/overview")
check "Admin refuses without a token" "401" "$code"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: wrong-token" "$BASE/api/admin/overview")
check "Admin refuses a wrong token" "401" "$code"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $TOKEN" "$BASE/api/admin/overview")
check "Admin accepts the token" "200" "$code"

# --- validation --------------------------------------------------------------
code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/license/validate" \
  -H 'Content-Type: application/json' -d '{"key":"ELNK-AAAA-BBBB-CCCC-DDDD"}')
check "Unknown key is rejected" "400" "$code"

key=$(curl -s -m 5 -X POST "$BASE/api/admin/keys" -H 'Content-Type: application/json' \
  -H "X-Admin-Token: $TOKEN" -d '{"count":1,"days":365,"note":"test"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["keys"][0]["key"])')

if [[ "$key" =~ ^ELNK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$ ]]; then
  ok "Generated key matches the app's format ($key)"
else
  bad "Generated key matches the app's format" "ELNK-XXXX-XXXX-XXXX-XXXX" "$key"
fi

first=$(curl -s -m 5 -X POST "$BASE/api/license/validate" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$key\",\"deviceId\":\"device-A\"}")
plan=$(echo "$first" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("plan",""))')
check "Valid key returns a Pro license" "pro" "$plan"

token=$(echo "$first" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("token",""))')
# The token is `payloadBase64.HMAC` — an HMAC-SHA256 over the payload.
dots=${token//[^.]/}
if [ -n "$dots" ] && [ "${#dots}" -eq 1 ] && [ "${token%%.*}" != "" ] && [ "${token#*.}" != "" ]; then
  ok "License token is signed (payload.HMAC)"
else
  bad "License token is signed (payload.HMAC)" "payload.mac" "$token"
fi

second=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/license/validate" \
  -H 'Content-Type: application/json' -d "{\"key\":\"$key\",\"deviceId\":\"device-A\"}")
check "The same device can revalidate" "200" "$second"

third=$(curl -s -m 5 -X POST "$BASE/api/license/validate" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$key\",\"deviceId\":\"device-B\"}" -w '\n%{http_code}')
reason=$(echo "$third" | head -1 | python3 -c 'import sys,json; print(json.load(sys.stdin).get("reason",""))')
check "A second device hits the redemption limit" "redeemed" "$reason"

# --- revocation --------------------------------------------------------------
code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -H "X-Admin-Token: $TOKEN" \
  "$BASE/api/admin/keys?q=$key")
keyid=$(curl -s -m 5 -H "X-Admin-Token: $TOKEN" "$BASE/api/admin/keys?q=$key" \
  | python3 -c 'import sys,json; rows=json.load(sys.stdin)["keys"]; print(rows[0]["id"] if rows else "")')
check "Admin can search keys" "200" "$code"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST -H "X-Admin-Token: $TOKEN" \
  "$BASE/api/admin/keys/$keyid/revoke")
check "Admin can revoke" "200" "$code"

after=$(curl -s -m 5 -X POST "$BASE/api/license/validate" -H 'Content-Type: application/json' \
  -d "{\"key\":\"$key\",\"deviceId\":\"device-A\"}" -w '\n%{http_code}')
reason=$(echo "$after" | head -1 | python3 -c 'import sys,json; print(json.load(sys.stdin).get("reason",""))')
check "A revoked key is refused" "revoked" "$reason"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST -H "X-Admin-Token: $TOKEN" \
  "$BASE/api/admin/keys/$keyid/revoke")
# Revoking twice must not crash; it reports the key as already gone or succeeds idempotently.
if [ "$code" = "200" ] || [ "$code" = "404" ]; then ok "Double revoke is handled ($code)"; else bad "Double revoke is handled" "200/404" "$code"; fi

# --- campaign sessions -------------------------------------------------------
code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/campaign/session" \
  -H 'Content-Type: application/json' -d '{"name":"a"}')
check "A too-short name is refused" "400" "$code"

session=$(curl -s -m 5 -X POST "$BASE/api/campaign/session" -H 'Content-Type: application/json' \
  -d '{"name":"Test Person"}')
sid=$(echo "$session" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("sessionId",""))')
code=$(echo "$session" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("code",""))')
check "Session code is 8 characters" "8" "${#code}"

configured=$(echo "$session" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("verificationConfigured"))')
check "Unconfigured Instagram is reported honestly" "False" "$configured"

state=$(curl -s -m 5 "$BASE/api/campaign/session/$sid" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))')
check "A fresh session waits for the DM" "awaiting_dm" "$state"

# Returning to the site must not issue anything.
state=$(curl -s -m 5 "$BASE/api/campaign/session/$sid" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("key",""))')
check "Polling alone never yields a key" "" "$state"

# --- Instagram webhook -------------------------------------------------------
challenge=$(curl -s -m 5 "$BASE/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=editorlynk-verify&hub.challenge=12345")
check "Webhook verification echoes the challenge" "12345" "$challenge"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "$BASE/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345")
check "Wrong verify token is refused" "403" "$code"

code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/webhooks/instagram" \
  -H 'Content-Type: application/json' -H 'X-Hub-Signature-256: sha256=deadbeef' -d '{"entry":[]}')
if [ "$code" = "403" ] || [ "$code" = "503" ]; then ok "Unsigned or untrusted webhook is refused ($code)"; else bad "Unsigned or untrusted webhook is refused" "403/503" "$code"; fi

# --- rate limiting -----------------------------------------------------------
got_limited=0
for i in $(seq 1 40); do
  code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/license/validate" \
    -H 'Content-Type: application/json' -d '{"key":"ELNK-ZZZZ-ZZZZ-ZZZZ-ZZZZ"}')
  if [ "$code" = "429" ]; then got_limited=1; break; fi
done
check "Validation is rate limited" "1" "$got_limited"

# --- audit -------------------------------------------------------------------
audit=$(curl -s -m 5 -H "X-Admin-Token: $TOKEN" "$BASE/api/admin/audit" \
  | python3 -c 'import sys,json; print(",".join(e["action"] for e in json.load(sys.stdin)["entries"]))')
case "$audit" in
  *admin.generate*) ok "Audit records key generation" ;;
  *) bad "Audit records key generation" "admin.generate" "$audit" ;;
esac
case "$audit" in
  *admin.revoke*) ok "Audit records revocation" ;;
  *) bad "Audit records revocation" "admin.revoke" "$audit" ;;
esac

# --- summary -----------------------------------------------------------------
echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]

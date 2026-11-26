#!/usr/bin/env bash
# Live proof that a Waiting On reply address receives real email: against the running dev stack (dev/up.sh, which turns
# on Waiting On's SMTP listener on localhost:2525). Creates an item through the gateway with a real token, sends the
# counterparty's reply with Python's smtplib, and polls the item until the reply is on its timeline and the workflow
# acted on it (PAID -> RESOLVED). Also checks the listener refuses mail for anyone else (no open relay).
#   dev/e2e-inbound-email.sh        exits non-zero if any check fails
# Env: GATEWAY_URL (http://localhost:8080), IDP_URL (http://localhost:9100), SMTP_HOST (127.0.0.1), SMTP_PORT (2525),
#      WAITING_ON_API (default $GATEWAY_URL/api/waiting-on; point it at a Waiting On instance directly, e.g.
#      http://localhost:8083, when the gateway is not available and that instance accepts dev-IdP tokens)
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
API="${WAITING_ON_API:-$GW/api/waiting-on}"
IDP="${IDP_URL:-http://localhost:9100}"
SMTP_HOST="${SMTP_HOST:-127.0.0.1}"
SMTP_PORT="${SMTP_PORT:-2525}"
RUN="$(date +%s)"
MEMBER_EMAIL="${MEMBER_EMAIL:-member-mail-$RUN@example.test}"
pass=0; fail=0

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi; }
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

T=$(token "$MEMBER_EMAIL") || { echo "no token from $IDP (is dev/up.sh running?)"; exit 1; }
echo "== Waiting On: a reply sent by email to the item's reply address (member: $MEMBER_EMAIL)"
EXPECTED=$(python3 -c 'import datetime;print((datetime.date.today()+datetime.timedelta(days=7)).isoformat())')
CREATED=$(curl -s -X POST "$API/v1/items" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d "{\"title\":\"e2e mail refund $RUN\",\"counterparty\":\"ACME Support\",\"category\":\"REFUND\",\"currency\":\"USD\",\"amount\":19.99,\"expectedBy\":\"$EXPECTED\"}")
ITEM=$(echo "$CREATED" | json 'd["id"]')
ADDR=$(echo "$CREATED" | json 'd["replyAddress"]')
[ -n "$ITEM" ] && ok "item created through $API ($ADDR)" || { bad "item created" "$CREATED"; exit 1; }

SENT=$(python3 - "$SMTP_HOST" "$SMTP_PORT" "$ADDR" "$RUN" <<'PY'
import smtplib, sys
from email.message import EmailMessage
host, port, to, run = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
msg = EmailMessage()
msg["From"] = "ACME Support <support@acme.example>"
msg["To"] = to
msg["Subject"] = "Re: Following up: e2e mail refund " + run
msg["Message-ID"] = "<e2e-%s@acme.example>" % run
msg.set_content("Hello,\n\nYour refund has been processed and will arrive in 3 working days.\n\nACME Support\n\n"
                "On Mon, 23 Nov 2026 at 09:00, You <%s> wrote:\n> Where is my refund?\n" % to)
try:
    with smtplib.SMTP(host, port, timeout=10) as s:
        refused = s.send_message(msg, from_addr="bounces@acme.example")
    print("sent" if not refused else "refused %s" % refused)
except Exception as e:
    print("error %s: %s" % (type(e).__name__, e))
PY
)
check "the reply is accepted over SMTP ($SMTP_HOST:$SMTP_PORT)" sent "$SENT"

status=""; types=""
for _ in $(seq 1 60); do
  types=$(curl -s "$API/v1/items/$ITEM/timeline" -H "Authorization: Bearer $T" | json '",".join(e["type"] for e in d)')
  status=$(curl -s "$API/v1/items/$ITEM" -H "Authorization: Bearer $T" | json 'd["status"]')
  [[ "$types" == *REPLY_RECEIVED* && "$status" == RESOLVED ]] && break
  sleep 0.5
done
check "the timeline shows REPLY_RECEIVED"     yes "$([[ "$types" == *REPLY_RECEIVED* ]] && echo yes || echo "no: $types")"
check "the PAID reply resolved the item"      RESOLVED "$status"
SUMMARY=$(curl -s "$API/v1/items/$ITEM/timeline" -H "Authorization: Bearer $T" | json '[e for e in d if e["type"]=="REPLY_RECEIVED"][0]["summary"]')
check "classified from the new text only"     "Reply from support@acme.example classified as PAID" "$SUMMARY"

REFUSED=$(python3 - "$SMTP_HOST" "$SMTP_PORT" "$ADDR" <<'PY'
import smtplib, sys
host, port, closed = sys.argv[1], int(sys.argv[2]), sys.argv[3]
codes = []
for rcpt in ["someone@gmail.example", closed]:  # a relay attempt, and the item that is now closed
    with smtplib.SMTP(host, port, timeout=10) as s:
        s.ehlo("e2e.example")
        s.mail("x@acme.example")
        codes.append(str(s.rcpt(rcpt)[0]))
print(",".join(codes))
PY
)
check "relay attempt and closed item are refused" "550,550" "$REFUSED"

echo "== $pass passed, $fail failed"
[ "$fail" -eq 0 ]

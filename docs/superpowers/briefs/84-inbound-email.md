# 84: Inbound email for Waiting On (replies arrive by email, not only by paste)

Read `80-common.md` first. Report: `docs/superpowers/briefs/84-report.md`.

Today each Waiting On item has a per-item reply address (`replyToken`, `REPLY_DOMAIN`), but nothing receives mail:
replies reach the service only through the provider webhook (`POST /v1/webhooks/**`, `X-Webhook-Secret`) or by the
user pasting them. Make the reply address real.

Do:
1. An SMTP listener inside waiting-on using SubEthaSMTP (`com.github.davidmoten:subethasmtp:7.2.2`, the only new
   dependency). Off by default (`INBOUND_SMTP_ENABLED=false`), port `INBOUND_SMTP_PORT` (default 2525), bind address
   configurable. It accepts mail only for `reply+<token>@<REPLY_DOMAIN>` (or the exact address format the service
   already issues: read the code); any other recipient or an unknown/closed item's token is refused at RCPT TO with a
   5xx, so the server is never an open relay. Limits: max message size (default 512 KB), max recipients 1, a
   per-connection and per-IP rate limit, connection timeout. STARTTLS not required in dev; document that production
   should sit behind an MX/relay that does TLS (or add STARTTLS with a configured keystore if simple).
2. Parse with Jakarta Mail (already on the classpath via Spring mail? check; if not, use the mail API that SubEthaSMTP
   brings): prefer text/plain, fall back to HTML-to-text (the repo already has an HTML extractor elsewhere; do not add a
   library), strip quoted history ("On ... wrote:", `>` lines, common signatures), cap length.
3. Hand the parsed reply to the same pipeline the webhook uses (find it: classification with
   `RuleBasedReplyClassifier`, timeline event REPLY_RECEIVED, workflow signal `replyReceived`). One code path for both
   entry points; the webhook keeps working.
4. Tests: an integration test that starts the listener on a random port and sends real SMTP with a Jakarta Mail client
   (or plain socket) and asserts the item's timeline and status; refusal tests (wrong domain, unknown token, closed
   item, oversize, two recipients); parser unit tests for quoted-reply stripping with real-world shaped emails (Gmail,
   Outlook, plain).
5. Wiring: `dev/up.sh` turns it on (port 2525); a live script `dev/e2e-inbound-email.sh` (create an item through the
   gateway, send a reply with Python's `smtplib` to localhost:2525, poll the item until REPLY_RECEIVED) and run it
   against the live dev stack if one is up (it usually is: gateway :8080, dev IdP :9100); compose
   (`deploy/compose/compose.yaml`: publish 25->2525 only when enabled, document); Helm (an optional
   `inboundEmail.enabled` value: container port, a separate Service of type configurable, NetworkPolicy rule admitting
   that port from anywhere); docs in `waiting-on/README.md` and `docs/deploy.md` (MX record, what is verified).
6. The Waiting On UI already explains the reply address; update its copy so it no longer says replies cannot arrive by
   email (find that copy), and keep the paste flow.

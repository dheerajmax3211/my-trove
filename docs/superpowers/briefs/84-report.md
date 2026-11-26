# 84 report: inbound email for Waiting On

Status: DONE_WITH_CONCERNS (the concerns: the frontend check was not run, and the live run went to a second
Waiting On instance instead of the gateway; both are explained below).
Branch: `worktree-agent-aed43bb716021af57`, based on main `0a011f1`, which includes the briefs commit `8354096`.

## What was built

1. **SMTP listener** (`waiting-on/.../inbound/smtp/`). It uses SubEthaSMTP `com.github.davidmoten:subethasmtp:7.2.2`,
   the only new dependency. It brings in nothing else new: Jakarta Mail and Angus are already on the classpath through
   `platform-notify`'s `spring-boot-starter-mail`.
   - It is off by default (`INBOUND_SMTP_ENABLED=false`). It listens on port `INBOUND_SMTP_PORT` (default 2525) at
     `INBOUND_SMTP_BIND_ADDRESS` (default 127.0.0.1). `InboundSmtpServer` is a `SmartLifecycle` bean, created only when
     the listener is enabled.
   - **Address format.** The service already issues `waiting+<20 hex>@<REPLY_DOMAIN>`, so the listener uses that
     instead of the brief's `reply+`. `ReplyAddresses.tokenForRecipient` accepts only that exact address on the
     configured domain, ignoring case.
   - **Recipient checks at RCPT TO.** The recipient must have the right format and belong to an item that exists and
     is not closed (`InboundEmailService.acceptsRepliesFor`). Anything else gets `550 5.1.1`, so the listener cannot be
     used as a relay. A second recipient gets `452`, which is the RFC 5321 code for too many recipients.
   - **Limits** (`SmtpLimits`, `WindowCounter`):
     - Message size is capped at 512 KB. A `SIZE` declared at MAIL FROM gets `552`. An oversize DATA also gets `552`,
       and the rest of it is drained (up to 16 MB) so the session stays in sync. SubEthaSMTP does not drain after a
       rejection, and its `TooMuchDataException` is not turned into a reply, so I handle this in our code.
     - Per IP: 3 concurrent connections, 30 new connections a minute, 60 messages an hour. Over the limit gets `421`.
     - Per connection: 5 messages, and the connection is dropped after 3 refused recipients.
     - 60 s idle timeout and 50 connections in total.
     - Every limit is configurable.
   - **No STARTTLS.** The docs say production should sit behind an MX or relay that does TLS.
2. **Parser** (`InboundMessageParser`, `HtmlText`, `QuotedReplyStripper`, using Jakarta Mail).
   - It takes the first `text/plain` part that is not an attachment. Failing that, it converts the first `text/html`
     part to text. The converter is a copy of the regex approach in Ask Your Life's `HtmlTextExtractor`, plus removal
     of `<blockquote>` history, with no new library. It does not depend on that module across modules.
   - It strips quoted history: Gmail/Apple "On ... wrote:" (also when wrapped over two lines), Outlook
     "Original Message", the From/Sent header block, `____` lines, forwarded-message markers, signatures, mobile
     footers and `>` lines.
   - It caps the text at 10,000 characters. If the whole body is quoted, it keeps the original rather than an empty
     reply. An unknown charset falls back to raw bytes.
3. **One pipeline for both entry points.** `ReplyMessageHandler` calls `InboundEmailService.handle`, the same method
   the webhook uses: classification, `REPLY_RECEIVED` on the timeline, owner notification and the `replyReceived`
   signal. The `Message-ID` deduplication applies to SMTP too. If applying the reply fails (for example, Temporal is
   unreachable), the transaction rolls back and the sender gets `451`, so it retries. The webhook is unchanged.
4. **Wiring**
   - `dev/up.sh` exports `INBOUND_SMTP_ENABLED=true` and `INBOUND_SMTP_PORT=2525`.
   - New live script `dev/e2e-inbound-email.sh`. It creates an item, sends a reply with `smtplib`, polls until the
     reply is on the timeline and the item is RESOLVED, and checks that a relay attempt and a closed item are both
     refused. It takes a `WAITING_ON_API` override.
   - Compose: the base file sets `REPLY_DOMAIN` and keeps the listener off. A new overlay,
     `deploy/compose/compose.inbound-email.yaml`, turns it on and publishes host port 25 to 2525. Compose cannot publish
     a port conditionally, so the overlay file is the "only when enabled" switch. Checked with `docker compose config`.
   - Helm: new `inboundEmail.*` values (enabled, replyDomain, containerPort 2525, servicePort 25, service type,
     annotations, externalTrafficPolicy, maxMessageSize). When enabled, the chart adds an env block, an `smtp` container
     port, a separate `waiting-on-smtp` Service and a NetworkPolicy that admits the SMTP port from anywhere.
     `REPLY_DOMAIN` is now always set from `inboundEmail.replyDomain`.
   - Docs: `waiting-on/README.md` (packages, a new "Inbound email over SMTP" section, config table, tests,
     limitations) and `docs/deploy.md` (an infrastructure row, an "Inbound email" section on the MX record and what is
     and is not covered, and the verified / not-verified lists).
5. **UI copy.** The ReplyCard, SchedulePreview and FirstUse copy no longer says replies cannot arrive by email. It
   says replies that reach Waiting On by email are read automatically, and a reply in your own inbox can still be
   pasted. The paste flow is unchanged. The copy that existing tests match ("does not email anyone for you",
   "Not connected yet" absent) is untouched.

## Tests (all run, output read)

- `./mvnw -B -ntp -pl waiting-on -am verify`: BUILD SUCCESS.
  - platform-sql: 73 tests, 0 failures.
  - platform-security: 45 tests, 0 failures.
  - platform-notify: 9 tests, 0 failures.
  - **waiting-on: 184 tests, 0 failures, 1 skipped** (`RealTemporalServerTest`, which is opt-in).
- New tests (35 in all):
  - `InboundSmtpTest` (8): real SMTP on a random port.
    - A Jakarta Mail client sends a Gmail-shaped multipart reply. The item becomes RESOLVED, and the timeline detail
      contains no quoted text.
    - A plain-socket REJECTED reply moves the item to ESCALATED. Resending the same Message-ID is not applied twice.
    - These are refused with 550: relay attempt, wrong domain, unknown token, closed item, wrong local part,
      postmaster.
    - A second recipient gets 452.
    - An oversize message gets 552, both when the size is declared and when it is actually sent, and NOOP still works
      afterwards.
    - The connection is dropped after 3 refused recipients.
    - The per-connection message limit gives 421.
    - A 4th concurrent connection from one IP gets 421, and the slot is released when a connection closes.
  - `QuotedReplyStripperTest` (12): Gmail one-line and wrapped attributions, Outlook desktop and web, a header block
    without a separator, a "From:" line that is kept, signatures and footers, interleaved quotes, forwards, all-quote,
    length cap.
  - `InboundMessageParserTest` (6): Gmail multipart/alternative with quoted-printable, Outlook HTML-only, HTML
    blockquotes, attachment skipped, missing From plus an unknown charset, empty body.
  - `WindowCounterTest` (3), `InboundSmtpConfigTest` (2: off by default, property binding), and
    `WaitingOnReplyAddressesTest` (+1 test, strict recipient parsing).
- Helm: `helm lint` passes with the listener on and off. `helm template` renders with it on (Service, NetworkPolicy,
  container port, env) and without it (no SMTP objects). kubeconform was not run.
- **Live run against the dev stack: 6/6 PASS.** It used the dev Postgres, Temporal, dev IdP and the real SMTP
  listener on localhost:2525, but not the gateway:
  - The running gateway answered 500 to every request, with
    `NoClassDefFoundError: reactor/core/publisher/InternalManySink$1` in `dev/.state/logs/gateway.log` of the main
    checkout. That looks like its jar was rebuilt while it was running. It is not caused by this branch, and I did not
    restart anyone's services.
  - Instead I ran this branch's jar as a temporary second Waiting On instance (HTTP :18083, management :19083, SMTP
    :2525) against the same database and Temporal, and ran `WAITING_ON_API=http://localhost:18083
    dev/e2e-inbound-email.sh`. I stopped that instance afterwards.
  - The default route (through the gateway on :8080) has not been run.
- **Frontend: not run.** `pnpm install` is not permitted in worktrees. The controller should run `npx vitest run
  apps/waiting-on` and `pnpm lint && pnpm typecheck` in `ui-common`. Only JSX text changed, in three components.

## Not done, not verified, decisions

- No STARTTLS and no SPF/DKIM/DMARC checks; both are documented. No MX record, LoadBalancer or port-25 deployment has
  been tried.
- The per-IP limits are in memory and per replica. They need the real client IP; this is documented, including that
  Docker's userland proxy can make every sender look like one IP.
- **Letters still do not print the reply address** (`ItemLetters`). A default reply domain has no MX, so putting the
  address in a letter would send replies nowhere. Showing it once a deployment has a real domain is listed as a next
  step. For the same reason the UI still does not display the address; there is an existing test that asserts it is
  absent.
- The webhook path does not run the quote stripper. I left it alone so the webhook's stored excerpts don't change.
- Nothing outside the brief's scope was edited.

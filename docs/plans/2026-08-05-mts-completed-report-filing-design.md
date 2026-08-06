# MTS Completed Report Filing Design

## Goal

Automatically file completed MTS Installations service reports delivered to `805shutters@gmail.com` while leaving scheduled, incomplete, ambiguous, and unrelated messages untouched.

## Approved approach

Run a dedicated GitHub Actions job every ten minutes in the 805 Shutters Official project. The job calls a protected production route that uses the existing 805 Gmail authorization, independently of the customer-inquiry monitor and the production CRM email poller.

The job shortlists inbox messages by exact sender and recipient, then inspects each message before modifying it. A message qualifies only when all of these checks pass:

- `From` is exactly `noreply@mtsinstallationsandrepairs.com`.
- `To` contains exactly `805shutters@gmail.com`.
- The subject is completion-specific, using the current `Customer - Complete Report` form or the known legacy completed-service-report form.
- The content contains a positive completion signal such as `Job complete` or `work reported complete`.
- A PDF attachment is a completed service report.
- The subject or content does not say `Scheduled`, `Incomplete`, or otherwise indicate unfinished work.

Matching is deliberately fail-closed. A new or malformed format remains in the inbox for review.

## Filing and idempotency

The dedicated Gmail label is `805/MTS Completed Reports`.

For each qualified message, the job:

1. Applies the dedicated label.
2. Reads the message again and verifies that the label is present.
3. Removes the `INBOX` label.
4. Reads the message again and verifies that the dedicated label remains and `INBOX` is absent.

The Gmail message and label state provide durable idempotency. Messages already labeled and archived do not match the inbox shortlist. A label failure prevents archiving. If archiving fails after labeling, the message remains labeled in the inbox and the next run safely retries it. A failed verification causes the automation run to report failure instead of claiming success.

## Existing messages and coexistence

The first successful run includes matching messages already in the inbox. Later runs handle new arrivals.

The filing job can coexist with the read-only ten-minute customer-inquiry monitor because that monitor excludes automated vendor messages. It also coexists with the 15-minute production installation-invoice poller: that poller searches all matching Gmail mail, not only the inbox, and records Gmail message IDs in its database for replay protection.

## Boundaries

- Run only from `/Users/willie_the_agent/Documents/805 Shutters Official`.
- Use only the 805 Gmail connection and 805 automation project.
- Do not read, change, deploy, or depend on an MTS repository or MTS infrastructure.
- Do not send, reply to, delete, trash, or mark messages read.

## Verification

- Unit tests cover accepted current and legacy completion formats plus rejected scheduled, incomplete, wrong-sender, wrong-recipient, missing-body-signal, and missing-attachment cases.
- Unit tests cover label-first sequencing, retry behavior, and post-operation verification failures.
- Repository validation runs `npm run typecheck`, `npm test`, and `npm run build`.
- Production verification confirms the deployed 805 site is healthy.
- Automation verification confirms a distinct active ten-minute job in the dedicated 805 project and a successful initial backfill run or a specific external blocker.

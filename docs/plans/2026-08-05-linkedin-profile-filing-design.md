# LinkedIn Profile Email Filing Design

## Goal

Archive irrelevant LinkedIn profile-recommendation emails in the 805 mailbox while retaining recommendations whose subject or recommendation content contains the whole word `shutters`, case-insensitively.

## Approved design

Use a separate protected ten-minute 805 job and route. This isolates LinkedIn filing from MTS filing and makes failures, audit labels, and production counts independent.

A message is a recognized LinkedIn profile email only when all checks pass:

- `From` resolves exactly to `messages-noreply@linkedin.com`.
- `To` resolves exactly to `805shutters@gmail.com`.
- The decoded body is non-empty.
- The body contains the LinkedIn People You May Know template marker `email_pymk_02`.
- The body contains the explicit subscription footer `You are receiving People You May Know notification emails.`
- The body contains a LinkedIn profile link under `https://www.linkedin.com/comm/in/`.

These requirements exclude LinkedIn updates, general notifications, direct-message alerts, and non-LinkedIn mail even if their content happens to mention profiles.

## Relevance and fail-safe behavior

The relevance scan combines the subject with the recommendation portion of the decoded body and checks `\bshutters\b` case-insensitively. The standard LinkedIn account/footer section beginning at `Get the new LinkedIn desktop app` or `This email was intended for` is excluded because every message identifies the recipient as `Owner at 805 Shutters`; counting that boilerplate would retain every recommendation and defeat the requested rule.

If the message body is empty, truncated before the required markers, malformed, or cannot otherwise be inspected, the message remains in `INBOX` with no mutation. Recognized profile emails containing `shutters` also remain untouched in `INBOX`.

## Filing and idempotency

Recognized irrelevant messages receive `805/LinkedIn Profiles Archived`. The service verifies the label, removes `INBOX`, and verifies that the label remains while `INBOX` is absent. Any label or verification failure prevents archive. Archive failure leaves a labeled inbox message retryable. The shortlist searches only `in:inbox`, so successfully archived messages are naturally idempotent.

## Verification and boundary

Tests cover exact source/recipient checks, both required People You May Know markers, subject/body relevance, case-insensitive whole-word behavior, footer exclusion, unrelated LinkedIn mail, unreadable content, label-first sequencing, verification failures, and retries. Production verification processes existing matching inbox messages, reruns for idempotency, and performs read-only mailbox checks.

All implementation and deployment stay in the 805 Shutters project and use only the 805 Gmail authorization. No MTS repository, credential, deployment, or resource is used or changed.

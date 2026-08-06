# MTS Report Filing Extension Design

## Goal

Extend the existing 805-only MTS filing automation so verified scheduled and incomplete notices are labeled and archived alongside the already-supported completed reports, while ambiguous notices remain visible.

## Approved design

Keep one protected ten-minute job and add fail-closed scheduled and incomplete classifiers. This is safer than a broad subject-only Gmail filter and avoids multiple jobs racing over the same inbox shortlist. Completed reports retain `805/MTS Completed Reports`; scheduled notices receive `805/MTS Scheduled Reports`; incomplete reports receive `805/MTS Incomplete Reports` so each filing reason remains auditable.

A scheduled notice qualifies only when all of these checks pass:

- `From` resolves exactly to `noreply@mtsinstallationsandrepairs.com`.
- `To` resolves exactly to `805shutters@gmail.com`.
- The subject exactly follows a non-empty `Customer - Scheduled` grammar after trimming ordinary surrounding whitespace.
- The body starts with a standalone `Scheduled` status and contains line-anchored, non-empty `Reason for update:`, `Customer:`, `Job #:`, and `Scheduled:` fields. The job number must use the observed numeric `####-####` form; the schedule must be a value or `TBD`.
- The subject and body do not contain a conflicting completed or incomplete status.

An incomplete report qualifies only with the same exact sender and recipient, a non-empty `Customer - Incomplete Report` subject, standalone `Incomplete` plus `Job incomplete` body signals, line-anchored non-empty `Customer`, a numeric `####-####` `Job #`, a positive `Incomplete Work (N)` count, and an `incomplete_service_report.pdf` PDF attachment. Conflicting completed or scheduled status fails closed.

Scheduled notices do not require attachments because the verified production format has none. Completed-report criteria remain unchanged, including their completion body and PDF requirements.

## Filing and failure behavior

The classifier returns the report kind and corresponding label. The existing orchestration applies that label, verifies it, removes `INBOX`, and then verifies the final state. A label or verification failure prevents archive; an archive failure leaves the labeled inbox message retryable. Searching only `in:inbox` preserves idempotency.

The Gmail shortlist expands only enough to include exact scheduled and incomplete-report subjects from the same exact sender and recipient. Anything that fails its full type-specific predicate is never mutated.

## Verification

Tests cover the observed scheduled and incomplete formats, missing required fields, wrong sender/recipient, misleading or conflicting prose, completed-report regression behavior, per-kind label selection, and retry safety. Production verification runs the deployed workflow against existing inbox mail, confirms counts, then reruns it to prove idempotency. Read-only mailbox checks confirm every qualifying report type is absent from `INBOX` after filing.

## Boundary

All code, credentials, scheduling, deployment, and mailbox access remain inside the 805 Shutters project and `805shutters@gmail.com`. No MTS repository, deployment, credential, or infrastructure is used or changed.

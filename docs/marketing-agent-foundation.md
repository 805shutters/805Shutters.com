# Governed 805 marketing agent foundation

## Initial job

`funnel-diagnostic-v1` finds the single most important measurable break in the 805 funnel and prepares one evidence-backed internal proposal. The funnel is:

`advertising -> website activity -> lead -> appointment -> quote -> sold customer -> install -> paid customer/revenue`

This is deliberately narrower than “run marketing.” It provides a useful learning loop without granting the agent production power.

## First production surface: CRM Sales Intelligence

The agent is a first-class embedded panel in the existing authenticated CRM Command Center / Sales Intelligence dashboard (`CrmApp`), not a separate application. Its initial Ventura County scope brings together Google leads, Yelp leads, and Facebook leads and compares exact lead-to-appointment-to-quote-to-sale-to-install-to-paid outcomes. The panel exposes purpose, boundaries, channel coverage, local analysis dimensions, evidence quality, a preview-only proposal, requested approvals, audit timeline, and success metrics.

It never converts absent integrations into zero performance. A channel without an exact lead ID and verified source is displayed as a data gap. CRM jobs without exact primary-channel attribution are excluded from comparisons. Supported analysis dimensions are service area/city, verified lead source, product interest, campaign/creative metadata when actually present, funnel stage, and outcome. This local implementation does not persist or alter any CRM record.

The panel also contains a non-automated discovery area for potentially useful Ventura County channels. Candidate channels remain research proposals until evidence, attribution feasibility, cost/risk review, and explicit human approvals exist; discovery cannot activate an account, spend, publish, or contact anyone.

## Operating contract

| Field | Contract |
| --- | --- |
| Trigger | Manual control-room preview. No cron is enabled. |
| Context | Read-only aggregate ad/site data; exact-ID CRM stages; approved creative patterns; prior proposal outcomes. |
| Tools | Read snapshots; calculate metrics; write only agent runs, proposals, approvals, evidence, and audit events; create preview artifacts. |
| Allowed actions | Diagnose data quality or a funnel break; draft one internal analysis/experiment; request approval; stop. |
| Human approval | Required before money, publication, pricing, customer/vendor communication, production CRM writes, or external-account operation. |
| Escalation | Stale/incomplete/contradictory data; non-exact identity; low sample; out-of-scope request; any limit reached. |
| Success | Historical diagnostic precision; approval rate; measured lift in qualified appointments/sold customers/installed revenue; zero unapproved actions. |
| Limits | Three iterations, one proposal, 30 seconds per run. |

The code contract lives in `src/lib/marketing-agent/governance.ts`. The deterministic first evaluator lives in `src/lib/marketing-agent/funnel-diagnostic.ts`. It does not call an LLM, ad network, messaging provider, or mutable CRM endpoint.

## Control room and durable memory

Migration `20260731110000_create_governed_marketing_agent.sql` provides four service-role-only stores:

- `crm_marketing_agent_runs`: trigger, input snapshot, budgets, metrics, and verifiable stop reason.
- `crm_marketing_proposals`: evidence, intended metric, state, required approvals, execution reference, and measured outcome.
- `crm_marketing_approvals`: append-only human decisions by approval kind and identity.
- `crm_marketing_agent_events`: ordered handoffs and audit events, optionally chained to a prior event.

These tables are the persistence model for the embedded Sales Intelligence control room: run history, proposed actions, approvals, outcomes, and handoffs. The current UI slice is read-only and computes safe empty/partial states from its existing in-memory dashboard data. No migration has been applied by this implementation and no production route or cron has been activated.

## Data prerequisites and current gaps

The repository captures website leads with UTM fields and sends a Meta `Lead` event when configured. CRM records cover appointments, quotes, sales, installs, bookkeeping payments, and revenue. The missing prerequisite is an exact, durable attribution spine from ad click/campaign and website session to lead, job/customer, quote, install, and collected revenue. Customer reporting must count each exact person once, sold if any exact linked record is sold; phone-only or fuzzy merges are prohibited.

Before historical evaluation:

1. Define immutable marketing touch/session identifiers and carry them into `leads`, then exact `lead_id` into `crm_jobs`.
2. Backfill only from proven identifiers; quarantine ambiguous joins.
3. Normalize event times to Los Angeles reporting windows while preserving UTC source timestamps.
4. Separate booked revenue, installed revenue, and collected revenue; retain refunds/credits and attribution window.
5. Import Meta/Google performance read-only with account, campaign, ad set, ad, creative, spend, impressions, clicks, and capture timestamp.
6. Establish minimum cohort sizes and freshness thresholds before producing recommendations.

## Evaluation gate before autonomy

Run the diagnostic offline against dated historical snapshots. A reviewer labels the true bottleneck, whether the proposal was useful, and whether the evidence was sufficient. Broader autonomy is allowed only after a documented evaluation set shows reliable decisions and zero policy violations. Agent prompt or policy changes are versioned and re-evaluated; the agent cannot rewrite its own rules.

## Phased expansion

1. **Foundation (implemented locally):** policy, bounded deterministic evaluator, durable schema, tests, and documentation.
2. **Read-only ingestion:** exact attribution spine plus Meta, Google, web analytics, and CRM snapshots; preview control-room API/UI; no external actions.
3. **Creative specialist:** turn approved install assets and observed customer problems into internal briefs, scripts, hooks, and a filming list. Use only assets with documented consent. No publishing.
4. **Experiment specialist:** propose creative matrices and forecast sample/budget needs. Human approves content, spend, targeting, and launch separately.
5. **Outcome specialist:** reconcile appointment, sold-customer, install, and collected-revenue outcomes; compare approved tests and record results.
6. **Earned limited execution:** only after historical and shadow evaluations, add narrowly scoped adapters with idempotency, allowlists, spend caps, expiry, kill switch, two-person approval for money, provider receipts, and post-action verification. Each specialist retains its own trigger, tools, permissions, limits, and success metric.

Open-ended loops, self-modifying policies, direct pricing changes, autonomous outreach, and unconstrained account access remain prohibited.

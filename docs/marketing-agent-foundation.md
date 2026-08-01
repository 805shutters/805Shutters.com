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

The code contract lives in `src/lib/marketing-agent/governance.ts`. The deterministic first evaluator lives in `src/lib/marketing-agent/funnel-diagnostic.ts`. Read-only connector contracts and normalized import adapters live in `src/lib/marketing-agent/channel-connectors.ts`; the preview campaign planner lives in `src/lib/marketing-agent/campaign-recommendation.ts`. None of these modules calls an LLM, ad network, messaging provider, or mutable CRM endpoint.

## Read-only channel integration layer

Google Ads, Yelp, and Meta each have a connector contract with an explicit configuration allowlist and the minimum read capabilities needed for campaign/reporting/lead data. Validation returns only missing environment-variable names and permission names; it never returns credential values. A connector fails closed when required read permissions are absent or when any mutation permission is present. Forbidden scopes cover campaign, billing, form, publishing, audience, messaging, and pricing changes.

The adapters accept caller-supplied exports or future read-only API results and normalize them to schema version 1. Every accepted event retains channel, provider record ID, account ID, source object, event and fetch timestamps, campaign/creative metadata, service area, product, offer, external lead ID, optional exact CRM lead ID, spend micros, and the read permissions used. Invalid timestamps, identifiers, event types, account provenance, or spend values are quarantined with machine-readable reasons. An external lead ID is never treated as a CRM identity; only an explicit `crmLeadId` marks an exact link.

No connector performs network I/O yet. This keeps credential provisioning separate from code validation and prevents a partially configured account from becoming an implicit production integration.

## Preview-only Ventura campaign planning

Sales Intelligence now builds one deterministic measurement candidate from exact CRM lead IDs and explicit primary-channel source fields. It selects the channel with the largest exact local evidence set, then derives area and product only from that channel's linked CRM rows. This rank is a data-availability choice, not a claim that the channel performs best. If evidence is absent, the UI says that area/product selection is pending rather than inventing values.

Every preview includes proposed channel, Ventura area, product and existing-consultation offer hypotheses, evidence counts, explicit data gaps, a lead-to-paid measurement plan, required approvals, and verifiable stop conditions. Fewer than 20 exact attributable leads, inconsistent funnel identity, stale/contradictory provenance, or any impending external action stops the plan. There is no launch control.

## Control room and durable memory

Migration `20260731110000_create_governed_marketing_agent.sql` provides four service-role-only stores:

- `crm_marketing_agent_runs`: trigger, input snapshot, budgets, metrics, and verifiable stop reason.
- `crm_marketing_proposals`: evidence, intended metric, state, required approvals, execution reference, and measured outcome.
- `crm_marketing_approvals`: append-only human decisions by approval kind and identity.
- `crm_marketing_agent_events`: ordered handoffs and audit events, optionally chained to a prior event.

These tables are the persistence model for the embedded Sales Intelligence control room: run history, proposed actions, approvals, outcomes, and handoffs. The foundation migration is deployed in production with row-level security and service-role-only policies. This next local phase does not add or apply a migration: the UI remains read-only and computes safe empty/partial states from existing in-memory dashboard data. No production route, connector fetch, or cron is activated by this phase.

## Data prerequisites and current gaps

### Verified connector readiness (2026-07-31)

- **Google Ads — grant required:** the client account is authenticated, but no API Center is available. Reporting remains unavailable until a manager-account developer token, OAuth credentials, exact customer ID, and a separately recorded read-only grant verification exist.
- **Meta Ads — grant required:** 805 owns the ad account, but the existing CAPI system user is assigned only to the pixel/dataset. No ad-account/Page reporting assignment or usable reporting token has been verified. The existing unsaved Meta draft is outside this system and must not be published or discarded.
- **Yelp — manual only:** authenticated owner reporting can be reviewed manually. Available integrations are scheduling tools, not a reporting or lead-data connector. Yelp cannot become API-ready by setting environment-shaped strings; it stays manual-only until partner eligibility or an approved ingestion path is documented.

Configuration presence is not live verification. A connector reaches `verified_read_only` only when required configuration, least-privilege permissions, exact account attribution, and a timestamped grant-evidence ID are all present. Imports without matching verification are quarantined. No live credentials or grants were added in this code phase.

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

1. **Foundation (deployed):** policy, bounded deterministic evaluator, durable schema, tests, documentation, and the embedded Sales Intelligence control room.
2. **Read-only ingestion contracts and campaign preview (implemented locally):** fail-closed Google, Yelp, and Meta configuration/permission validation; normalized provenance and quarantine handling; exact-ID CRM planning preview; no connector network calls or external actions.
3. **Credentialed read-only ingestion:** after account-owner authorization, add server-only fetchers for approved account IDs, immutable snapshots, freshness checks, and control-room run history. External write scopes remain rejected.
4. **Creative specialist:** turn approved install assets and observed customer problems into internal briefs, scripts, hooks, and a filming list. Use only assets with documented consent. No publishing.
5. **Experiment specialist:** propose creative matrices and forecast sample/budget needs. Human approves content, spend, targeting, and launch separately.
6. **Outcome specialist:** reconcile appointment, sold-customer, install, and collected-revenue outcomes; compare approved tests and record results.
7. **Earned limited execution:** only after historical and shadow evaluations, add narrowly scoped adapters with idempotency, allowlists, spend caps, expiry, kill switch, two-person approval for money, provider receipts, and post-action verification. Each specialist retains its own trigger, tools, permissions, limits, and success metric.

Open-ended loops, self-modifying policies, direct pricing changes, autonomous outreach, and unconstrained account access remain prohibited.

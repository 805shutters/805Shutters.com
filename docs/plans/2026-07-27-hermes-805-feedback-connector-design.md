# Hermes 805 CRM Feedback Connector Design

## Goal

Connect the local `shutters805` Hermes profile to Jessica's private CRM feedback queue. Hermes clarifies each topic in place, prepares a structured implementation proposal, and enforces separate revision-specific approvals for implementation and deployment.

## Architecture

A local Node worker polls the authenticated CRM integration endpoint. It claims an exact topic revision before any work, renews long claims, and sends every mutation with the claim token plus a deterministic external event ID. The worker invokes the default Hermes MTS bot for clarification/assessment decisions and validates the returned JSON before posting it. The dedicated 805 bot remains reserved for 805 CRM operational notifications and is not used by this workflow.

Approved implementation and deployment are separate state-machine lanes. Implementation may dispatch Codex only in the configured 805 repository. Deployment remains disabled unless the topic is exactly `deployment_approved` and the local release switch is enabled.

## Data Flow

1. Poll `GET /api/integrations/hermes/crm-feedback/?limit=20`.
2. Claim the exact request ID and revision as `home-mac-hermes`.
3. For `clarifying`, give the default Hermes MTS bot the topic plus complete conversation.
4. Post either up to three clarification questions or the required structured assessment and proposed work.
5. For `implementation_approved`, begin implementation and dispatch Codex in the authorized workspace.
6. Post verification evidence after tests, typecheck, build, and focused verification.
7. For `deployment_approved`, begin deployment only when release execution is locally enabled; then push/deploy/verify and mark completed.

## Safety

- Secrets are read from environment or Keychain and never included in prompts or logs.
- Approval messages use the MTS/Willie Telegram bot configuration, never the reserved 805 bot.
- Claims are revision-scoped and renewed; stale or foreign claims stop processing.
- Event IDs are stable across retries.
- Topic/revision approval is never reused.
- Release execution defaults off.
- Logs report lifecycle states separately and redact response bodies.
- The worker refuses workspaces outside the configured 805 repository.

## Verification

Unit tests cover request authentication, claims, stable event IDs, clarification limits, structured assessment validation, stale revisions, release gating, and redaction. Integration verification uses the production endpoint only when the migration, production secret, and matching local secret are configured.

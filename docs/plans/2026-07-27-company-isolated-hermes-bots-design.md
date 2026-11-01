# Company-Isolated Hermes Bots Design

## Current status

Hermes is no longer used. Repository instructions send coding work through Codex and the verified Vercel release path. The 805 feedback worker still in this repo, `scripts/hermes-805-crm-feedback-worker.mjs`, defaults its profile to `~/.hermes/profiles/shutters805seo`, not `shutters805`. The launch agent writes logs under `~/.hermes/profiles/shutters805seo/logs`.

## Goal

This note records the isolated 805 and MTS boundaries. Hermes is no longer used. Company identity stays fixed at every boundary that remains in code; no credential, queue, callback, approval, workspace, log, state, or fallback may cross between them.

## Selected Architecture

The recorded boundary was two independent runtimes, not a tenant router. Hermes is no longer used:

| Boundary | MTS | 805 |
|---|---|---|
| Hermes profile | default `~/.hermes` | `~/.hermes/profiles/shutters805seo` |
| Worker identity | `home-mac-hermes-mts` | `home-mac-hermes-805` |
| Shared secret | `HERMES_MTS_SHARED_SECRET` | `HERMES_805_SHARED_SECRET` |
| Telegram credentials | `MTS_TELEGRAM_*` | `SHUTTERS_805_TELEGRAM_*` |
| API namespace | `/api/integrations/hermes/mts/*` | `/api/integrations/hermes/805/*` |
| Telegram webhook | `/api/integrations/mts/telegram` | `/api/integrations/805/telegram` |
| Workspace | MTS repository only | 805 repository only |
| Logs/state | default MTS profile | `shutters805seo` profile |
| Release switch | `HERMES_MTS_RELEASE_ENABLED` | `HERMES_805_RELEASE_ENABLED` |

The two systems may follow the same documented protocol, but they do not share a running worker, environment namespace, webhook, queue, claim token, event ID prefix, or deployment command.

## 805 Jessica Feedback Flow

Jessica's 805 CRM feedback is owned entirely by the 805 system:

1. The 805 worker polls `/api/integrations/hermes/805/crm-feedback`.
2. It authenticates only with `HERMES_805_SHARED_SECRET`.
3. It claims as `home-mac-hermes-805`.
4. It invokes only the `shutters805seo` Hermes profile.
5. Clarifications remain inside the 805 CRM topic.
6. Implementation and deployment approval buttons are sent only by the 805 Telegram bot.
7. Callback data carries an immutable `company=805` scope and is accepted only by the 805 webhook.
8. Codex may enter only the 805 repository.
9. Logs and durable state remain under the `shutters805seo` profile.

## MTS Mirror

MTS follows the same lifecycle with MTS-only identifiers. MTS buttons are emitted only by the MTS Telegram bot and accepted only by the MTS webhook. MTS workers refuse 805 topics, 805 secrets, 805 callbacks, and the 805 workspace.

## Enforcement

- Each topic and approval record stores `company_scope`.
- Queue queries filter exact `company_scope`.
- Claims and external event IDs include the company prefix.
- API routes reject a mismatched company header or payload.
- Telegram callback signatures include company scope.
- Environment validation fails if a forbidden other-company variable is present.
- There is no fallback from one bot to the other.
- Release execution defaults disabled independently for each company.

## Deployment

805 and MTS ship independently. A deployment approval from one company cannot authorize code, migrations, configuration, or deployment for the other. Live verification must authenticate against the originating company's CRM.

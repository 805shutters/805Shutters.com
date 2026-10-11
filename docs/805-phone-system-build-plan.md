# 805 Shutters phone system

Use the existing dedicated 805 Supabase project for call controls and history, Twilio for carrier calls, and direct SIP audio to the dedicated xAI hosted receptionist. Render is not part of this deployment.

Every incoming caller hears “Hi, thank you for calling 805 Shutters.” immediately while a phone-number CRM lookup begins. A unique known customer gets a safe first-name greeting and status-specific assistance. Ambiguous numbers require clarification. Unknown callers hear the team-connection line and go directly to simultaneous Mike/Jessica private-cell ringing during configured hours. The first person to press 1 takes the call.

Staff can hold, consult privately, transfer and resume. AI audio must end before the caller joins a staff conversation. No-answer recovery collects a durable callback message. Shared CRM Call Center history, customer links, resolve/reopen and message-only red navigation count remain part of acceptance. Private phone numbers come from existing approved workflows.

The first deployment uses the separate 805 temporary Twilio number. Existing production numbers and MTS routes remain unchanged. Porting is a later separately authorized cutover after live pilot acceptance.

See [current implementation status](phone-system/implementation-status.md), [deployment runbook](phone-system/supabase-deployment.md), and [reviewed agent draft](phone-system/805-receptionist-draft.txt). Local tests, source publication and a website deployment do not establish an operational phone service.

# 805 phone system — execution plan

- Completed: published the Call Center website; installed migration 20261011014441 in the dedicated 805 production project through its authenticated dashboard; verified exact migration source, RLS denial for browser roles, service lookup and stale-write rejection; deployed the pinned backend in standby; saved the approved 24/7 Pacific ringing schedule with no holiday closures; updated the hosted receptionist draft.
- In progress: publish and redeploy the hosted-gateway routing correction found during live endpoint verification. The Supabase runtime strips /functions/v1; signatures must still use the full public URL.
- Remaining: secure provider/website configuration and watchdog; hosted-agent trusted call-token/tool and greeting-audio binding; temporary-number routing; actual handset/audio/transfer and approved alert pilot.
- Access intervention: Twilio currently shows its email sign-in screen. The Supabase dashboard and xAI console are accessible. The CLI/MCP management identity still lacks the dedicated 805 project, so use the correct authenticated dashboard until that identity is connected.
- User decision: ring Mike and Jessica all hours, all days. Keep activation flags false until the provider contract and temporary-number acceptance checks pass.
- Existing MTS and production routes remain untouched. No Render, no port. Calling stays disabled until all activation checks pass.

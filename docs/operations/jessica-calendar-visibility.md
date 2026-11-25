# Jessica's calendar visibility

Every active CRM calendar entry syncs to both `805@805shutters.com` and
`jessica@805shutters.com`, regardless of its assignee. Reassigning a visit updates
both copies in place. Cancellation removes both copies. The CRM assignment
continues to identify who performs the visit.

Google event titles end with `— Assigned to: <name>`. The description starts
with the same assignment, followed by the existing appointment notes. Empty
assignments display `Unassigned`. Apple Calendar receives these fields through
Jessica's existing Google account calendar sync.

## Refresh existing appointments

After verifying the production deployment, run
`scripts/sql/refresh-jessica-calendar-sync.sql` in a transaction with
`crm.jessica_calendar_refresh` set to `apply`. The script requeues only Google
Calendar effects for active entries from today's Pacific date onward. It
preserves existing Google event IDs, adopts legacy booking effects, keeps
in-flight effects processing, and creates missing outbox rows. Repeating it
does not create additional effects for the same appointment.

Safety review: no schema changes, appointment/assignment edits, customer email
or SMS effects, credential changes, or historical/canceled appointment refreshes.
The existing worker performs Google writes without attendees or invitation mail.
Do not run the refresh before the new worker is live.

Verify that every refreshed effect finishes as `sent` with no error, and each
active appointment has IDs for both calendars. In Apple Calendar, inspect a
visit assigned to someone other than Jessica and check its assignment label.
Server verification cannot confirm whether her device has refreshed its cache.

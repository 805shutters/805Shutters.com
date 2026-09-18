import { pathToFileURL } from "node:url";

// Exact canonical API URL, including trailing slash. Reject ALL redirects;
// never forward credentials or accept a website/login/interstitial as success.
export const reminderServiceUrl = "https://www.805shutters.com/api/cron/appointment-reminders/";
export async function checkAppointmentReminderService(secret, fetcher = fetch, dryRun = true) {
  if (!secret) throw new Error("Appointment reminder cron secret is missing");
  const response = await fetcher(`${reminderServiceUrl}${dryRun ? "?dry_run=true" : ""}`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(65000),
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
  });
  if (response.status !== 200 || response.redirected) throw new Error(`Reminder service HTTP ${response.status}; redirects are failures`);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Reminder service returned an interstitial or non-JSON response");
  const body = await response.json();
  if (body?.service !== "805-appointment-notifications-v1" || body.kind !== "reminder" || body.mode !== (dryRun ? "dry_run" : "live") ||
    !["completed", "outside_window"].includes(body.status) || body.failed !== 0 ||
    ![body.planned, body.accepted, body.skipped].every(n => Number.isInteger(n) && n >= 0) ||
    (dryRun && body.accepted !== 0)) throw new Error("Reminder service did not acknowledge the expected contract");
  return body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkAppointmentReminderService(process.env.APPOINTMENT_REMINDER_CRON_SECRET)
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(`::error::${error.message}`); process.exitCode = 1; });
}

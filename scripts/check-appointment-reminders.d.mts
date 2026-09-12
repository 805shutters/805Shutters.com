export const reminderServiceUrl: string;
export function checkAppointmentReminderService(secret: string | undefined, fetcher?: typeof fetch, dryRun?: boolean): Promise<{
  service: string; kind: "reminder"; mode: "live" | "dry_run";
  status: "completed" | "outside_window"; accepted: number; failed: number; skipped: number; planned: number;
}>;

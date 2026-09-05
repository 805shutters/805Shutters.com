import { CrmAuthError } from "./auth";
import { isCrmOwnerAdminEmail } from "./allowed-users";
import type { JobProgress } from "./job-progress";
export function assertCloseoutReady(
  progress: JobProgress[],
  actor: string,
  exception?: string,
) {
  if (exception) {
    if (!isCrmOwnerAdminEmail(actor))
      throw new CrmAuthError(
        403,
        "Only Mike can record a manager closeout exception.",
      );
    if (exception.trim().length < 12)
      throw new CrmAuthError(
        400,
        "Document the remaining obligations and reason for the exception.",
      );
    return;
  }
  if (
    !progress.length ||
    progress.some(
      (p) =>
        p.commercial !== "accepted" ||
        p.installation !== "complete" ||
        p.service === "open" ||
        p.payment !== "settled" ||
        p.stage !== "complete" ||
        p.confidence !== "confirmed",
    )
  )
    throw new CrmAuthError(
      409,
      "Closeout needs verified completion of every purchased order, resolved service, and settled balances. Review the remaining evidence or record a manager exception.",
    );
}
export async function verifyOperationalCloseout(
  db: import("@supabase/supabase-js").SupabaseClient,
  target: { quoteId?: string; jobId?: string; bookkeepingEntryId?: string },
  actor: string,
  exception?: string,
) {
  if (exception) {
    assertCloseoutReady([], actor, exception);
    return;
  }
  const { loadCrmDashboardData } = await import("./backend");
  const { buildJobTrackingView } = await import("./job-tracking-view");
  const data = await loadCrmDashboardData(db);
  const items = buildJobTrackingView({
    jobs: data.jobs,
    quotes: data.quotes,
    rows: data.bookkeepingRows,
    files: data.customerFiles,
    installerOutcomes: data.installerOutcomes,
    ownedActions: data.ownedActions,
    fulfillment: data.fulfillment,
    sourceHealth: data.sourceHealth,
    orderCogsEmails: data.orderCogsEmails,
    installationInvoiceEmails: data.installationInvoiceEmails,
  });
  const selected = items.filter((i) =>
    target.quoteId
      ? i.progress.identity.quoteId === target.quoteId
      : target.bookkeepingEntryId
        ? i.progress.identity.bookkeepingId === target.bookkeepingEntryId
        : i.progress.identity.jobId === target.jobId && i.isSale,
  );
  assertCloseoutReady(
    selected.map((i) => i.progress),
    actor,
  );
}

export type CallSummaryState = {
  summary?: { text?: string; outcome?: string; streamDetached?: boolean } | null;
  summarySync?: string | null;
  summaryJobId?: string | null;
  matchStatus?: string | null;
};

export function callSummaryPresentation(call: CallSummaryState) {
  const text = call.summary?.text?.trim() || "";
  if (!text) return null;
  let sync = "Saved on this call. No single customer is linked, so no customer or job file was updated.";
  if (call.summarySync === "synced" && call.summaryJobId)
    sync = "Saved on this call and written to the customer and the matching job.";
  else if (call.summarySync === "synced")
    sync = "Saved on this call and written to the customer file.";
  else if (call.summarySync === "pending")
    sync = "Saved on this call. Customer activity is still syncing.";
  else if (call.summarySync === "failed")
    sync = "Saved on this call. Customer activity could not be saved.";
  else if (call.matchStatus === "ambiguous")
    sync = "Saved on this call. The number matches more than one customer, so no customer or job file was updated.";
  return { text, sync, streamDetached: call.summary?.streamDetached === true };
}

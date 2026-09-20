import { processOrderCogsInbox, type ProcessOrderCogsOptions, type ProcessOrderCogsResult } from "./order-cogs";

const MAILBOXES = ["805shutters@gmail.com", "805@805shutters.com"] as const;
const COUNTS = ["scanned", "processed", "matched", "needsReview", "unmatched", "skipped", "errors", "archived", "archiveErrors", "telegramSent", "telegramErrors", "applied", "addedCogs", "recordErrors", "deferred"] as const;

/** Sequential writes let forwarded copies reuse the first mailbox's saved invoice. */
export async function processScheduledOrderMailboxes(
  supabase: Parameters<typeof processOrderCogsInbox>[0],
  options: ProcessOrderCogsOptions = {},
  processInbox = processOrderCogsInbox,
) {
  const mailboxes: Omit<ProcessOrderCogsResult, "emails">[] = [];
  const combined: ProcessOrderCogsResult = {
    mailbox: MAILBOXES[0], query: "Scheduled order email intake across both 805 mailboxes",
    scanned: 0, processed: 0, matched: 0, needsReview: 0, unmatched: 0, skipped: 0,
    errors: 0, archived: 0, archiveErrors: 0, telegramSent: 0, telegramErrors: 0, emails: [],
  };
  for (const mailbox of MAILBOXES) {
    try {
      const result = await processInbox(supabase, {
        ...options, mailbox, autoApply: false, productAutoApply: true, archive: false,
        maxRunMs: Math.min(options.maxRunMs || 220_000, 220_000) / MAILBOXES.length,
      });
      const { emails: _emails, ...summary } = result;
      mailboxes.push(summary);
      for (const key of COUNTS) combined[key] = (combined[key] || 0) + (result[key] || 0);
    } catch {
      // Report the failed account but continue the independent mailbox; never log message bodies.
      combined.errors += 1;
      mailboxes.push({ mailbox, query: "Mailbox scan failed", errors: 1, scanned: 0, processed: 0,
        matched: 0, needsReview: 0, unmatched: 0, skipped: 0, archived: 0, archiveErrors: 0, telegramSent: 0, telegramErrors: 0,
        lastError: "Order email mailbox could not be processed. Check its account connection." });
    }
  }
  return { ...combined, mailboxes };
}

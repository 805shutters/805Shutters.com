import { describe, expect, it, vi } from "vitest";
import { processScheduledOrderMailboxes } from "./order-cogs-mailboxes";
import type { ProcessOrderCogsResult } from "./order-cogs";

const empty: ProcessOrderCogsResult = { mailbox: "", query: "orders", scanned: 0, processed: 0, matched: 0,
  needsReview: 0, unmatched: 0, skipped: 0, errors: 0, archived: 0, archiveErrors: 0,
  telegramSent: 0, telegramErrors: 0, emails: [] };

describe("scheduled order mailboxes", () => {
  it("finishes each mailbox before starting the next and preserves deferred counts", async () => {
    let finishedFirst = false;
    const processInbox = vi.fn(async (_db, options) => {
      if (options.mailbox === "805shutters@gmail.com") {
        await Promise.resolve(); finishedFirst = true;
        return { ...empty, mailbox: options.mailbox, processed: 3, applied: 1, addedCogs: 123, deferred: 9 };
      }
      expect(finishedFirst).toBe(true);
      return { ...empty, mailbox: options.mailbox, processed: 2, addedCogs: 0 };
    });
    const result = await processScheduledOrderMailboxes({} as never, { maxRunMs: 230_000 }, processInbox);
    expect(result).toMatchObject({ processed: 5, applied: 1, addedCogs: 123, deferred: 9, errors: 0 });
    expect(result.mailboxes.map(row => row.mailbox)).toEqual(["805shutters@gmail.com", "805@805shutters.com"]);
    expect(processInbox).toHaveBeenCalledTimes(2);
    expect(processInbox.mock.calls.every(([, options]) => options.maxRunMs === 110_000 && options.productAutoApply && options.autoApply === false && options.archive === false)).toBe(true);
  });
  it.each(["805shutters@gmail.com", "805@805shutters.com"])("continues after %s fails and reports its failure separately", async failed => {
    const processInbox = vi.fn(async (_db, options) => {
      if (options.mailbox === failed) throw new Error("private upstream details");
      return { ...empty, mailbox: options.mailbox, processed: 5, applied: 1 };
    });
    const result = await processScheduledOrderMailboxes({} as never, {}, processInbox);
    expect(result).toMatchObject({ processed: 5, applied: 1, errors: 1 });
    expect(result.mailboxes.find(row => row.mailbox === failed)).toMatchObject({ processed: 0, errors: 1 });
    expect(JSON.stringify(result)).not.toContain("private upstream details");
  });
});

import { expect, it, vi } from "vitest";
import { deliverStripeRequest } from "./stripe-delivery";
function fixture() {
  let row: any;
  let failSave = false;
  const db: any = {
    from: () => {
      let operation = "",
        value: any,
        filters: Record<string, unknown> = {},
        selected = false;
      const q: any = {
        upsert: (v: any) => {
          if (!row) row = { id: "delivery", status: "pending", ...v };
          return Promise.resolve({ error: null });
        },
        select: () => {
          selected = true;
          return q;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        single: () => Promise.resolve({ data: row, error: null }),
        update: (v: any) => {
          operation = "update";
          value = v;
          return q;
        },
        then: (resolve: any) => {
          const match = Object.entries(filters).every(([k, v]) => row[k] === v);
          if (operation === "update" && match) {
            if (failSave && value.result)
              return Promise.resolve({ error: { message: "lost" } }).then(
                resolve,
              );
            Object.assign(row, value);
          }
          return Promise.resolve({
            data: selected && match ? [{ id: row.id }] : [],
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  return {
    db,
    get: () => row,
    loseSave: () => {
      failSave = true;
    },
  };
}
it("submits a reviewed message once across retries and concurrent attempts", async () => {
  const f = fixture(),
    sender = vi.fn().mockResolvedValue({ sent: true, id: "message1" });
  const run = () =>
    deliverStripeRequest(
      f.db,
      "request",
      "email",
      "person@example.test",
      undefined,
      { subject: "Payment", body: "Same" },
      sender,
    );
  const results = await Promise.all([run(), run()]);
  expect(sender).toHaveBeenCalledTimes(1);
  expect(results.some((r) => r.sent)).toBe(true);
  expect((await run()).sent).toBe(true);
  expect(sender).toHaveBeenCalledTimes(1);
});
it("holds unknown provider outcomes and lost acknowledgements without resubmitting", async () => {
  const f = fixture(),
    sender = vi.fn().mockRejectedValue(new Error("timeout"));
  const run = () =>
    deliverStripeRequest(
      f.db,
      "request",
      "text",
      "+18055550100",
      undefined,
      "message",
      sender,
    );
  expect((await run()).uncertain).toBe(true);
  expect((await run()).uncertain).toBe(true);
  expect(sender).toHaveBeenCalledTimes(1);
  const lost = fixture();
  lost.loseSave();
  const accepted = vi.fn().mockResolvedValue({ sent: true });
  const retry = () =>
    deliverStripeRequest(
      lost.db,
      "request",
      "email",
      "person@example.test",
      undefined,
      "message",
      accepted,
    );
  expect((await retry()).uncertain).toBe(true);
  expect((await retry()).sent).toBe(false);
  expect(accepted).toHaveBeenCalledTimes(1);
});
it("rejects changed recipient or content under the same delivery identity", async () => {
  const f = fixture(),
    sender = vi.fn().mockResolvedValue({ sent: true });
  await deliverStripeRequest(
    f.db,
    "request",
    "email",
    "one@example.test",
    "same",
    "original",
    sender,
  );
  await expect(
    deliverStripeRequest(
      f.db,
      "request",
      "email",
      "two@example.test",
      "same",
      "changed",
      sender,
    ),
  ).rejects.toThrow("different message");
  expect(sender).toHaveBeenCalledTimes(1);
});

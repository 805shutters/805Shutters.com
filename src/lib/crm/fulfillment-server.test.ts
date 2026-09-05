import { afterEach, expect, it, vi } from "vitest";
import { loadPublicQuoteById } from "./public-quote";
import {
  loadPurchasedFulfillmentScope,
  saveFulfillment,
} from "./fulfillment-server";
vi.mock("./public-quote", () => ({ loadPublicQuoteById: vi.fn() }));
const quote = "10000000-0000-4000-8000-000000000001",
  job = "10000000-0000-4000-8000-000000000002";
const id = "10000000-0000-4000-8000-000000000003",
  requestId = "10000000-0000-4000-8000-000000000004";
function fixture(signed_at: string | null = "2026-09-01T18:00:00Z") {
  const rpc = vi.fn().mockResolvedValue({ data: { id }, error: null });
  const db = {
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: quote, job_id: job, signed_at } }),
        }),
      }),
    }),
  };
  vi.mocked(loadPublicQuoteById).mockResolvedValue({
    lines: [
      {
        id: "opening-a",
        room: "Kitchen",
        quantity: 2,
        productName: "Shutter",
        styleName: "A",
        options: { color: "white" },
      },
    ],
  } as never);
  return { db: db as never, rpc };
}
afterEach(() => vi.useRealTimers());
it("uses purchased quantities and detects approved product changes", async () => {
  const { db, rpc } = fixture();
  const first = await loadPurchasedFulfillmentScope(db, quote);
  await saveFulfillment(
    db,
    {
      kind: "line",
      id,
      requestId,
      expectedRevision: 0,
      payload: {
        quote_id: quote,
        job_id: job,
        reason: "Reviewed signed scope",
        source_line_id: "opening-a",
        quantity: 999,
        vendor_name: "Fixture",
        state: "unprepared",
      },
    },
    "owner",
  );
  expect(rpc.mock.calls[0][1].p_payload.quantity).toBe(2);
  vi.mocked(loadPublicQuoteById).mockResolvedValue({
    lines: [
      {
        id: "opening-a",
        room: "Kitchen",
        quantity: 2,
        productName: "Shutter",
        styleName: "B",
        options: { color: "white" },
      },
    ],
  } as never);
  expect(
    (await loadPurchasedFulfillmentScope(db, quote)).source_revision,
  ).not.toBe(first.source_revision);
});
it("rejects unsigned scope and future physical evidence without writes", async () => {
  const { db, rpc } = fixture(null);
  await expect(loadPurchasedFulfillmentScope(db, quote)).rejects.toMatchObject({
    status: 409,
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-05T02:00:00Z"));
  await expect(
    saveFulfillment(
      db,
      {
        kind: "movement",
        id,
        requestId,
        expectedRevision: 0,
        payload: {
          quote_id: quote,
          job_id: job,
          line_id: id,
          reason: "Fixture",
          kind: "received",
          quantity: 1,
          occurred_on: "2026-09-05",
          evidence: "Fixture receipt",
        },
      },
      "owner",
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(rpc).not.toHaveBeenCalled();
});

import { describe, expect, it } from "vitest";
import { frontDoorDraftCard, frontDoorDraftCards, visibleFrontDoorDrafts } from "@/lib/crm/quote-front-door-draft-view";
import { listQuoteFrontDoorDrafts, type QuoteFrontDoorDb } from "@/lib/crm/quote-front-door-server";

const row = {
  id: "draft-1",
  created_at: "2026-11-21T16:00:00Z",
  customer_name: "Jane Smith",
  customer_phone: "+18055550100",
  customer_address: "1 Main St",
  manufacturer: "Norman",
  category: "roller",
  multiplier: "2.500",
  read_back: "Norman roller\nRoom: Office\nMultiplier: 2.5",
  status: "draft",
};

describe("front-door drafts on the quote screen", () => {
  it("labels a draft as read only and drops anything that is not a draft", () => {
    expect(frontDoorDraftCard(row)).toMatchObject({
      id: "draft-1",
      customerName: "Jane Smith",
      multiplier: "2.5",
      status: "draft",
      label: "Front-door draft",
      readOnly: true,
      sent: false,
    });
    expect(frontDoorDraftCard({ ...row, status: "sent" })).toBeNull();
    expect(frontDoorDraftCards([row, { ...row, id: "sold", status: "sold" }, { id: "sales", customer_name: "Taylor", status: "draft" }])).toHaveLength(1);
  });

  it("keeps drafts on the draft view and matches the quote search", () => {
    const [draft] = frontDoorDraftCards([row]);
    expect(visibleFrontDoorDrafts([draft], "all", "")).toHaveLength(1);
    expect(visibleFrontDoorDrafts([draft], "draft", "jane")).toHaveLength(1);
    expect(visibleFrontDoorDrafts([draft], "draft", "other person")).toEqual([]);
    expect(visibleFrontDoorDrafts([draft], "sent", "jane")).toEqual([]);
    expect(visibleFrontDoorDrafts([draft], "sold", "")).toEqual([]);
  });

  it("lists drafts with a select and does not insert or send", async () => {
    const calls: string[] = [];
    const filter = {
      eq: () => filter,
      is: () => filter,
      or: () => filter,
      in: () => filter,
      order: () => filter,
      limit: async () => {
        calls.push("select");
        return { data: [row, { ...row, id: "sent-row", status: "sent" }], error: null };
      },
    };
    const db: QuoteFrontDoorDb = {
      rpc: async () => { throw new Error("list does not call a sequence function"); },
      from(table: string) {
        calls.push(table);
        return {
          select: () => filter,
          insert: () => { throw new Error("list does not insert"); },
        };
      },
    };
    const drafts = await listQuoteFrontDoorDrafts(db);
    expect(calls).toEqual(["crm_quote_front_door_drafts", "select"]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ sent: false, readOnly: true, label: "Front-door draft" });
  });
});

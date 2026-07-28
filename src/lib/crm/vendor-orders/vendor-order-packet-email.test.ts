import { describe, expect, it } from "vitest";
import { buildVendorOrderPacketEmail } from "./vendor-order-packet-email";

describe("vendor order packet email", () => {
  it("builds a manufacturer-specific Codex packet for the 805 inbox", () => {
    const result = buildVendorOrderPacketEmail({
      id: "task-123",
      manufacturer: "Onyx",
      product_type: "vinyl",
      source_kind: "submitted_technical_measure",
      source_revision: "measure-2",
      customer_snapshot: { name: "Earline Costello", address: "2209 Barbara Dr" },
      quote_snapshot: { quoteNumber: "805-0138" },
      routing_keys: ["onyx:shutters:vinyl"],
      product_names: ["Vinyl Shutter"],
      line_count: 1,
      portal_url: "https://admin.onyxshutters.com/default.aspx",
      order_packet_url: "/api/crm/vendor-order-packets/quote-1?manufacturer=onyx&format=html",
      payload: {
        lines: [{
          routingKey: "onyx:shutters:vinyl",
          productName: "Vinyl Shutter",
          sourceValues: { room: "Living Room", width_in: 22.5, height_in: 70.5 },
        }],
      },
    });

    expect(result.recipient).toBe("805@805shutters.com");
    expect(result.subject).toContain("Earline Costello · Onyx · 805-0138");
    expect(result.text).toContain("Prepare the manufacturer order as a draft");
    expect(result.attachments.map((attachment) => attachment.filename)).toEqual([
      "805-0138-Onyx-Codex-Order-Packet.html",
      "805-0138-Onyx-Codex-Order-Packet.json",
    ]);
    const json = JSON.parse(Buffer.from(result.attachments[1].content, "base64").toString("utf8"));
    expect(json.safety).toBe("draft_entry_only_review_before_submission");
    expect(json.order.lines[0].sourceValues).toMatchObject({
      room: "Living Room",
      width_in: 22.5,
      height_in: 70.5,
    });
  });
});

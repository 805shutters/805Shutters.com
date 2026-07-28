import { describe, expect, it } from "vitest";
import { buildVendorOrderPacketEmail } from "./vendor-order-packet-email";

describe("vendor order packet email", () => {
  it("builds a simple manufacturer PDF packet for the 805 inbox", async () => {
    const result = await buildVendorOrderPacketEmail({
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
    expect(result.subject).toBe("Earline Costello - Agentic Order Form");
    expect(result.text).toBe("Manufacturers: Onyx");
    expect(result.html).toBe("<p>Manufacturers: Onyx</p>");
    expect(result.attachments.map((attachment) => attachment.filename)).toEqual([
      "Earline-Costello-Onyx-Agentic-Order-Form.pdf",
    ]);
    const pdf = Buffer.from(result.attachments[0].content, "base64").toString("latin1");
    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(result.packet.safety).toBe("draft_entry_only_review_before_submission");
    const order = result.packet.order as { lines: Array<{ sourceValues: Record<string, unknown> }> };
    expect(order.lines[0].sourceValues).toMatchObject({
      room: "Living Room",
      width_in: 22.5,
      height_in: 70.5,
    });
  });
});

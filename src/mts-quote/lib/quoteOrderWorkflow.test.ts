import { describe, expect, it } from "vitest";
import { getRollerShadeOrderReadiness } from "./quoteOrderWorkflow";
import type { SalesQuoteDesign, SalesQuoteWithItems, QuoteLineItemWithDesigns } from "@mts/types/quote";

function rollerDesign(overrides: Partial<SalesQuoteDesign> = {}): SalesQuoteDesign {
  return {
    id: "design-1",
    line_item_id: "line-1",
    variant: "A",
    product_type: "Roller Shades",
    supplier: "Norman",
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside Mount",
    shade_type: "Single Shade",
    lift_system: "Cordless",
    valance: "No Valance",
    fabric: "Callie",
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 250,
    notes: null,
    options_json: { hem_bar: "Fabric Covered" },
    created_at: "",
    ...overrides,
  };
}

function rollerLine(design: SalesQuoteDesign = rollerDesign()): QuoteLineItemWithDesigns {
  return {
    id: "line-1",
    quote_id: "quote-1",
    room_name: "Dining Room",
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity: 1,
    sort_order: 1,
    created_at: "",
    designs: [design],
  };
}

function quote(lineItem: QuoteLineItemWithDesigns): SalesQuoteWithItems {
  return {
    id: "quote-1",
    quote_number: "Q-1",
    account_id: "acct-1",
    status: "sold",
    customer_name: "Customer",
    customer_email: null,
    customer_phone: null,
    customer_address: null,
    appointment_date: null,
    installer_notes: null,
    product_cost: 0,
    total_amount: 250,
    profit_amount: 250,
    deposit_paid: 0,
    balance_paid: 0,
    payment_method: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    share_token: "token",
    created_by: null,
    sales_owner: null,
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    created_job_id: null,
    quote_group_id: null,
    quote_letter: "A",
    sent_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    sent_via: null,
    manufacturer_order_ref: null,
    manufacturer_cost: 0,
    manufacturer_name: null,
    created_at: "",
    updated_at: "",
    line_items: [lineItem],
  };
}

describe("getRollerShadeOrderReadiness", () => {
  it("requires roller hem bar as a mandatory selection", () => {
    const readiness = getRollerShadeOrderReadiness(
      quote(rollerLine(rollerDesign({ options_json: {} })))
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.missingFields).toContain("Dining Room: hem bar");
  });

  it("requires motor type for motorized rollers without requiring a hidden remote", () => {
    const readiness = getRollerShadeOrderReadiness(
      quote(
        rollerLine(
          rollerDesign({
            lift_system: "Motorized",
            motor_type: "Single Motor (Battery)",
            remote_type: null,
          })
        )
      )
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.missingFields).not.toContain("Dining Room: remote type");
  });
});

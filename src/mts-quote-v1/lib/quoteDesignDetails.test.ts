import { describe, expect, it } from "vitest";
import { getQuoteDesignDetails } from "./quoteDesignDetails";
import type { SalesQuoteDesign } from "@mts-v1/types/quote";

function miniBlindDesign(): SalesQuoteDesign {
  return {
    id: "design-1",
    line_item_id: "line-1",
    variant: "A",
    product_type: "Mini Blinds",
    supplier: "Norman",
    material: "CityLights Cordless Aluminum Blinds",
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside Mount",
    shade_type: null,
    lift_system: null,
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 273,
    notes: null,
    options_json: {
      fabric_color_code: "7024",
      fabric_color_name: "Pure White",
      slat_size: '1"',
    },
    created_at: "",
  };
}

describe("getQuoteDesignDetails", () => {
  it("labels CityLights mini-blind colors as colors on customer output", () => {
    const details = getQuoteDesignDetails(miniBlindDesign());

    expect(details).toContainEqual({ label: "Color", value: "7024 - Pure White" });
    expect(details).toContainEqual({ label: "Slat Size", value: '1"' });
  });
});

import { describe, expect, it } from "vitest";
import type { SalesQuoteDesign } from "@mts/types/quote";
import {
  QUOTE_V2_SELECTED_DESIGN_MARKER,
  preferredSavedQuoteVariant,
  resolveSelectedQuoteDesign,
  type SelectionMarkedQuoteDesign,
} from "./selected-design";

function design(
  variant: string,
  selected = false,
): SelectionMarkedQuoteDesign {
  return {
    id: `design-${variant}`,
    line_item_id: "line-1",
    variant,
    product_type: "Shutters",
    supplier: variant === "C" ? "Onyx" : "Norman",
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: null,
    shade_type: null,
    lift_system: null,
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 0,
    notes: null,
    options_json: {},
    created_at: "2026-07-21T00:00:00.000Z",
    [QUOTE_V2_SELECTED_DESIGN_MARKER]: selected,
  } satisfies SalesQuoteDesign & {
    [QUOTE_V2_SELECTED_DESIGN_MARKER]?: boolean;
  };
}

describe("selected quote design projection", () => {
  it("restores a selected alternative instead of falling back to A", () => {
    const designs = [design("A"), design("C", true)];
    expect(resolveSelectedQuoteDesign(designs)?.supplier).toBe("Onyx");
    expect(preferredSavedQuoteVariant(designs, ["A", "B", "C"])).toBe("C");
  });

  it("preserves the legacy A-first behavior without authoritative evidence", () => {
    const designs = [design("C"), design("A")];
    expect(resolveSelectedQuoteDesign(designs)?.variant).toBe("A");
    expect(preferredSavedQuoteVariant(designs, ["A", "B", "C"])).toBe("A");
  });
});

import { describe, expect, it } from "vitest";
import type { SelectionContext, SelectionRecord } from "./core";
import {
  canonicalNormanShadeMotorizationSelectionsFromConfiguration,
  resolveNormanShadeMotorization,
  validateNormanShadeMotorization,
} from "./norman-shade-motorization";

const STEP = 1 / 16;

function selection(
  productId: "honeycomb" | "roman",
  configuration: SelectionRecord,
  widthInches = 36,
  heightInches = 60,
): SelectionContext {
  return {
    manufacturerId: "norman",
    productId,
    programId: productId === "honeycomb" ? "honeycomb-test" : "roman-test",
    catalogVersion: "805-v2-norman-2026-07",
    catalogAsOf: "2026-07-22",
    widthInches,
    heightInches,
    quantity: 1,
    configuration,
    options: {},
  };
}

function honeycomb(
  configuration: SelectionRecord = {},
  widthInches = 36,
  heightInches = 60,
): SelectionContext {
  return selection(
    "honeycomb",
    {
      application: "Standard Horizontal",
      lift_system: "Norman Smart Motorized Bottom Up",
      fabric_collection: "Light Filtering",
      motor_type:
        "Norman Smart Rechargeable Battery with Wireless Charging Wand",
      motor_position: "Right",
      hub_required: false,
      ...configuration,
    },
    widthInches,
    heightInches,
  );
}

function roman(
  configuration: SelectionRecord = {},
  widthInches = 36,
  heightInches = 60,
): SelectionContext {
  return selection(
    "roman",
    {
      shade_type: "Single",
      lift_system: "Motorized",
      fold_style: "Flat Fold without Seams",
      motor_type: "Norman Smart Rechargeable Battery (AC Charger)",
      motor_position: "Right",
      hub_required: false,
      ...configuration,
    },
    widthInches,
    heightInches,
  );
}

function materializeCanonical(context: SelectionContext): SelectionContext {
  const expected =
    canonicalNormanShadeMotorizationSelectionsFromConfiguration(context);
  expect(expected).not.toBeNull();
  return {
    ...context,
    configuration: {
      ...context.configuration,
      motorization_selections: expected!,
    },
  };
}

function ruleIds(context: SelectionContext): string[] {
  return validateNormanShadeMotorization(context).map((entry) => entry.ruleId);
}

function onlyLimit(context: SelectionContext) {
  const resolution = resolveNormanShadeMotorization(context);
  expect(resolution).not.toBeNull();
  expect(resolution?.limits).toHaveLength(1);
  return resolution!.limits![0];
}

describe("Norman July 2026 Honeycomb motorization normalization", () => {
  it.each([
    [
      "Smart rechargeable bottom-up",
      honeycomb(),
      {
        id: "norman-smart-bottom-up",
        minWidth: 24,
        maxWidth: 120,
        minHeight: 10,
        maxHeight: 144,
        maxAreaSqFt: 90,
        sourcePage: 9,
      },
    ],
    [
      "Smart rechargeable TDBU",
      honeycomb({ lift_system: "Norman Smart Motorized TDBU" }),
      {
        id: "norman-smart-dual-rechargeable-36w",
        minWidth: 24,
        maxWidth: 120,
        minHeight: 10,
        maxHeight: 144,
        maxAreaSqFt: 50,
        sourcePage: 9,
      },
    ],
    [
      "Smart 65W TDBU",
      honeycomb(
        {
          lift_system: "Norman Smart Motorized TDBU",
          motor_type: "Norman Smart AC Adapter Plug-In",
        },
        60,
        121,
      ),
      {
        id: "norman-smart-dual-high-power",
        minWidth: 26.5,
        maxWidth: 120,
        minHeight: 10,
        maxHeight: 144,
        maxAreaSqFt: 80,
        sourcePage: 9,
      },
    ],
    [
      "Smart woven rechargeable TDBU",
      honeycomb({
        lift_system: "Norman Smart Motorized TDBU",
        fabric_collection: "Windsong",
      }),
      {
        id: "norman-smart-woven-dual-rechargeable-36w",
        minWidth: 24,
        maxWidth: 86,
        minHeight: 10,
        maxHeight: 86,
        maxAreaSqFt: 50,
        sourcePage: 9,
      },
    ],
    [
      "Automate bottom-up",
      honeycomb({
        lift_system: "Motorized Bottom Up",
        motor_type: "Automate Home External Rechargeable Battery Pack",
      }),
      {
        id: "automate-bottom-up",
        minWidth: 22,
        maxWidth: 120,
        minHeight: 10,
        maxHeight: 144,
        maxAreaSqFt: 80,
        sourcePage: 61,
      },
    ],
    [
      "Automate woven top-down",
      honeycomb({
        lift_system: "Motorized Top Down",
        motor_type: "Automate Home External Rechargeable Battery Pack",
        fabric_collection: "Breeze",
      }),
      {
        id: "automate-woven-top-down",
        minWidth: 31,
        maxWidth: 86,
        minHeight: 10,
        maxHeight: 86,
        maxAreaSqFt: 50,
        sourcePage: 61,
      },
    ],
    [
      "AutoWand woven bottom-up",
      honeycomb({
        lift_system: "AutoWand Motorized Bottom Up",
        motor_type: "AutoWand",
        fabric_collection: "Ashton",
      }),
      {
        id: "autowand-woven-bottom-up",
        minWidth: 22,
        maxWidth: 86,
        minHeight: 10,
        maxHeight: 120,
        sourcePage: 75,
      },
    ],
  ])("resolves the exact %s table", (_name, context, expected) => {
    expect(onlyLimit(context as SelectionContext)).toEqual(expected);
  });

  it("enforces minimum, maximum, and area boundaries at one sixteenth", () => {
    const base = (width: number, height: number) =>
      materializeCanonical(honeycomb({}, width, height));
    expect(ruleIds(base(24, 10))).not.toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.min_width",
    );
    expect(ruleIds(base(24 - STEP, 10))).toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.min_width",
    );
    expect(ruleIds(base(120, 10))).not.toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.max_width",
    );
    expect(ruleIds(base(120 + STEP, 10))).toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.max_width",
    );
    expect(ruleIds(base(90, 144))).not.toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.max_area",
    );
    expect(ruleIds(base(90 + STEP, 144))).toContain(
      "honeycomb.motorization.dimension.norman-smart-bottom-up.max_area",
    );
  });

  it("changes the Skylight and Automate TD minimum width at the documented tall boundary", () => {
    expect(
      onlyLimit(
        honeycomb(
          {
            application: "Motorized Skylight",
            lift_system: "Motorized Skylight",
            motor_type: "Norman Smart AC Adapter Plug-In",
          },
          29,
          72,
        ),
      ).minWidth,
    ).toBe(29);
    expect(
      onlyLimit(
        honeycomb(
          {
            application: "Motorized Skylight",
            lift_system: "Motorized Skylight",
            motor_type: "Norman Smart AC Adapter Plug-In",
          },
          32,
          72 + STEP,
        ),
      ).minWidth,
    ).toBe(32);

    const automate = {
      lift_system: "Motorized Top Down",
      motor_type: "Automate Home External Rechargeable Battery Pack",
    };
    expect(onlyLimit(honeycomb(automate, 31, 72)).minWidth).toBe(31);
    expect(onlyLimit(honeycomb(automate, 35, 72 + STEP)).minWidth).toBe(35);
  });

  it("derives 36W/65W adapters and preserves the derivation with pinned provenance", () => {
    const low = materializeCanonical(
      honeycomb({ motor_type: "Norman Smart AC Adapter Plug-In" }, 90, 144),
    );
    const high = materializeCanonical(
      honeycomb(
        {
          lift_system: "Norman Smart Motorized TDBU",
          motor_type: "Norman Smart AC Adapter Plug-In",
        },
        60,
        121,
      ),
    );
    expect(resolveNormanShadeMotorization(low)).toMatchObject({
      ok: true,
      derivedAdapterWattage: 36,
    });
    const derived = validateNormanShadeMotorization(high).find(
      (entry) =>
        entry.ruleId === "honeycomb.motorization.ac_adapter_wattage_derived",
    );
    expect(derived).toMatchObject({
      severity: "auto_derive",
      derivedValues: { ac_adapter_wattage: 65 },
      source: {
        sourceId: "norman-motorization-guide-2026-07",
        fileName: "Motorization Guide 2026-07-20.pdf",
        revision: "July 2026; latest revision 2026-07-01",
        page: 9,
      },
    });
  });

  it("fails closed for incompatible systems and unresolved shared panel allocation", () => {
    expect(
      ruleIds(
        honeycomb({
          lift_system: "Norman Smart Motorized TDBU",
          motor_type: "AutoWand",
        }),
      ),
    ).toContain("honeycomb.motorization.family_system_incompatible");

    const sharedPanel = materializeCanonical(
      honeycomb({
        motor_type: "Norman Smart DC Low Voltage",
        dc_power_supply: "DC Power Distribution Panel",
      }),
    );
    expect(ruleIds(sharedPanel)).toContain(
      "honeycomb.motorization.shared_dc_panel_allocation_incomplete",
    );

    const chargingWandSideMount = materializeCanonical(
      honeycomb({
        installation_method: "Side Mount",
      }),
    );
    expect(ruleIds(chargingWandSideMount)).toContain(
      "honeycomb.motorization.charging_wand.side_mount_incompatible",
    );
  });
});

describe("Norman July 2026 Roman motorization normalization", () => {
  it.each([
    [
      "Smart rechargeable",
      roman(),
      {
        id: "norman-smart-rechargeable",
        minWidth: 24,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 38.7,
        sourcePage: 19,
      },
    ],
    [
      "Smart 36W AC",
      roman({ motor_type: "Norman Smart AC Adapter Plug-In" }),
      {
        id: "norman-smart-ac-36w",
        minWidth: 16,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 51.7,
        sourcePage: 19,
      },
    ],
    [
      "Smart 65W AC",
      roman({ motor_type: "Norman Smart AC Adapter Plug-In" }, 96, 78),
      {
        id: "norman-smart-ac-65w",
        minWidth: 16,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 62.3,
        sourcePage: 19,
      },
    ],
    [
      "Automate ARC rechargeable",
      roman({ motor_type: "Automate ARC Internal Rechargeable Battery" }),
      {
        id: "automate-arc-rechargeable",
        minWidth: 26,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 68,
        sourcePage: 65,
      },
    ],
    [
      "Automate 12V DC",
      roman({
        motor_type: "Automate 12V Low Voltage",
        dc_power_supply: "External Battery Pack",
      }),
      {
        id: "automate-12v-dc",
        minWidth: 17,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 68,
        sourcePage: 65,
      },
    ],
    [
      "AutoWand Flat Fold",
      roman({ motor_type: "AutoWand" }),
      {
        id: "autowand",
        minWidth: 20,
        maxWidth: 96,
        minHeight: 24,
        maxHeight: 102,
        maxAreaSqFt: 63,
        sourcePage: 79,
      },
    ],
  ])("resolves the exact %s table", (_name, context, expected) => {
    expect(onlyLimit(context as SelectionContext)).toEqual(expected);
  });

  it("uses the lower Soft Fold areas and enforces one-sixteenth boundaries", () => {
    expect(
      onlyLimit(roman({ fold_style: "Soft Fold" }, 48, 60)).maxAreaSqFt,
    ).toBe(32.7);
    const atMax = materializeCanonical(roman({}, 96, 58.05));
    const above = materializeCanonical(roman({}, 96, 58.05 + STEP));
    expect(ruleIds(atMax)).not.toContain(
      "roman.motorization.dimension.norman-smart-rechargeable.max_area",
    );
    expect(ruleIds(above)).toContain(
      "roman.motorization.dimension.norman-smart-rechargeable.max_area",
    );
  });

  it("validates each actual Common Valance panel rather than the overall width", () => {
    const common = materializeCanonical(
      roman(
        {
          shade_type: "Common Valance",
          common_valance_panel_widths: [71.75, 71.75],
          common_valance_gap: 0.5,
          motor_position: null,
        },
        144,
        60,
      ),
    );
    const issues = validateNormanShadeMotorization(common);
    expect(issues.map((entry) => entry.ruleId)).not.toContain(
      "roman.motorization.dimension.norman-smart-rechargeable.max_width",
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "roman.motorization.motor_position_derived",
          severity: "auto_derive",
        }),
        expect.objectContaining({
          ruleId:
            "roman.motorization.common_valance_price_topology_incomplete",
          severity: "hard_block",
        }),
      ]),
    );
  });

  it("requires an exact Automate 12V supply and keeps shared panels fail-closed", () => {
    expect(
      ruleIds(roman({ motor_type: "Automate 12V Low Voltage" })),
    ).toContain("roman.motorization.automate_power_supply_required");

    const shared = materializeCanonical(
      roman({
        motor_type: "Automate 12V Low Voltage",
        dc_power_supply: "DC Power Distribution Panel",
      }),
    );
    expect(ruleIds(shared)).toContain(
      "roman.motorization.shared_dc_panel_allocation_incomplete",
    );
  });

  it("rejects Smart charging-wand power and AutoWand remote/hub combinations", () => {
    expect(
      ruleIds(
        roman({
          motor_type: "Norman Smart Rechargeable Battery with Charging Wand",
        }),
      ),
    ).toContain("roman.motorization.power_source_incompatible");
    expect(
      ruleIds(
        roman({
          motor_type: "AutoWand",
          remote_type: "Basic Remote",
          hub_required: true,
        }),
      ),
    ).toContain("roman.motorization.autowand_control_incompatible");
  });
});

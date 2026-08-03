import { catalog, getProduct } from "./catalog";
import { getProductColorOptions } from "./product-color-options";
import { normanRomanDealerFabricRows } from "./norman-roman-dealer-fabrics.generated";
import {
  HONEYCOMB_DIMENSION_PROFILES,
  HONEYCOMB_GUIDE_SOURCE_ID,
} from "@/lib/quote-v2/honeycomb-matrix";
import {
  normanRollerV2Source,
  NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256,
} from "@/lib/quote-v2/generated/norman-roller-v2.generated";
import {
  ONYX_AUTOMATION_GAPS,
  ONYX_BASE_DEPTH_BY_FAMILY,
  ONYX_CONFIGURATION_PANEL_COUNTS,
  ONYX_CONFIGURATION_WIDTH_LIMITS,
  ONYX_FRAME_MOUNTS,
  ONYX_LOUVER_SIZES,
  ONYX_SOLID_COLORS,
} from "@/lib/quote-v2/onyx-rules";
import {
  ONYX_INSIDE_MOUNT_PRICING_ADDITIONS,
  ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS,
} from "@/lib/quote-v2/onyx-pricing-size";
import type {
  PricingRestrictionReference,
  RestrictionLegendRow,
} from "./restriction-types";

const EMPTY_RANGE = null;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericRange(values: Array<number | null | undefined>): [number, number] | null {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return valid.length ? [Math.min(...valid), Math.max(...valid)] : null;
}

function sourceFileForProduct(productId: string): string | null {
  if (productId === "roller") return "Roller MinMax Appendix.xls";
  if (productId === "roman") return "Roman Shade Guide--657d8c5d95.pdf";
  if (productId === "honeycomb" || productId === "vertical_honeycomb") {
    return "Honeycomb Shade Guide--c8f8e3a639.pdf";
  }
  const product = getProduct(productId);
  return product?.source ?? null;
}

function baseRow(
  row: Pick<
    RestrictionLegendRow,
    | "id"
    | "manufacturer"
    | "productId"
    | "productName"
    | "scope"
    | "programId"
    | "programName"
  >,
): RestrictionLegendRow {
  return {
    ...row,
    fabricId: null,
    fabricCollection: null,
    fabricType: null,
    colorCode: null,
    colorName: null,
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null,
    maxAreaSqft: null,
    fabricRollWidth: null,
    maxRailroadLength: null,
    railroadAllowed: null,
    minWidthRange: EMPTY_RANGE,
    maxWidthRange: EMPTY_RANGE,
    minHeightRange: EMPTY_RANGE,
    maxHeightRange: EMPTY_RANGE,
    maxAreaRangeSqft: EMPTY_RANGE,
    conditions: [],
    warningBehavior:
      "Warn and block authoritative pricing when entered dimensions violate this row.",
    authority: "catalog_inherited",
    sourceId: null,
    sourceFile: sourceFileForProduct(row.productId),
    sourceLocation: null,
    effectiveDate: catalog.effectiveDate || null,
    notes: [],
  };
}

function programRows(): RestrictionLegendRow[] {
  return catalog.products.flatMap((product) => {
    const manufacturer = product.manufacturer ?? "Unknown manufacturer";
    if (!product.programs.length) {
      return [
        {
          ...baseRow({
            id: `${product.id}:product`,
            manufacturer,
            productId: product.id,
            productName: product.name,
            scope: "product",
            programId: null,
            programName: null,
          }),
          warningBehavior:
            product.priceBasis === "unavailable"
              ? "Block selection because the product is unavailable."
              : "Require a manual manufacturer quote before customer pricing.",
          authority:
            product.priceBasis === "unavailable" ? "unavailable" : "manual_quote",
          notes: [...product.notes],
        },
      ];
    }
    return product.programs.map((program) => ({
      ...baseRow({
        id: `${product.id}:${program.id}:program`,
        manufacturer,
        productId: product.id,
        productName: product.name,
        scope: "program",
        programId: program.id,
        programName: program.name,
      }),
      minWidth: finite(program.minWidth),
      maxWidth: finite(program.maxWidth),
      minHeight: finite(program.minHeight),
      maxHeight: finite(program.maxHeight),
      maxAreaSqft: finite(program.maxAreaSqft),
      authority:
        program.priceBasis === "manual_required"
          ? "manual_quote"
          : program.priceBasis === "unavailable"
            ? "unavailable"
            : "source_backed",
      sourceId: program.sourceId ?? null,
      sourceLocation: program.sourcePages?.length
        ? `pages ${program.sourcePages.join(", ")}`
        : null,
      notes: [...product.notes, ...program.notes],
    }));
  });
}

function genericFabricRows(): RestrictionLegendRow[] {
  return catalog.products.flatMap<RestrictionLegendRow>((product): RestrictionLegendRow[] => {
    if (product.id === "roller" || product.id === "roman") return [];
    if (product.fabricMetadata?.length) {
      return product.fabricMetadata.map((fabric, index) => {
        const programId =
          product.fabricRouting?.[fabric.name] ?? `group_${fabric.priceGroup}`;
        const program = product.programs.find((candidate) => candidate.id === programId);
        const railroadCondition = fabric.railroadAllowed
          ? `Railroading is allowed but not recommended; without a seam, railroaded shade height is limited to ${fabric.maxRailroadLengthInches ?? "the source-listed maximum"} inches.`
          : "Railroading is not allowed for this fabric.";
        return {
          ...baseRow({
            id: `${product.id}:fabric-metadata:${index}:${programId}`,
            manufacturer: product.manufacturer ?? "Unknown manufacturer",
            productId: product.id,
            productName: product.name,
            scope: "fabric",
            programId,
            programName: program?.name ?? null,
          }),
          fabricId: fabric.name,
          fabricCollection: fabric.name,
          fabricType: fabric.openness || null,
          minWidth: finite(program?.minWidth),
          maxWidth: finite(program?.maxWidth),
          minHeight: finite(program?.minHeight),
          maxHeight: finite(program?.maxHeight),
          maxAreaSqft: finite(program?.maxAreaSqft),
          fabricRollWidth: finite(fabric.rollWidthInches),
          maxRailroadLength: finite(fabric.maxRailroadLengthInches),
          railroadAllowed: fabric.railroadAllowed,
          conditions: [
            `Standard fabric orientation is limited by the ${fabric.rollWidthInches ?? "source-listed"} inch fabric roll width.`,
            railroadCondition,
            "A shade wider than the fabric roll requires an explicit railroad/seam decision; do not silently accept the broad product grid maximum.",
          ],
          warningBehavior:
            "Warn when shade width exceeds the fabric roll. If railroading is allowed, also warn when shade height exceeds the maximum railroaded length without a seam; otherwise require seam/manual review.",
          authority: "source_backed" as const,
          sourceFile: sourceFileForProduct(product.id),
          sourceLocation: `page ${fabric.sourcePage}`,
          notes: program?.notes ? [...program.notes] : [],
        };
      });
    }
    const colors = getProductColorOptions(product.id);
    const colorRows = colors.map((color) => {
      const program = product.programs.find((candidate) => candidate.id === color.programId);
      return {
        ...baseRow({
          id: `${product.id}:${color.id}:fabric`,
          manufacturer: product.manufacturer ?? "Unknown manufacturer",
          productId: product.id,
          productName: product.name,
          scope: "fabric",
          programId: program?.id ?? color.programId,
          programName: program?.name ?? null,
        }),
        fabricId: color.id,
        fabricCollection: color.collection || null,
        fabricType: color.fabricType || null,
        colorCode: color.colorCode || null,
        colorName: color.colorName || null,
        minWidth: finite(program?.minWidth),
        maxWidth: finite(program?.maxWidth),
        minHeight: finite(program?.minHeight),
        maxHeight: finite(program?.maxHeight),
        maxAreaSqft: finite(program?.maxAreaSqft),
        conditions:
          product.id === "honeycomb" || product.id === "vertical_honeycomb"
            ? [
                "Program limits shown here are the broad grid boundary.",
                "The exact cell, lift system, fabric class, frame, motor, and application matrix is enforced separately.",
              ]
            : ["Fabric inherits the independent program limits shown on this row."],
        authority: "catalog_inherited" as const,
        sourceFile: color.sourcePage || sourceFileForProduct(product.id),
        sourceLocation: color.sourceNote || null,
        notes: program?.notes ? [...program.notes] : [],
      };
    });
    if (colorRows.length) return colorRows;
    return Object.entries(product.fabricRouting ?? {}).map(([fabric, programId], index) => {
      const program = product.programs.find((candidate) => candidate.id === programId);
      return {
        ...baseRow({
          id: `${product.id}:routing:${index}:${programId}`,
          manufacturer: product.manufacturer ?? "Unknown manufacturer",
          productId: product.id,
          productName: product.name,
          scope: "fabric",
          programId,
          programName: program?.name ?? null,
        }),
        fabricId: fabric,
        fabricCollection: fabric,
        minWidth: finite(program?.minWidth),
        maxWidth: finite(program?.maxWidth),
        minHeight: finite(program?.minHeight),
        maxHeight: finite(program?.maxHeight),
        maxAreaSqft: finite(program?.maxAreaSqft),
        conditions: ["Fabric inherits the independent program limits shown on this row."],
        authority: "catalog_inherited" as const,
        notes: program?.notes ? [...program.notes] : [],
      };
    });
  });
}

function romanFabricRows(): RestrictionLegendRow[] {
  const product = getProduct("roman");
  if (!product) return [];
  const programByGroup: Record<string, string> = {
    group1: "roman_cordless_usa_price_group_1_pg1",
    group2: "roman_cordless_usa_price_group_2_pg2",
    group3: "roman_cordless_usa_price_group_3_pg3",
  };
  return normanRomanDealerFabricRows.map((fabric, index) => {
    const programId = programByGroup[fabric.priceGroup] ?? null;
    const program = product.programs.find((candidate) => candidate.id === programId);
    const rawMaxWidth = Number.parseFloat(fabric.maxWidth);
    return {
      ...baseRow({
        id: `roman:${fabric.collection}:${fabric.colorCode}:${index}`,
        manufacturer: "Norman",
        productId: "roman",
        productName: product.name,
        scope: "fabric",
        programId,
        programName: program?.name ?? null,
      }),
      fabricId: `${fabric.collection}:${fabric.colorCode}`,
      fabricCollection: fabric.collection,
      fabricType: fabric.openness || null,
      colorCode: fabric.colorCode,
      colorName: fabric.colorName,
      maxWidth: Number.isFinite(rawMaxWidth) ? rawMaxWidth : null,
      conditions: [
        `Joinable: ${fabric.joinable === "Y" ? "yes" : "no"}.`,
        `Allowed fold styles: ${fabric.styles.join(", ")}.`,
        "Usable order width is adjusted by fold style, lift system, mount allowance, and common-valance rules before comparison.",
      ],
      authority: "source_backed",
      sourceId: "norman-roman-guide-2026-07",
      sourceFile: "Roman Shade Guide--657d8c5d95.pdf",
      sourceLocation: "dealer order-form fabric catalog; guide pages 12-13",
      notes: [
        fabric.discontinued ? "Discontinued - selection must remain unavailable." : "Active fabric.",
        fabric.needsPriceGroupReview ? "Price group requires review." : "",
      ].filter(Boolean),
    };
  });
}

function rollerFabricRows(): RestrictionLegendRow[] {
  const product = getProduct("roller");
  if (!product) return [];
  const limitRowById = new Map(
    normanRollerV2Source.limitRows.map((row) => [row.id, row]),
  );
  const profileById = new Map(
    normanRollerV2Source.limitProfiles.map((profile) => [profile.id, profile]),
  );
  const assignmentsByFabricCode = new Map<
    string,
    Array<(typeof normanRollerV2Source.profileAssignments)[number]>
  >();
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .replace(/[()]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => !["screen", "natural"].includes(token))
      .join(" ")
      .trim();
  const programForCollection = (collection: string) => {
    const direct = product.fabricRouting?.[collection];
    if (direct) return direct;
    const wanted = normalized(collection);
    const matches = Object.entries(product.fabricRouting ?? {}).filter(([fabric]) => {
      const candidate = normalized(fabric);
      return candidate === wanted || candidate.startsWith(`${wanted} `) || wanted.startsWith(`${candidate} `);
    });
    return matches.length === 1 ? matches[0][1] : null;
  };
  for (const assignment of normanRollerV2Source.profileAssignments) {
    for (const fabricCode of assignment.fabricCodes) {
      const rows = assignmentsByFabricCode.get(fabricCode) ?? [];
      rows.push(assignment);
      assignmentsByFabricCode.set(fabricCode, rows);
    }
  }
  return normanRollerV2Source.offerings.map((offering) => {
    const programId = programForCollection(offering.collection);
    const assignments = assignmentsByFabricCode.get(offering.fabricCode) ?? [];
    const profiles = assignments.flatMap((assignment) => {
      const profile = profileById.get(assignment.profileId);
      return profile ? [profile] : [];
    });
    const sheets = [
      ...new Set(
        assignments.flatMap((assignment) => {
          const row = limitRowById.get(assignment.limitRowId);
          return row ? [row.sheet] : [];
        }),
      ),
    ];
    return {
      ...baseRow({
        id: `roller:${offering.id}`,
        manufacturer: "Norman",
        productId: "roller",
        productName: product.name,
        scope: "fabric",
        programId,
        programName:
          product.programs.find(
            (program) => program.id === programId,
          )?.name ?? null,
      }),
      fabricId: offering.fabricCode,
      fabricCollection: offering.collection,
      fabricType: offering.fabricCode,
      colorCode: offering.colorCode,
      colorName: offering.colorName,
      minWidthRange: numericRange(profiles.map((profile) => profile.limits.minWidth)),
      maxWidthRange: numericRange(profiles.map((profile) => profile.limits.maxWidth)),
      minHeightRange: numericRange(profiles.map((profile) => profile.limits.minHeight)),
      maxHeightRange: numericRange(profiles.map((profile) => profile.limits.maxHeight)),
      maxAreaRangeSqft: numericRange(
        profiles.map(
          (profile) =>
            profile.limits.maxAreaSqft ??
            profile.limits.totalMaxAreaTwoShadesSqft ??
            null,
        ),
      ),
      conditions: [
        `Region scope: ${offering.regionScope}.`,
        `${profiles.length} exact configuration profiles across ${sheets.length} application sheets.`,
        "The quote validator selects the exact application, coupling, operating system, top treatment, tube, orientation, and region profile; it never uses the broad range as an ordering limit.",
      ],
      authority: profiles.length ? "configuration_dependent" : "manual_quote",
      sourceId: "norman-roller-minmax-appendix-2026-08",
      sourceFile: "Roller MinMax Appendix.xls",
      sourceLocation: `${offering.sourceRef.sheet}!${offering.sourceRef.range}`,
      effectiveDate: offering.effectiveFrom || null,
      notes: [
        `Fabric code ${offering.fabricCode}.`,
        `Source workbook SHA-256 ${NORMAN_ROLLER_V2_ORIGINAL_WORKBOOK_SHA256}.`,
        profiles.length
          ? "Exact profile warnings are already enforced by validateRollerMatrix."
          : "No usable restriction profile was found; block rather than infer.",
      ],
    };
  });
}

function honeycombConfigurationRows(): RestrictionLegendRow[] {
  const product = getProduct("honeycomb");
  if (!product) return [];
  return HONEYCOMB_DIMENSION_PROFILES.map((profile) => ({
    ...baseRow({
      id: `honeycomb:configuration:${profile.id}`,
      manufacturer: "Norman",
      productId: "honeycomb",
      productName: product.name,
      scope: "configuration",
      programId: null,
      programName: profile.id,
    }),
    minWidth: profile.limits.minWidth,
    maxWidth: profile.limits.maxWidth,
    minHeight: profile.limits.minHeight,
    maxHeight: profile.limits.maxHeight,
    maxAreaSqft: profile.limits.maxAreaSqFt ?? null,
    conditions: [
      `System: ${profile.system}.`,
      `Cell sizes: ${profile.cells.join(", ")}.`,
      profile.fabricClasses?.length
        ? `Fabric classes: ${profile.fabricClasses.join(", ")}.`
        : "Applies to all compatible fabric classes unless a more-specific row supersedes it.",
    ],
    authority: "source_backed",
    sourceId: profile.sourceId ?? HONEYCOMB_GUIDE_SOURCE_ID,
    sourceFile: "Honeycomb Shade Guide--c8f8e3a639.pdf",
    sourceLocation: `page ${profile.sourcePage}`,
    notes: ["Exact fabric, cell, system, frame, and motor selections are validated as one configuration."],
  }));
}

function onyxConfigurationRows(): RestrictionLegendRow[] {
  const product = getProduct("onyx_shutters");
  if (!product) return [];
  const row = (
    id: string,
    name: string,
    sourceLocation: string,
    conditions: string[],
    dimensions: Partial<
      Pick<RestrictionLegendRow, "minWidth" | "maxWidth" | "minHeight" | "maxHeight">
    > = {},
    authority: RestrictionLegendRow["authority"] = "source_backed",
  ): RestrictionLegendRow => ({
    ...baseRow({
      id: `onyx:configuration:${id}`,
      manufacturer: "Onyx",
      productId: product.id,
      productName: product.name,
      scope: "configuration",
      programId: null,
      programName: name,
    }),
    ...dimensions,
    authority,
    sourceId: "onyx-reference-guide-2020-2021",
    sourceFile: "OnyxProgramBinder2020.pdf",
    sourceLocation,
    conditions,
    warningBehavior:
      authority === "manual_quote"
        ? "Block authoritative pricing and require current manufacturer verification."
        : "Warn or block when the selected Onyx configuration violates this source rule.",
  });

  const frameRows = Object.entries(ONYX_FRAME_MOUNTS).map(([frame, mounts]) =>
    row(
      `frame:${frame}`,
      frame,
      "page 4",
      [`Allowed mount types: ${[...mounts].join(", ")}.`, "Custom frame extension must be 0 through 2 inches."],
    ),
  );
  const panelRows = Object.entries(ONYX_CONFIGURATION_PANEL_COUNTS).map(
    ([configuration, panelCount]) => {
      const limits =
        ONYX_CONFIGURATION_WIDTH_LIMITS[
          configuration as keyof typeof ONYX_CONFIGURATION_WIDTH_LIMITS
        ];
      return row(
        `panel:${configuration}`,
        `Panel configuration ${configuration}`,
        "page 6",
        [
          `${panelCount} actual panel width and height value${panelCount === 1 ? " is" : "s are"} required.`,
          `Each panel must be 8-${panelCount === 1 ? 30 : 20}" wide and 16-84" high.`,
          "No maximum panel-area rule is published; do not infer one.",
        ],
        {
          minWidth: limits.min,
          maxWidth: limits.max,
          minHeight: 16,
          maxHeight: 84,
        },
        "configuration_dependent",
      );
    },
  );
  const depthLabels: Record<keyof typeof ONYX_BASE_DEPTH_BY_FAMILY, string> = {
    inside_l: "Inside mount L Frame",
    inside_z: "Inside mount Z Frame",
    outside_l: "Outside mount L Frame",
  };
  const depthRows = Object.entries(ONYX_BASE_DEPTH_BY_FAMILY).flatMap(
    ([family, depths]) =>
      Object.entries(depths).map(([louver, minimumDepth]) =>
        row(
          `depth:${family}:${louver}`,
          `${depthLabels[family as keyof typeof depthLabels]} / ${louver}" louver`,
          "page 5",
          [
            `Minimum clear depth: ${minimumDepth}" without a back-of-louver hidden-tilt notch.`,
            "Add 0.25 inches when the hidden-tilt notch is on the back of the louver.",
          ],
        ),
      ),
  );
  const insidePricingRows = Object.entries(ONYX_INSIDE_MOUNT_PRICING_ADDITIONS).map(
    ([frame, additions]) =>
      row(`pricing:inside:${frame}`, `${frame} window-size pricing overlap`, "page 13", [
        `Inside mount adds ${additions.widthAdditionInches}" to opening width.`,
        `Add ${additions.fourSidedHeightAdditionInches}" to height for four sides or ${additions.threeSidedHeightAdditionInches}" for three sides.`,
      ]),
  );
  const outsidePricingRows = Object.entries(ONYX_OUTSIDE_MOUNT_PRICING_ADDITIONS).map(
    ([frame, additions]) =>
      row(`pricing:outside:${frame}`, `${frame} window-size pricing overlap`, "page 13", [
        `Outside mount adds ${additions.widthAdditionInches}" to opening width.`,
        `Add ${additions.fourSidedHeightAdditionInches}" to height for four sides or ${additions.threeSidedHeightAdditionInches}" for three sides.`,
      ]),
  );
  const commonRows = [
    row("colors", "Vinyl colors", "page 5", [
      `Documented solid colors: ${[...ONYX_SOLID_COLORS].join(", ")}.`,
      "Request-only colors require manufacturer verification.",
    ]),
    row("louvers", "Louver sizes", "page 5", [
      `Documented louver sizes: ${[...ONYX_LOUVER_SIZES].join('", ')}".`,
    ]),
    row("tilt", "Tilt systems", "page 5", [
      "Documented tilt categories: standard, offset, hidden.",
      "Offset default is 2 inches from the louver ends on the hinged side.",
      "Every hidden tilt-rod section must be 40 inches or shorter.",
    ]),
    row("divider-rails", "Divider rails", "page 6", [
      "One divider rail is recommended above 60 inches and required above 72 inches.",
      "Two divider rails are required above 100 inches.",
      "Custom rail positions require an exact bottom-to-midpoint measurement for every rail.",
    ]),
    row("double-hung", "Double Hung", "page 8", [
      "Single-panel or two-panel configurations only.",
      "Maximum total panel width is 70 inches before the frame.",
      "A horizontal T-post is required.",
    ], { maxWidth: 70 }),
    row("bifold-two", "Bi Fold / two panels", "pages 8, 12", [
      "Total panel width must be 24-52 inches before the frame.",
      "Height, depth, and full configuration restrictions require manufacturer verification.",
    ], { minWidth: 24, maxWidth: 52 }, "manual_quote"),
    row("bifold-four", "Bi Fold / four panels", "pages 8, 12", [
      "Total panel width must be 48-104 inches before the frame.",
      "Height, depth, and full configuration restrictions require manufacturer verification.",
    ], { minWidth: 48, maxWidth: 104 }, "manual_quote"),
    row("bypass", "Bypass", "pages 8, 12", [
      "The binder publishes 3.5-inch track depths but no complete width/height matrix.",
    ], {}, "manual_quote"),
    row("french-door", "French Door", "pages 8, 10", [
      "Requires at least 1.75 inches of flat mounting area.",
      "Hardware clearance under 1.75 inches requires an L Frame cutout and exact handle/lock center measurements.",
      "Louver-dependent extension values are not published.",
    ], {}, "manual_quote"),
    row("specialty", "Specialty shapes", "page 7", [
      "A template or detailed drawing is required; complete dimensional limits are not published.",
    ], {}, "manual_quote"),
    row("bay-corner", "Bay and corner", "page 11", [
      "Factory deductions and spacers are not fully quantified.",
    ], {}, "manual_quote"),
    row("source-gaps", "Current-source limitations", "pages 1, 3, 6", [
      ...ONYX_AUTOMATION_GAPS,
    ], {}, "manual_quote"),
  ];
  return [
    ...frameRows,
    ...panelRows,
    ...depthRows,
    ...insidePricingRows,
    ...outsidePricingRows,
    ...commonRows,
  ];
}

export function buildPricingRestrictionReference(): PricingRestrictionReference {
  const rows = [
    ...programRows(),
    ...genericFabricRows(),
    ...romanFabricRows(),
    ...rollerFabricRows(),
    ...honeycombConfigurationRows(),
    ...onyxConfigurationRows(),
  ];
  const scopeCount = (scope: RestrictionLegendRow["scope"]) =>
    rows.filter((row) => row.scope === scope).length;
  return {
    generatedAt: new Date().toISOString(),
    rows,
    counts: {
      products: new Set(rows.map((row) => row.productId)).size,
      rows: rows.length,
      productRows: scopeCount("product"),
      programRows: scopeCount("program"),
      fabricRows: scopeCount("fabric"),
      configurationRows: scopeCount("configuration"),
      sourceBackedRows: rows.filter((row) => row.authority === "source_backed").length,
    },
  };
}

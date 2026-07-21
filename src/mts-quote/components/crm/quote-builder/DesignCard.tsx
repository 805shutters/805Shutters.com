import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Card, CardContent, CardHeader } from "@mts/components/ui/card";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { Label } from "@mts/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mts/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@mts/components/ui/tabs";
import { Checkbox } from "@mts/components/ui/checkbox";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  Copy,
  CopyCheck,
  Calculator,
  FileText,
  Lightbulb,
  Lock,
  Plus,
  Ruler,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@mts/lib/utils";
import { formatDimensions } from "@mts/types/quote";
import {
  SHUTTER_LOUVER_SIZES,
  SHUTTER_TILT_TYPES,
  SHUTTER_HINGE_COLORS,
  SHUTTER_PANEL_CONFIGS,
  SHUTTER_AUTO_VARIANTS,
  ONYX_WOOD_MATERIALS,
  ONYX_POLY_MATERIALS,
  ONYX_ORDER_SHUTTER_TYPES,
  ONYX_SIZE_TYPES,
  ONYX_MOUNT_TYPES,
  ONYX_TILT_TYPES,
  ONYX_HINGE_COLORS,
  ONYX_PANEL_CONFIGS,
  ONYX_EXTENSION_ROD_OPTIONS,
  ONYX_T_POST_OPTIONS,
  ONYX_ASTRAGAL_OPTIONS,
  ONYX_TRACK_TYPES,
  ONYX_SPECIALTY_SHAPES,
  ONYX_SPECIALTY_CATEGORIES,
  ONYX_BYPASS_TYPES,
  ONYX_FOLDING_DIRECTIONS,
  ONYX_FACIA_TYPES,
  ONYX_DIVIDER_RAIL_LOCATIONS,
  ONYX_COLORS,
  ONYX_POLY_FRAME_TYPES,
  ONYX_WOOD_FRAME_TYPES,
  NORMAN_WOODLORE_FRAME_TYPES,
  ROLLER_MOUNT_TYPES,
  ROLLER_SHADE_TYPES,
  ROLLER_LIFT_SYSTEMS,
  ROLLER_VALANCES,
  ROLLER_HEM_BARS,
  ROLLER_ROLL_TYPES,
  ROLLER_CORD_LOOP_RELEASES,
  ROLLER_PREMIUM_HARDWARE_COLORS,
  getRollerFabricPriceGroup,
  getRomanFabricPriceGroup,
  ROMAN_MOUNT_TYPES,
  ROMAN_SHADE_TYPES,
  ROMAN_LIFT_SYSTEMS,
  ROMAN_VALANCES,
  ROMAN_VALANCE_RETURNS_INSIDE,
  ROMAN_VALANCE_RETURNS_OUTSIDE,
  ROMAN_CHAIN_TYPES,
  ROMAN_CHAIN_COLORS,
  ROMAN_CHAIN_LOCATIONS,
  ROMAN_CHAIN_LENGTHS,
  ROMAN_POLE_OPTIONS,
  ROMAN_POLE_LENGTHS,
  ROMAN_LININGS,
  ROMAN_BACK_HEM_BARS,
  ROMAN_HOLD_DOWNS,
  ROMAN_MAGNET_COLORS,
  ROMAN_POWER_SOURCES,
  ROMAN_AUTOMATE_POWER_SOURCES,
  ROMAN_REMOTES_NORMAN,
  ROMAN_REMOTES_AUTOMATE,
  ROMAN_BACK_SHADE_FABRICS,
  getRomanFoldStylesFor,
  getRomanFabricCategoryNamesFor,
  getRomanFabricCategoryForColor,
  getRomanFabricCategoryName,
  getRomanFabricCanonicalLabel,
  getRomanFabricColorsForCategory,
  HONEYCOMB_MOUNT_TYPES,
  HONEYCOMB_CELL_SIZES,
  HONEYCOMB_LIGHT_CONTROL,
  HONEYCOMB_RAIL_COLORS,
  HONEYCOMB_POLE_OPTIONS,
  HONEYCOMB_HOLD_DOWNS,
  HONEYCOMB_SHADE_TYPES_2ON1,
  HONEYCOMB_CHAIN_LOCATIONS,
  HONEYCOMB_CHAIN_LENGTHS,
  HONEYCOMB_AUTOMATE_POWER_SOURCES,
  canonicalizeHoneycombCellSize,
  getHoneycombMotorsFor,
  getHoneycombOperatingSystemsFor,
  honeycombOperatingSystemAllows2On1,
  isHoneycombChainOperatingSystem,
  isHoneycombCordlessPoleOperatingSystem,
  isHoneycombDayNightOperatingSystem,
  isHoneycombFrameCellSize,
  isHoneycombMotorizedOperatingSystem,
  PERFECTSHEER_MOUNT_TYPES,
  PERFECTSHEER_LIGHT_CONTROL,
  PERFECTSHEER_LIFT_SYSTEMS,
  MINI_BLIND_MOUNT_TYPES,
  MINI_BLIND_SLAT_SIZES,
  MINI_BLIND_FINISHES,
  FAUX_WOOD_MOUNT_TYPES,
  FAUX_WOOD_SLAT_SIZES,
  FAUX_WOOD_PRODUCT_LINES,
  WOOD_BLIND_MOUNT_TYPES,
  WOOD_BLIND_SLAT_SIZES,
  VERTICAL_MOUNT_TYPES,
  VERTICAL_FABRIC_GROUPS,
  VERTICAL_CONTROL_TYPES,
  VERTICAL_STACK_OPTIONS,
  getVerticalFabricPriceGroup,
  SMARTDRAPE_MOUNT_TYPES,
  SMARTDRAPE_SHADE_TYPES,
  SMARTDRAPE_STACK_OPTIONS,
  SMARTDRAPE_CONTROL_TYPES,
  SMARTDRAPE_CONTROL_SIDES,
  PRODUCT_TYPES,
} from "@mts/lib/quoteConstants";
import {
  WOOD_SHUTTER_ROUTES,
  getAutoShutterRoutePatch,
  getWoodShutterRoutePatch,
  type ShutterRoutePatch,
  type WoodShutterRoute,
} from "@mts/lib/quoteShutterRouting";
import {
  getHoneycombFabricGroups,
} from "@mts/lib/fabricCatalog";
import {
  getHoneycombDealerFabricTypesFor,
  isHoneycombDealerColorAvailable,
  isHoneycombDealerColorSurcharged,
} from "@mts/lib/honeycombDealerFabrics";
import {
  ROLLER_FABRIC_COLOR_CODE_DETAIL,
  ROLLER_FABRIC_COLOR_COLLECTION_DETAIL,
  ROLLER_FABRIC_COLOR_ID_DETAIL,
  ROLLER_FABRIC_COLOR_NAME_DETAIL,
  ROLLER_FABRIC_COLOR_TYPE_DETAIL,
  findMtsRollerFabricColorBySelection,
  getMtsRollerFabricCollections,
  getMtsRollerProgramLabel,
  searchMtsRollerFabricColors,
  type MtsRollerFabricColor,
} from "@mts/lib/normanRollerFabricCatalog";
import {
  PRODUCT_COLOR_CODE_DETAIL,
  PRODUCT_COLOR_COLLECTION_DETAIL,
  PRODUCT_COLOR_ID_DETAIL,
  PRODUCT_COLOR_NAME_DETAIL,
  PRODUCT_COLOR_PRODUCT_ID_DETAIL,
  PRODUCT_COLOR_PROGRAM_DETAIL,
  PRODUCT_COLOR_SURCHARGE_DETAIL,
  PRODUCT_COLOR_TYPE_DETAIL,
  findMtsProductColorById,
  findMtsProductColorBySelection,
  getMtsProductColorFieldLabel,
  getMtsProductColorProgramLabel,
  getMtsProductColorValue,
  productColorLabel,
  searchMtsProductColors,
  supportsMtsProductColorSearch,
  type ProductColorOption,
} from "@mts/lib/productColorCatalog";
import type { SpecialtyShape } from "@mts/lib/quoteConstants";
import type { SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";
import { measurementToInches, getProductPriceBreakdown, calculateSqft } from "@mts/lib/pricingEngine";
import { getHoneycombShadeSpecWarnings } from "@mts/lib/honeycombShadeSpecs";
import { getRollerShadeSpecWarnings } from "@mts/lib/rollerShadeSpecs";
import { getRomanShadeSpecWarnings } from "@mts/lib/romanShadeSpecs";
import {
  getMiniBlindAutomaticSurcharges,
  getMiniBlindDefaultLightControl,
  getMiniBlindFinishFromColor,
  getMiniBlindLightControlOptions,
  getMiniBlindSpecWarnings,
} from "@mts/lib/miniBlindOptions";
import {
  calculateDiscountedPrice,
  removeQuoteDesignDiscount,
  type QuoteDiscountPercent,
} from "@mts/lib/quoteDiscounts";
import {
  getAutomaticShutterOptionSurcharges,
  getInvisibleTiltPanelRate,
  isInvisibleTiltPanelSelectionMissing,
} from "@mts/lib/shutterOptionSurcharges";
import {
  PricingAuditPanel,
  type PricingAuditSurcharge,
} from "@mts/components/crm/quote-builder/PricingAuditPanel";
import {
  FAUX_WOOD_SURCHARGES,
  HONEYCOMB_SURCHARGES,
  MOTORIZATION_OPTIONS,
  NORMAN_SHUTTER_PROGRAMS,
  ONYX_SHUTTER_FIXED_SURCHARGES,
  ONYX_SHUTTER_PERCENTAGE_SURCHARGES,
  ONYX_SHUTTER_PROGRAMS,
  PERFECTSHEER_SURCHARGES,
  ROLLER_MOTORIZATION,
  ROLLER_SURCHARGES,
  ROMAN_SURCHARGES,
  getRomanFabricValancePrice,
  getRollerValanceLadder,
  getRollerValanceSurchargePrice,
  SHUTTER_FIXED_SURCHARGES,
  SHUTTER_PERCENTAGE_SURCHARGES,
  SMARTDRAPE_SURCHARGES,
  VERTICAL_SURCHARGES,
  WOOD_BLIND_SURCHARGES,
  type MotorOption,
  type ShutterProgram,
  type Surcharge,
} from "@mts/lib/pricingData";
import { useRetailPriceStore } from "@mts/stores/retailPriceStore";
import { useQuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import type { QuoteLabCatalogProduct, QuoteLabCatalogResponse } from "@/lib/quote-lab/types";

let quoteLabCatalogPromise: Promise<QuoteLabCatalogResponse> | null = null;

function loadQuoteLabCatalog() {
  quoteLabCatalogPromise ??= fetch("/api/quote-lab/catalog", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Catalog unavailable");
    return response.json() as Promise<QuoteLabCatalogResponse>;
  });
  return quoteLabCatalogPromise;
}

interface DesignCardProps {
  lineItem: SalesQuoteLineItem;
  lineNumber: number;
  lineNumberLabel?: string;
  designs: SalesQuoteDesign[];
  onUpdateDesign: (
    design: Partial<SalesQuoteDesign> & { line_item_id: string; variant: string }
  ) => void;
  onCopyAll: () => void;
  onCopySome: () => void;
  onStack: () => void;
  copyMode: "none" | "all" | "some";
  isCopyTarget: boolean;
  isSelectedTarget: boolean;
  onToggleCopyTarget: () => void;
  discountPercents?: readonly QuoteDiscountPercent[];
  onApplyDiscount?: (percent: QuoteDiscountPercent) => void;
  isDiscountPending?: boolean;
  isPriceLocked?: boolean;
  onOpenMeasurement?: () => void;
  onDelete?: () => void;
  onCopyItem?: () => void;
  onChangeProductType?: (productType: string) => void;
  onUpdateRoomName?: (roomName: string) => void;
  onUpdateQuantity?: (quantity: number) => void;
}

// --- Types ---

// CompletedStep type used dynamically
type CompletedStep = {
  key: string;
  label: string;
  value: string;
};
void (0 as unknown as CompletedStep);

interface DefiningStep {
  key: string;
  label: string;
  field: string;
  options: readonly string[];
}

const NORMAN_WOOD_MATERIALS = ["Normandy Painted", "Normandy Stained"] as const;

interface GridOptionButtons {
  key: string;
  label: string;
  field: string;
  type: "buttons";
  options: readonly string[];
}

interface GridOptionSelect {
  key: string;
  label: string;
  field: string;
  type: "select";
  options: readonly string[];
}

interface GridOptionYesNo {
  key: string;
  label: string;
  field: string;
  type: "yes-no";
  noFirst?: boolean;
}

type GridOption = GridOptionButtons | GridOptionSelect | GridOptionYesNo;
type GridSelectGroup = { label: string; items: readonly string[] };
type OptionSlotRequirement = "mandatory" | "optional";

// --- Helpers ---

const INSTALL_MORE_OPTIONS: GridOptionYesNo[] = [
  {
    key: "hard_surface",
    label: "Hard Surface Install",
    field: "hard_surface_install",
    type: "yes-no",
    noFirst: true,
  },
  {
    key: "ladder",
    label: "Requires Ladder Over 15ft",
    field: "ladder_over_15ft",
    type: "yes-no",
    noFirst: true,
  },
  {
    key: "takedown",
    label: "Requires Takedown",
    field: "requires_takedown",
    type: "yes-no",
    noFirst: true,
  },
];

const BOOLEAN_FIELDS = new Set(["hard_surface_install", "ladder_over_15ft", "requires_takedown"]);
const ROLLER_MOTOR_TYPE_OPTIONS = [
  ...new Set(
    MOTORIZATION_OPTIONS.filter((option) => /motor|autowand/i.test(option.name)).map(
      (option) => option.name
    )
  ),
] as readonly string[];

interface QuoteSurcharge {
  id: string;
  name: string;
  type: "percentage" | "fixed";
  value: number;
  quantity: number;
  category: string;
  portalLabel?: string;
}

interface SurchargeCatalogItem extends QuoteSurcharge {
  applicableTo?: string[];
}

function slugifySurcharge(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toCatalogItem(
  productType: string,
  surcharge: Surcharge,
  category: string
): SurchargeCatalogItem {
  const portalName =
    productType === "Smart Drapes" && surcharge.name === "Additional Vanes (6)"
      ? "Additional SmartDrape Vanes (Pack of 6)"
      : surcharge.name;

  return {
    id: slugifySurcharge(
      `${productType}-${category}-${portalName}-${surcharge.type}-${surcharge.value}`
    ),
    name: portalName,
    portalLabel: portalName,
    type: surcharge.type,
    value: surcharge.value,
    quantity: 1,
    category,
    applicableTo: surcharge.applicableTo,
  };
}

function dedupeSurcharges(items: SurchargeCatalogItem[]): SurchargeCatalogItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getSelectedSurcharges(design: SalesQuoteDesign | undefined): QuoteSurcharge[] {
  const raw = (design?.options_json as Record<string, unknown> | undefined)?.surcharges;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => item as Partial<QuoteSurcharge>)
    .filter((item) => item.id && item.name && item.type && typeof item.value === "number")
    .map((item) => ({
      id: item.id as string,
      name: item.name as string,
      type: item.type as "percentage" | "fixed",
      value: item.value as number,
      quantity: Math.max(1, Number(item.quantity) || 1),
      category: item.category || "Surcharges",
      portalLabel: item.portalLabel,
    }));
}

function toAutomaticSurcharge(
  productType: string,
  surcharge: Surcharge | undefined,
  category: string,
  displayName?: string
): QuoteSurcharge | null {
  if (!surcharge) return null;

  const item = toCatalogItem(productType, surcharge, category);
  return {
    id: item.id,
    name: displayName || item.name,
    type: item.type,
    value: item.value,
    quantity: 1,
    category,
    portalLabel: displayName || item.portalLabel,
  };
}

function findSurcharge(catalog: Surcharge[], name: string): Surcharge | undefined {
  return catalog.find((item) => item.name === name);
}

function appendSurcharge(items: QuoteSurcharge[], surcharge: QuoteSurcharge | null): void {
  if (!surcharge || items.some((item) => item.id === surcharge.id)) return;
  items.push(surcharge);
}

function dedupeQuoteSurcharges(items: QuoteSurcharge[]): QuoteSurcharge[] {
  const seen = new Set<string>();
  const result: QuoteSurcharge[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function getMotorBrand(design: SalesQuoteDesign | undefined): MotorOption["brand"] | undefined {
  const motorType = design?.motor_type;
  const remoteType = design?.remote_type;
  const selected = MOTORIZATION_OPTIONS.find(
    (option) => option.name === motorType || option.name === remoteType
  );
  return selected?.brand;
}

function getMotorOptionSurcharge(
  productType: string,
  optionName: string | null | undefined,
  preferredBrand?: MotorOption["brand"]
): QuoteSurcharge | null {
  if (!optionName) return null;

  const option =
    MOTORIZATION_OPTIONS.find(
      (candidate) => candidate.name === optionName && candidate.brand === preferredBrand
    ) || MOTORIZATION_OPTIONS.find((candidate) => candidate.name === optionName);

  if (!option) return null;

  return {
    id: slugifySurcharge(`${productType}-automatic-motorization-${option.brand}-${option.name}`),
    name: `${option.brand}: ${option.name}`,
    type: "fixed",
    value: option.price,
    quantity: 1,
    category: "Motorization Components",
    portalLabel: option.name,
  };
}

function getAutomaticOptionSurcharges(
  productType: string,
  design: SalesQuoteDesign | undefined,
  width?: number | null
): QuoteSurcharge[] {
  if (!design) return [];

  const surcharges: QuoteSurcharge[] = [];
  const opts = (design.options_json as Record<string, unknown> | undefined) || {};
  const liftSystem = design.lift_system;
  const lightControl = String(opts.light_control || "");
  const cellSize = String(opts.cell_size || "");
  const controlType = String(opts.control_type || "");
  const cordLoopRelease = String(opts.cord_loop_release || "");
  const hubRequired =
    opts.hub_required === true ||
    String(opts.hub_required || "").toLowerCase() === "true" ||
    String(opts.hub_required || "").toLowerCase() === "yes";
  const motorBrand = getMotorBrand(design);

  if (productType === "Shutters") {
    for (const surcharge of getAutomaticShutterOptionSurcharges(design, productType)) {
      appendSurcharge(surcharges, surcharge);
    }
  }

  if (productType === "Mini Blinds") {
    for (const surcharge of getMiniBlindAutomaticSurcharges(opts)) {
      appendSurcharge(surcharges, surcharge);
    }
  }

  if (productType === "Roller Shades") {
    // Automatic surcharges per the Norman 2026 Retail Guide (July 1, 2026),
    // Soluna Roller Shades page.
    if (liftSystem === "Smart Release" || cordLoopRelease === "Smart Release") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROLLER_SURCHARGES, "SmartRelease"),
          "Lift System",
          "Smart Release"
        )
      );
    }
    if (design.shade_type === "Dual Rollers") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROLLER_SURCHARGES, "Dual Shade"),
          "Shade Type"
        )
      );
    }
    if (design.shade_type === "Common Valance") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROLLER_SURCHARGES, "Coupled Shade"),
          "Shade Type"
        )
      );
    }
    const valancePrice = getRollerValanceSurchargePrice(design.valance, width ?? 0);
    if (valancePrice !== null) {
      appendSurcharge(surcharges, {
        id: slugifySurcharge(`${productType}-automatic-valance-${getRollerValanceLadder(design.valance)}`),
        name: `Valance / Fascia (${design.valance})`,
        type: "fixed",
        value: valancePrice,
        quantity: 1,
        category: "Automatic Option Surcharges",
        portalLabel: design.valance ?? "Valance",
      });
    }
    if (String(opts.premium_hardware || "") === "Yes") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROLLER_SURCHARGES, "Cordless Operating Pole / Premium Hardware"),
          "Premium Hardware"
        )
      );
    }
  }

  if (productType === "Honeycomb Shades") {
    // Automatic surcharges per the Norman 2026 Retail Guide (July 1, 2026),
    // Portrait Honeycomb page. Legacy lift-system values ("Smart Release",
    // "Top Down-Bottom Up") from saved quotes keep resolving.
    const operatingSystem = liftSystem || "";
    const canonicalCellSize = canonicalizeHoneycombCellSize(cellSize) || "";
    const isFrameSize = isHoneycombFrameCellSize(canonicalCellSize);
    const isSmartFitOs = operatingSystem.startsWith("SmartFit");
    // Legacy saved designs marked dual SmartFit shades via shade_type.
    const isDualSmartFit =
      operatingSystem === "SmartFit Dual Shade" || design.shade_type === "Day/Night*";

    if (operatingSystem === "SmartRelease" || operatingSystem === "Smart Release") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(HONEYCOMB_SURCHARGES, "SmartRelease"),
          "Operating System",
          "SmartRelease"
        )
      );
    } else if (operatingSystem.includes("Cord Loop")) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(HONEYCOMB_SURCHARGES, "Continuous Cord Loop"),
          "Operating System"
        )
      );
    }

    if (
      operatingSystem.includes("TDBU") ||
      /\bTD\b/.test(operatingSystem) ||
      operatingSystem === "Top Down-Bottom Up"
    ) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(HONEYCOMB_SURCHARGES, "TDBU (Top Down Bottom Up)"),
          "Operating System",
          "TDBU | TD"
        )
      );
    }

    if (isFrameSize) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(
            HONEYCOMB_SURCHARGES,
            isDualSmartFit ? "SmartFit Dual Shade with Frame" : "SmartFit with Frame"
          ),
          "Shade Size"
        )
      );
    } else if (isSmartFitOs) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(
            HONEYCOMB_SURCHARGES,
            operatingSystem === "SmartFit Dual Shade" ? "SmartFit Dual Shade" : "SmartFit"
          ),
          "Operating System"
        )
      );
    }

    // Day & Night systems are priced as two shades (100% of the grid price).
    if (isHoneycombDayNightOperatingSystem(operatingSystem)) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(HONEYCOMB_SURCHARGES, "Day & Night (priced as 2 shades)"),
          "Operating System"
        )
      );
    }

    // 20% fabric surcharge for the RD | Sheer | Solus | FR Essentials family
    // — detected from the dealer availability flag when a picker color is
    // stored, with a text fallback for legacy fabric labels.
    const fabricColorCode = String(opts[PRODUCT_COLOR_CODE_DETAIL] || "");
    const fabricHaystack = [
      String(opts[PRODUCT_COLOR_TYPE_DETAIL] || ""),
      String(opts[PRODUCT_COLOR_COLLECTION_DETAIL] || ""),
      design.fabric || "",
    ].join(" ");
    const surchargedFabric = fabricColorCode
      ? isHoneycombDealerColorSurcharged(canonicalCellSize, fabricColorCode)
      : /room darkening|blackout|sheer|solus|fr essentials/i.test(fabricHaystack) ||
        /\s(RD|BO)\b/.test(fabricHaystack);
    if (surchargedFabric) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(
            HONEYCOMB_SURCHARGES,
            "Room Darkening | Sheer | Solus | FR Essentials Fabric"
          ),
          "Fabric"
        )
      );
    }

    if (String(opts.hold_downs || "") === "Magnetic") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(HONEYCOMB_SURCHARGES, "Magnetic Hold Down"),
          "Hold Down Brackets"
        )
      );
    }
  }

  if (productType === "Roman Shades") {
    // Automatic surcharges per the Norman 2026 Retail Guide (July 1, 2026),
    // Centerpiece Roman Shades page.
    if (liftSystem === "SmartRelease") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROMAN_SURCHARGES, "SmartRelease"),
          "Control Type",
          "SmartRelease"
        )
      );
    }
    if (design.shade_type === "Day & Night") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROMAN_SURCHARGES, "Day & Night (includes roller shade)"),
          "Shade Type"
        )
      );
    }
    const foldStyleSurcharges: Record<string, string> = {
      "Ribbon Banded": "Ribbon Banding",
      "Edge Banded": "Edge Banding / Border",
      "Soft Fold": "Soft Fold",
    };
    const foldStyleSurcharge = foldStyleSurcharges[String(opts.fold_style || "")];
    if (foldStyleSurcharge) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROMAN_SURCHARGES, foldStyleSurcharge),
          "Shade Style"
        )
      );
    }
    if (design.valance === "Fabric Valance" && width && width > 0) {
      appendSurcharge(surcharges, {
        id: slugifySurcharge(`${productType}-automatic-fabric-valance`),
        name: "Fabric Valance",
        type: "fixed",
        value: getRomanFabricValancePrice(width),
        quantity: 1,
        category: "Automatic Option Surcharges",
        portalLabel: "Fabric Valance",
      });
    }
    const poleSurcharges: Record<string, string> = {
      "Pole with Attachment": "Cordless Operating Pole",
      "Attachment Only": "Pole Attachment Only",
    };
    const poleSurcharge = poleSurcharges[String(opts.poles || "")];
    if (poleSurcharge) {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(productType, findSurcharge(ROMAN_SURCHARGES, poleSurcharge), "Poles")
      );
    }
    if (String(opts.hold_downs || "") === "Magnetic") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROMAN_SURCHARGES, "Magnetic Hold Down"),
          "Hold Down Brackets"
        )
      );
    }
    if (String(opts.lining || "") === "Blackout") {
      appendSurcharge(
        surcharges,
        toAutomaticSurcharge(
          productType,
          findSurcharge(ROMAN_SURCHARGES, "Blackout Lining"),
          "Lining",
          "Blackout"
        )
      );
    }
  }

  const selectedValance = typeof design.valance === "string" ? design.valance.toLowerCase() : "";
  const hasWoodValance =
    selectedValance.includes("premium wood") || selectedValance.includes("modern wood");

  // Legacy Roman valance values only — current roller wood valances price via
  // the fascia/valance ladder above, and current roman valances via the
  // Fabric Valance ladder.
  if (productType === "Roman Shades" && hasWoodValance) {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(ROMAN_SURCHARGES, "Premium Wood Light Guard"),
        "Valance"
      )
    );
  }

  if (productType === "Sheer Shades" && lightControl === "Room Darkening") {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(PERFECTSHEER_SURCHARGES, "Room Darkening Fabric"),
        "Light Control",
        "Room Darkening"
      )
    );
  }

  if (
    productType === "Smart Drapes" &&
    (design.shade_type === "Room Darkening" || /room darkening/i.test(design.fabric || ""))
  ) {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(SMARTDRAPE_SURCHARGES, "Room Darkening"),
        "Shade Type"
      )
    );
  }

  if (productType === "Vertical Blinds" && controlType === "Cordless Wand Operation") {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(VERTICAL_SURCHARGES, "Wand Control"),
        "Control Type"
      )
    );
  }

  if (design.motor_type) {
    const motorSurcharge = getMotorOptionSurcharge(productType, design.motor_type, motorBrand);
    // Day & Night shades use two motors (guide: "use single motor surcharge X 2").
    if (
      motorSurcharge &&
      ((productType === "Roman Shades" && design.shade_type === "Day & Night") ||
        (productType === "Honeycomb Shades" && liftSystem === "Motorized Day & Night"))
    ) {
      motorSurcharge.quantity = 2;
    }
    appendSurcharge(surcharges, motorSurcharge);
  }

  if (design.remote_type) {
    appendSurcharge(
      surcharges,
      getMotorOptionSurcharge(productType, design.remote_type, motorBrand)
    );
  }

  if (hubRequired) {
    appendSurcharge(surcharges, getMotorOptionSurcharge(productType, "Hub", motorBrand));
  }

  return surcharges;
}

function getAvailableSurcharges(
  productType: string,
  design: SalesQuoteDesign | undefined
): SurchargeCatalogItem[] {
  const base: SurchargeCatalogItem[] = [];

  switch (productType) {
    case "Shutters":
      if (design?.supplier === "Onyx") {
        base.push(
          ...ONYX_SHUTTER_PERCENTAGE_SURCHARGES.map((s) =>
            toCatalogItem(productType, s, "Onyx Shutter Surcharges")
          ),
          ...ONYX_SHUTTER_FIXED_SURCHARGES.map((s) =>
            toCatalogItem(productType, s, "Onyx Shutter Fixed Surcharges")
          )
        );
      } else {
        base.push(
          ...SHUTTER_PERCENTAGE_SURCHARGES.map((s) =>
            toCatalogItem(productType, s, "Shutter Percentage Surcharges")
          ),
          ...SHUTTER_FIXED_SURCHARGES.map((s) =>
            toCatalogItem(productType, s, "Shutter Fixed Surcharges")
          )
        );
      }
      break;
    case "Honeycomb Shades":
      base.push(
        ...HONEYCOMB_SURCHARGES.map((s) => toCatalogItem(productType, s, "Honeycomb Surcharges"))
      );
      break;
    case "Roller Shades":
      base.push(
        ...ROLLER_SURCHARGES.map((s) => toCatalogItem(productType, s, "Roller Surcharges"))
      );
      break;
    case "Roman Shades":
      base.push(...ROMAN_SURCHARGES.map((s) => toCatalogItem(productType, s, "Roman Surcharges")));
      break;
    case "Sheer Shades":
      base.push(
        ...PERFECTSHEER_SURCHARGES.map((s) =>
          toCatalogItem(productType, s, "PerfectSheer Surcharges")
        )
      );
      break;
    case "Vertical Blinds":
      base.push(
        ...VERTICAL_SURCHARGES.map((s) => toCatalogItem(productType, s, "Vertical Surcharges"))
      );
      break;
    case "Faux Wood Blinds":
      base.push(
        ...FAUX_WOOD_SURCHARGES.map((s) => toCatalogItem(productType, s, "Faux Wood Surcharges"))
      );
      break;
    case "Wood Blinds":
      base.push(
        ...WOOD_BLIND_SURCHARGES.map((s) => toCatalogItem(productType, s, "Wood Blind Surcharges"))
      );
      break;
    case "Smart Drapes":
      base.push(
        ...SMARTDRAPE_SURCHARGES.map((s) => toCatalogItem(productType, s, "SmartDrape Surcharges"))
      );
      break;
    default:
      break;
  }

  const opts = (design?.options_json as Record<string, string> | undefined) || {};
  // Honeycomb motorized operating systems include TD / TDBU / Day & Night
  // variants — treat every "Motorized*" lift system as motorized.
  const motorized =
    (design?.lift_system || "").startsWith("Motorized") || opts.control_type === "Motorized";
  const supportsMotorization = [
    "Roller Shades",
    "Roman Shades",
    "Honeycomb Shades",
    "Sheer Shades",
    "Smart Drapes",
  ].includes(productType);

  if (supportsMotorization && motorized) {
    base.push(
      ...MOTORIZATION_OPTIONS.map((option) => ({
        id: slugifySurcharge(
          `${productType}-motorization-${option.brand}-${option.name}-${option.price}`
        ),
        name: `${option.brand}: ${option.name}`,
        portalLabel: option.name,
        type: "fixed" as const,
        value: option.price,
        quantity: 1,
        category: "Motorization Components",
      }))
    );

    if (productType === "Roller Shades") {
      for (const system of Object.values(ROLLER_MOTORIZATION)) {
        base.push(
          ...system.components.map((option) => ({
            id: slugifySurcharge(
              `${productType}-roller-motorization-${system.name}-${option.name}-${option.price}`
            ),
            name: `${system.name}: ${option.name}`,
            portalLabel: option.name,
            type: "fixed" as const,
            value: option.price,
            quantity: 1,
            category: "Roller Motorization Components",
          }))
        );
      }
    }
  }

  return dedupeSurcharges(base);
}

function calculateSurchargeTotal(basePrice: number, surcharges: QuoteSurcharge[]): number {
  const total = surcharges.reduce((sum, item) => {
    if (item.type === "percentage") {
      return sum + basePrice * (item.value / 100);
    }
    return sum + item.value * Math.max(1, item.quantity || 1);
  }, 0);

  return Math.round(total * 100) / 100;
}

function hasMotorizationSurcharge(surcharges: QuoteSurcharge[]): boolean {
  return surcharges.some(
    (item) =>
      item.category.toLowerCase().includes("motorization") ||
      item.id.toLowerCase().includes("motorization")
  );
}

function formatSurchargePrice(item: Pick<QuoteSurcharge, "type" | "value">): string {
  if (item.type === "percentage") return `${item.value}%`;
  return `$${item.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatMoney(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "$0";
  return `$${numeric.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeLineItemQuantity(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getShutterProgramPricing(
  supplier: string | null | undefined,
  programName: string | undefined
): ShutterProgram | null {
  if (!supplier || !programName) return null;
  const programs = supplier === "Onyx" ? ONYX_SHUTTER_PROGRAMS : NORMAN_SHUTTER_PROGRAMS;
  return programs.find((program) => program.name === programName) ?? null;
}

function PriceExplanation({
  design,
  productType,
  widthIn,
  heightIn,
  rawSqft,
  sqft,
  quantity,
  currentRetailPerSqft,
}: {
  design: SalesQuoteDesign | undefined;
  productType: string;
  widthIn: number;
  heightIn: number;
  rawSqft: number | null;
  sqft: number | null;
  quantity: number;
  currentRetailPerSqft: number | null;
}) {
  const options = (design?.options_json as Record<string, unknown> | undefined) || {};
  const automaticSurcharges = getAutomaticOptionSurcharges(productType, design, widthIn);
  const automaticIds = new Set(automaticSurcharges.map((item) => item.id));
  const selectedSurcharges = dedupeQuoteSurcharges([
    ...automaticSurcharges,
    ...getSelectedSurcharges(design),
  ]);
  const programName = getShutterProgramName(design);
  const shutterProgram =
    productType === "Shutters"
      ? getShutterProgramPricing(design?.supplier, programName)
      : null;
  const auditSurcharges: PricingAuditSurcharge[] = selectedSurcharges.map((item) => ({
    ...item,
    automatic: automaticIds.has(item.id),
  }));

  return (
    <PricingAuditPanel
      productType={productType}
      supplier={design?.supplier ?? null}
      programName={programName ?? null}
      widthIn={widthIn}
      heightIn={heightIn}
      rawSqft={rawSqft}
      billableSqft={sqft}
      quantity={quantity}
      savedUnitPrice={Number(design?.unit_price) || 0}
      options={options}
      currentRetailPerSqft={currentRetailPerSqft}
      wholesaleRate={shutterProgram?.wholesalePrice ?? null}
      tariffPercent={shutterProgram?.tariff ?? 0}
      surcharges={auditSurcharges}
    />
  );
}

/**
 * Determine price group based on fabric selection
 */
function getFabricPriceGroup(
  productType: string,
  fabric: string | null,
  fabricGroup?: string,
  romanFabricCategory?: string
): string | undefined {
  if (!fabric && !fabricGroup && !romanFabricCategory) return undefined;

  if (productType === "Roller Shades" && fabric) {
    return getRollerFabricPriceGroup(fabric);
  }

  if (productType === "Roman Shades") {
    const romanFabricKey = fabric || romanFabricCategory;
    return romanFabricKey ? getRomanFabricPriceGroup(romanFabricKey) : undefined;
  }

  if (productType === "Vertical Blinds" && fabricGroup) {
    return getVerticalFabricPriceGroup(fabricGroup);
  }

  return undefined;
}

function getFieldValue(design: SalesQuoteDesign | undefined, field: string): string | null {
  if (!design) return null;
  if (field.startsWith("json:")) {
    const jsonKey = field.slice(5);
    return (design.options_json as Record<string, string>)?.[jsonKey] || null;
  }
  if (BOOLEAN_FIELDS.has(field)) {
    const val = design[field as keyof SalesQuoteDesign];
    if (val === true) return "Yes";
    if (val === false) return "No";
    return null;
  }
  return (design[field as keyof SalesQuoteDesign] as string) || null;
}

function setFieldValue(
  field: string,
  value: unknown,
  design: SalesQuoteDesign | undefined,
  onUpdate: (field: string, value: unknown) => void
) {
  if (field.startsWith("json:")) {
    const jsonKey = field.slice(5);
    const currentJson = (design?.options_json as Record<string, unknown>) || {};
    onUpdate("options_json", { ...currentJson, [jsonKey]: value });
  } else if (BOOLEAN_FIELDS.has(field)) {
    onUpdate(field, value === "Yes");
  } else {
    onUpdate(field, value);
  }
}

function getJsonFieldKey(field: string): string | null {
  return field.startsWith("json:") ? field.slice(5) : null;
}

function getDependentProductColorField(productType: string, changedField: string): string | null {
  if (productType === "Roman Shades" && changedField === "json:roman_fabric_category") {
    return "fabric";
  }
  // Honeycomb cell-size changes clear the fabric only when the color is no
  // longer offered for the new size (see the dedicated handleUpdate cascade).
  if (productType === "Honeycomb Shades" && changedField === "json:light_control") {
    return "fabric";
  }
  if (productType === "Sheer Shades" && changedField === "json:light_control") {
    return "fabric";
  }
  if (productType === "Smart Drapes" && changedField === "shade_type") {
    return "fabric";
  }
  if (productType === "Faux Wood Blinds" && changedField === "json:product_line") {
    return "json:color";
  }
  if (productType === "Mini Blinds" && changedField === "json:slat_size") {
    return "json:color";
  }
  if (productType === "Vertical Blinds" && changedField === "json:fabric_group") {
    return "json:vertical_color";
  }
  return null;
}

function withJsonField(
  optionsJson: Record<string, unknown>,
  field: string,
  value: unknown
): Record<string, unknown> {
  const jsonKey = getJsonFieldKey(field);
  return jsonKey ? { ...optionsJson, [jsonKey]: value } : optionsJson;
}

function getLightControlFromProductColor(row: ProductColorOption): string | null {
  const type = `${row.fabricType} ${row.collection}`.toLowerCase();
  if (type.includes("room darkening") || type.includes("blackout")) return "Room Darkening";
  if (type.includes("light filtering") || type.includes("sheer")) return "Light Filtering";
  return null;
}

function getSmartDrapeShadeTypeFromProductColor(row: ProductColorOption): string | null {
  const type = `${row.fabricType} ${row.collection}`.toLowerCase();
  if (type.includes("room darkening")) return "Room Darkening";
  if (type.includes("essentials") || type.includes("lakeshore")) return "Light Filtering Essentials";
  if (type.includes("light filtering")) return "Light Filtering";
  return null;
}

function getHoneycombCellSizeFromProgram(programId: string | null | undefined): string | null {
  switch (programId) {
    case "honeycomb_9_16in_cordless_single_cell":
      return '9/16" Single Cell';
    case "honeycomb_1_2in_cordless_double":
      return '1/2" Double Cell';
    case "honeycomb_3_8in_cordless_single_and_3_4in_single":
    case "honeycomb_flame_resistant_fabrics":
      return '3/8" Single Cell';
    case "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg1":
    case "honeycomb_3_4in_cordless_single_and_1_1_4in_single_pg2":
      return '3/4" Single Cell';
    case "honeycomb_3_4in_cordless_double_and_1_1_4in_single":
      return '3/4" Double Cell';
    default:
      return null;
  }
}

function getFauxWoodProductLineFromProductId(productId: string): string | null {
  if (productId === "smartprivacy_faux") return "SmartPrivacy";
  if (productId === "faux_wood") return "Ultimate";
  return null;
}

function applyShutterRoutePatch(
  patch: ShutterRoutePatch,
  design: SalesQuoteDesign | undefined,
  onUpdate: (field: string, value: unknown) => void
) {
  const currentJson = (design?.options_json as Record<string, unknown>) || {};
  onUpdate("supplier", patch.supplier);
  onUpdate("material", patch.material);
  onUpdate("options_json", { ...currentJson, ...patch.options });
}

function needsShutterRoutePatch(
  design: SalesQuoteDesign | undefined,
  patch: ShutterRoutePatch
): boolean {
  const currentJson = (design?.options_json as Record<string, unknown>) || {};
  if (design?.supplier !== patch.supplier) return true;
  if ((design?.material || null) !== patch.material) return true;

  return Object.entries(patch.options).some(([key, value]) => (currentJson[key] || null) !== value);
}

function getShutterProgramName(design: SalesQuoteDesign | undefined): string | undefined {
  if (!design) return undefined;

  const options = (design.options_json as Record<string, unknown>) || {};
  if (design.supplier === "Norman") {
    if (options.material_type === "Composite" && typeof options.composite_subtype === "string") {
      return options.composite_subtype;
    }
    if (typeof design.material === "string" && design.material.trim()) {
      return design.material;
    }
    return undefined;
  }

  return typeof design.material === "string" && design.material.trim()
    ? design.material
    : undefined;
}

function stripPriceFreezeMetadata(options: Record<string, unknown>): Record<string, unknown> {
  const {
    manual_price_override: _manualPriceOverride,
    sent_price_snapshot: _sentPriceSnapshot,
    ...rest
  } = options;
  return rest;
}

function withoutProductColorDetails(options: Record<string, unknown>): Record<string, unknown> {
  const {
    [ROLLER_FABRIC_COLOR_ID_DETAIL]: _fabricColorId,
    [ROLLER_FABRIC_COLOR_COLLECTION_DETAIL]: _fabricColorCollection,
    [ROLLER_FABRIC_COLOR_CODE_DETAIL]: _fabricColorCode,
    [ROLLER_FABRIC_COLOR_NAME_DETAIL]: _fabricColorName,
    [ROLLER_FABRIC_COLOR_TYPE_DETAIL]: _fabricColorType,
    [PRODUCT_COLOR_PRODUCT_ID_DETAIL]: _fabricProductId,
    [PRODUCT_COLOR_PROGRAM_DETAIL]: _fabricProgramId,
    [PRODUCT_COLOR_SURCHARGE_DETAIL]: _fabricSurchargeId,
    ...rest
  } = options;
  return rest;
}

function stringOption(options: Record<string, unknown>, key: string): string | null {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function getFabricCompletedDisplayValue(
  design: SalesQuoteDesign | undefined,
  value: string
): string {
  const options = (design?.options_json as Record<string, unknown> | undefined) || {};
  const code = stringOption(options, PRODUCT_COLOR_CODE_DETAIL);
  const name = stringOption(options, PRODUCT_COLOR_NAME_DETAIL);
  return code && name ? `${value}: ${code} - ${name}` : value;
}

function getCompletedDisplayValue(
  design: SalesQuoteDesign | undefined,
  field: string
): string | null {
  const value = getFieldValue(design, field);
  if (!value) return null;
  if (field === "fabric" || field === "json:color" || field === "json:vertical_color") {
    return getFabricCompletedDisplayValue(design, value);
  }
  return value;
}

function hasOptionValue(value: string | null): value is string {
  return value !== null && value !== undefined && value !== "";
}

function getOptionSlotValue(
  design: SalesQuoteDesign | undefined,
  field: string
): string | null {
  return getCompletedDisplayValue(design, field);
}

function partitionOptionSlots(
  options: GridOption[],
  mandatoryFields: readonly string[]
): { mandatory: GridOption[]; optional: GridOption[] } {
  const mandatory = new Set(mandatoryFields);
  return {
    mandatory: options.filter((option) => mandatory.has(option.field)),
    optional: options.filter((option) => !mandatory.has(option.field)),
  };
}

const OPTIONAL_MOTOR_FIELDS = new Set(["motor_type", "json:hub_required", "remote_type"]);
const OPTIONAL_SHUTTER_DETAIL_FIELDS = new Set([
  "json:split_tilt",
  "json:extension_rod",
  "json:t_post",
  "json:astragal",
]);
const ROLLER_MORE_OPTION_FIELDS = new Set([
  "json:light_guard_rails",
  "json:roll_type",
  "json:premium_hardware",
  "json:premium_hardware_color",
]);

function getShutterMandatoryFields(options: GridOption[]): string[] {
  return options
    .map((option) => option.field)
    .filter(
      (field) =>
        !OPTIONAL_MOTOR_FIELDS.has(field) &&
        !OPTIONAL_SHUTTER_DETAIL_FIELDS.has(field) &&
        !field.includes("divider_rail")
    );
}

function getShadeMandatoryFields(productType: string, options: GridOption[]): string[] {
  const allFields = options.map((option) => option.field);
  switch (productType) {
    case "Roller Shades":
      return [
        "mount_type",
        "shade_type",
        "fabric",
        "lift_system",
        "valance",
        "json:hem_bar",
      ].filter((field) => allFields.includes(field));
    case "Roman Shades":
      return [
        "mount_type",
        "shade_type",
        "lift_system",
        "json:chain_type",
        "json:chain_location",
        "json:chain_length",
        "motor_type",
        "remote_type",
        "json:fold_style",
        "json:roman_fabric_category",
        "fabric",
        "json:back_fabric",
        "valance",
        "json:valance_returns",
        "json:lining",
      ].filter((field) => allFields.includes(field));
    case "Honeycomb Shades":
      return [
        "mount_type",
        "json:cell_size",
        "lift_system",
        "motor_type",
        "remote_type",
        "json:light_control",
        "fabric",
        "json:back_fabric",
      ].filter((field) => allFields.includes(field));
    case "Sheer Shades":
      return ["mount_type", "json:light_control", "lift_system", "fabric"].filter((field) =>
        allFields.includes(field)
      );
    case "Mini Blinds":
      return ["mount_type", "json:slat_size", "json:color", "json:light_control"].filter(
        (field) => allFields.includes(field)
      );
    case "Faux Wood Blinds":
      return ["mount_type", "json:slat_size", "json:product_line", "json:color"].filter((field) =>
        allFields.includes(field)
      );
    case "Wood Blinds":
      return ["mount_type", "json:slat_size", "json:color"].filter((field) =>
        allFields.includes(field)
      );
    case "Vertical Blinds":
      return [
        "mount_type",
        "json:fabric_group",
        "json:vertical_color",
        "json:stack_option",
        "json:control_type",
      ].filter((field) => allFields.includes(field));
    case "Smart Drapes":
      return [
        "mount_type",
        "shade_type",
        "fabric",
        "json:stack_option",
        "json:control_type",
        "json:control_side",
      ].filter((field) => allFields.includes(field));
    default:
      return allFields.filter((field) => !OPTIONAL_MOTOR_FIELDS.has(field));
  }
}

function OptionSlot({
  option,
  value,
  requirement,
  isOpen,
  onToggle,
  renderSelectedDirect = false,
  children,
}: {
  option: GridOption;
  value: string | null;
  requirement: OptionSlotRequirement;
  isOpen: boolean;
  onToggle: () => void;
  renderSelectedDirect?: boolean;
  children: ReactNode;
}) {
  const selected = hasOptionValue(value);
  const isYesNo = option.type === "yes-no";
  const isInlineChoice = isYesNo || (option.type === "buttons" && option.options.length <= 2);
  const isDirectSelect = option.type === "select";
  const showConfirmedCard = selected && !renderSelectedDirect && !isOpen;

  return (
    <div
      className={cn(
        "quote-option-slot",
        selected && "quote-option-slot--selected",
        isOpen && (!isDirectSelect || showConfirmedCard) && "quote-option-slot--open",
        isDirectSelect && !showConfirmedCard && "quote-option-slot--select",
        isInlineChoice && !showConfirmedCard && "quote-option-slot--inline-choice",
        requirement === "mandatory" ? "quote-option-slot--mandatory" : "quote-option-slot--optional"
      )}
    >
      {showConfirmedCard ? (
        <>
          <button
            type="button"
            className="quote-option-slot__confirmed"
            onClick={onToggle}
            aria-expanded={isOpen}
            title={`${option.label}: ${value}`}
          >
            <span className="quote-option-slot__label">{option.label}</span>
            <span className="quote-option-slot__confirmed-value">
              <span>{value}</span>
              <ChevronDown className="quote-option-slot__icon" aria-hidden="true" />
            </span>
          </button>
          {isOpen && <div className="quote-option-slot__control">{children}</div>}
        </>
      ) : isInlineChoice ? (
        <>
          <div className="quote-option-slot__static">
            <span className="quote-option-slot__label">{option.label}</span>
          </div>
          <div className="quote-option-slot__inline-control">{children}</div>
        </>
      ) : isDirectSelect ? (
        <>
          <div className="quote-option-slot__static">
            <span className="quote-option-slot__label">{option.label}</span>
          </div>
          <div className="quote-option-slot__direct-control">{children}</div>
        </>
      ) : (
        <>
          <button
            type="button"
            className="quote-option-slot__trigger"
            onClick={onToggle}
            aria-expanded={isOpen}
            title={selected ? `${option.label}: ${value}` : option.label}
          >
            <span className="quote-option-slot__label">{option.label}</span>
            <span className="quote-option-slot__value">{selected ? value : option.label}</span>
            <ChevronDown className="quote-option-slot__icon" aria-hidden="true" />
          </button>
          {isOpen && <div className="quote-option-slot__control">{children}</div>}
        </>
      )}
    </div>
  );
}

function OptionSlotRows({
  mandatoryOptions,
  optionalOptions,
  renderSlot,
}: {
  mandatoryOptions: GridOption[];
  optionalOptions: GridOption[];
  renderSlot: (option: GridOption, requirement: OptionSlotRequirement) => ReactNode;
}) {
  return (
    <div className="quote-option-slots">
      {mandatoryOptions.length > 0 && (
        <div className="quote-option-slot-row quote-option-slot-row--mandatory">
          {mandatoryOptions.map((option) => renderSlot(option, "mandatory"))}
        </div>
      )}
      {optionalOptions.length > 0 && (
        <div className="quote-option-slot-row quote-option-slot-row--optional">
          {optionalOptions.map((option) => renderSlot(option, "optional"))}
        </div>
      )}
    </div>
  );
}

type ConfirmedOptionItem = {
  option: GridOption;
  value: string;
};

function getConfirmedOptionItems(
  design: SalesQuoteDesign | undefined,
  options: readonly GridOption[]
): ConfirmedOptionItem[] {
  return options
    .map((option) => ({ option, value: getOptionSlotValue(design, option.field) }))
    .filter((item): item is ConfirmedOptionItem => hasOptionValue(item.value));
}

function getEditableOptionRows(
  rows: { mandatory: GridOption[]; optional: GridOption[] },
  design: SalesQuoteDesign | undefined,
  editingField: string | null
): { mandatory: GridOption[]; optional: GridOption[] } {
  const shouldShowOption = (option: GridOption) =>
    option.field === editingField || !hasOptionValue(getOptionSlotValue(design, option.field));

  return {
    mandatory: rows.mandatory.filter(shouldShowOption),
    optional: rows.optional.filter(shouldShowOption),
  };
}

function ConfirmedOptionStrip({
  items,
  editingField,
  onReset,
}: {
  items: ConfirmedOptionItem[];
  editingField: string | null;
  onReset: (field: string) => void;
}) {
  const visibleItems = editingField
    ? items.filter(({ option }) => option.field !== editingField)
    : items;

  if (visibleItems.length === 0) return null;

  return (
    <div className="quote-confirmed-options-strip" aria-label="Selected line item options">
      {visibleItems.map(({ option, value }) => (
        <button
          key={option.key}
          type="button"
          className="quote-confirmed-option-chip"
          onClick={() => onReset(option.field)}
          title={`${option.label}: ${value}`}
        >
          <span className="quote-confirmed-option-chip__label">{option.label}</span>
          <span className="quote-confirmed-option-chip__value">{value}</span>
        </button>
      ))}
    </div>
  );
}

const LINE_PRODUCT_TYPE_CLASSES: Record<string, string> = {
  Shutters: "quote-stacked-product--shutters",
  "Roller Shades": "quote-stacked-product--roller-shades",
  "Roman Shades": "quote-stacked-product--roman-shades",
  "Honeycomb Shades": "quote-stacked-product--honeycomb-shades",
  "Sheer Shades": "quote-stacked-product--sheer-shades",
  "Faux Wood Blinds": "quote-stacked-product--faux-wood-blinds",
  "Wood Blinds": "quote-stacked-product--wood-blinds",
  "Vertical Blinds": "quote-stacked-product--vertical-blinds",
  "Smart Drapes": "quote-stacked-product--smart-drapes",
};

function getLineProductTypeClass(productType: string) {
  return LINE_PRODUCT_TYPE_CLASSES[productType] ?? "quote-stacked-product--default";
}

function ProductTypeSwitcher({
  productType,
  onChangeProductType,
}: {
  productType: string;
  onChangeProductType?: (productType: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!onChangeProductType) {
    return (
      <span
        className={cn(
          "quote-line-product-type-badge quote-line-product-type-badge--static",
          getLineProductTypeClass(productType)
        )}
      >
        {productType}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={cn("quote-line-product-type-badge", getLineProductTypeClass(productType))}
        title="Change product type for this line item"
      >
        {productType}
      </button>
    );
  }

  return (
    <div className="quote-line-product-type-menu flex flex-wrap items-center gap-2" aria-label="Select line item product type">
      {PRODUCT_TYPES.filter((type) => type !== productType).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => {
            onChangeProductType(type);
            setIsEditing(false);
          }}
          className={cn("quote-line-product-type-choice", getLineProductTypeClass(type))}
        >
          {type}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="quote-line-product-type-cancel"
        aria-label="Cancel product type change"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function buildDraftShutterDesign(activeVariant: string): SalesQuoteDesign {
  const patch = getAutoShutterRoutePatch(activeVariant);

  return {
    id: "",
    line_item_id: "",
    variant: activeVariant,
    product_type: "Shutters",
    supplier: patch?.supplier ?? null,
    material: patch?.material ?? null,
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
    options_json: patch?.options ?? {},
    created_at: "",
  };
}

function SurchargePicker({
  productType,
  design,
  width,
  onUpdate,
}: {
  productType: string;
  design: SalesQuoteDesign | undefined;
  width?: number | null;
  onUpdate: (field: string, value: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);
  const automaticSurcharges = getAutomaticOptionSurcharges(productType, design, width);
  const savedSurcharges = getSelectedSurcharges(design);
  const selectedSurcharges = dedupeQuoteSurcharges([...automaticSurcharges, ...savedSurcharges]);
  const automaticIds = new Set(automaticSurcharges.map((item) => item.id));
  const catalog = getAvailableSurcharges(productType, design);
  const opts = (design?.options_json as Record<string, unknown> | undefined) || {};
  const basePrice = Number(opts.base_price) || 0;
  const surchargeTotal = calculateSurchargeTotal(basePrice, selectedSurcharges);
  const selectedIds = new Set(selectedSurcharges.map((item) => item.id));
  const available = catalog.filter((item) => !selectedIds.has(item.id));

  if (!design || (catalog.length === 0 && selectedSurcharges.length === 0)) {
    return null;
  }

  const persistSurcharges = (next: QuoteSurcharge[]) => {
    onUpdate("options_json", {
      ...opts,
      surcharges: next,
    });
  };

  const addSurcharge = (id: string) => {
    const item = catalog.find((catalogItem) => catalogItem.id === id);
    if (!item) return;

    const existingIndex = savedSurcharges.findIndex((selected) => selected.id === item.id);
    if (existingIndex >= 0 && item.type === "fixed") {
      const next = [...savedSurcharges];
      next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 };
      persistSurcharges(next);
    } else if (existingIndex === -1) {
      persistSurcharges([
        ...savedSurcharges,
        {
          id: item.id,
          name: item.name,
          type: item.type,
          value: item.value,
          quantity: 1,
          category: item.category,
          portalLabel: item.portalLabel,
        },
      ]);
    }

    setAdding(false);
  };

  const removeSurcharge = (id: string) => {
    persistSurcharges(savedSurcharges.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    persistSurcharges(
      savedSurcharges.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, quantity || 1) } : item
      )
    );
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setAdding((value) => !value)}
        className="quote-line-action-button quote-line-action-button--dashed"
        disabled={available.length === 0}
      >
        <Plus className="h-3 w-3" />
        Add Surcharge
      </Button>

      {adding && available.length > 0 && (
        <Select onValueChange={addSurcharge}>
          <SelectTrigger className="quote-line-surcharge-select">
            <SelectValue placeholder="Select surcharge or add-on..." />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {available.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name} · {formatSurchargePrice(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {selectedSurcharges.map((item) => {
        const isAutomatic = automaticIds.has(item.id);
        return (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs"
            title={item.category}
          >
            <span className="font-medium">{item.name}</span>
            <span className="text-muted-foreground">{formatSurchargePrice(item)}</span>
            {item.type === "fixed" && !isAutomatic && (
              <Input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => updateQuantity(item.id, parseInt(e.target.value, 10))}
                className="h-6 w-14 px-1 text-xs"
                aria-label={`${item.name} quantity`}
              />
            )}
            {!isAutomatic && (
              <button
                type="button"
                onClick={() => removeSurcharge(item.id)}
                className="text-muted-foreground hover:text-destructive"
                title="Remove surcharge"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {selectedSurcharges.length > 0 && (
        <span className="text-xs text-muted-foreground">
          Base: ${basePrice.toLocaleString("en-US", { maximumFractionDigits: 2 })} + Add-ons: $
          {surchargeTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </span>
      )}
    </div>
  );
}

function DeferredTextInput({
  value,
  onCommit,
  placeholder,
  className,
  autoFocus,
}: {
  value: string | null | undefined;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const committedValue = value || "";
  const [draft, setDraft] = useState(committedValue);

  useEffect(() => {
    setDraft(committedValue);
  }, [committedValue]);

  const commit = () => {
    if (draft !== committedValue) onCommit(draft);
  };

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(committedValue);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      className={className}
      autoFocus={autoFocus}
    />
  );
}

function DeferredNumberInput({
  value,
  onCommit,
  commitOnChange = false,
  placeholder,
  className,
  step = "0.01",
}: {
  value: number | string | null | undefined;
  onCommit: (value: number) => void;
  commitOnChange?: boolean;
  placeholder?: string;
  className?: string;
  step?: string;
}) {
  const committedValue = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(committedValue);
  const lastCommittedRef = useRef(parseFloat(committedValue) || 0);
  const draftRef = useRef(committedValue);
  const editingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const commitDraft = useCallback(
    (draftValue: string = draftRef.current) => {
      clearSaveTimer();
      const next = parseFloat(draftValue);
      if (!Number.isFinite(next) || next < 0 || next === lastCommittedRef.current) return;
      lastCommittedRef.current = next;
      onCommitRef.current(next);
    },
    [clearSaveTimer]
  );

  useEffect(() => {
    if (editingRef.current) return;
    setDraft(committedValue);
    draftRef.current = committedValue;
    lastCommittedRef.current = parseFloat(committedValue) || 0;
  }, [committedValue]);

  useEffect(
    () => () => {
      if (commitOnChange) commitDraft();
      else clearSaveTimer();
    },
    [clearSaveTimer, commitDraft, commitOnChange]
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    draftRef.current = nextDraft;

    if (!commitOnChange) return;

    const next = parseFloat(nextDraft);
    if (!Number.isFinite(next) || next < 0 || next === lastCommittedRef.current) return;
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => commitDraft(nextDraft), 200);
  };

  return (
    <Input
      type="number"
      step={step}
      value={draft}
      onChange={handleChange}
      onFocus={() => {
        editingRef.current = true;
      }}
      onBlur={() => {
        editingRef.current = false;
        commitDraft();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(committedValue);
          draftRef.current = committedValue;
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
      placeholder={placeholder}
    />
  );
}

// --- Step/Grid logic for Standard Shutter ---

function getDefiningSteps(design: SalesQuoteDesign | undefined): DefiningStep[] {
  const steps: DefiningStep[] = [];
  const opts = (design?.options_json as Record<string, string>) || {};

  if (design?.variant === "A") {
    steps.push({
      key: "wood_route",
      label: "Wood Type",
      field: "json:wood_route",
      options: WOOD_SHUTTER_ROUTES,
    });

    if (!opts.wood_route) return steps;

    if (opts.wood_route === "Premium Wood") {
      steps.push({
        key: "material",
        label: "Norman Program",
        field: "material",
        options: NORMAN_WOOD_MATERIALS,
      });
      return steps;
    }

    steps.push({
      key: "material",
      label: "Onyx Program",
      field: "material",
      options: ONYX_WOOD_MATERIALS,
    });
  }

  return steps;
}

function isStandardShutterComplete(design: SalesQuoteDesign | undefined): boolean {
  if (!design?.supplier) return false;
  const opts = design.options_json as Record<string, string>;

  if (design.supplier === "Norman") {
    if (!opts?.material_type) return false;
    if (opts.material_type === "Composite") return opts.composite_subtype === "Woodlore";
    return !!design.material;
  }

  if (design.supplier === "Onyx") {
    if (!opts?.material_type) return false;
    return !!design.material;
  }

  return false;
}

function isTrackedOrSpecialty(design: SalesQuoteDesign | undefined): boolean {
  if (!design?.supplier || design.supplier !== "Onyx") return false;
  const shutterType = (design.options_json as Record<string, string>)?.shutter_type;
  return shutterType === "Tracked Shutter" || shutterType === "Specialty Shutter";
}

function getStandardShutterGridOptions(design: SalesQuoteDesign | undefined): GridOption[] {
  const invisibleTiltPanelRate = getInvisibleTiltPanelRate(design);
  const isOnyxPolyProgram =
    !!design?.material &&
    ONYX_POLY_MATERIALS.includes(design.material as (typeof ONYX_POLY_MATERIALS)[number]);
  const frameOptions =
    design?.supplier === "Norman"
      ? NORMAN_WOODLORE_FRAME_TYPES
      : isOnyxPolyProgram
        ? ONYX_POLY_FRAME_TYPES
        : ONYX_WOOD_FRAME_TYPES;

  if (design?.supplier === "Onyx") {
    return [
      {
        key: "onyx_order_type",
        label: "Shutter Type",
        field: "json:onyx_order_type",
        type: "buttons",
        options: ONYX_ORDER_SHUTTER_TYPES,
      },
      {
        key: "size_type",
        label: "W/F",
        field: "json:size_type",
        type: "buttons",
        options: ONYX_SIZE_TYPES,
      },
      {
        key: "onyx_mount",
        label: "IM / OM",
        field: "json:onyx_mount",
        type: "buttons",
        options: ONYX_MOUNT_TYPES,
      },
      {
        key: "frame_type",
        label: "Frame Type",
        field: "json:frame_type",
        type: "buttons",
        options: frameOptions,
      },
      {
        key: "louver_size",
        label: "Louver Size",
        field: "louver_size",
        type: "buttons",
        options: SHUTTER_LOUVER_SIZES,
      },
      {
        key: "color",
        label: "Color",
        field: "json:color",
        type: "select",
        options: ONYX_COLORS,
      },
      {
        key: "hinge_color",
        label: "Hinge Color",
        field: "hinge_color",
        type: "select",
        options: ONYX_HINGE_COLORS,
      },
      {
        key: "panel_config",
        label: invisibleTiltPanelRate
          ? `Invisible Tilt Panels ($${invisibleTiltPanelRate}/panel)`
          : "Panel Configuration",
        field: "panel_config",
        type: "select",
        options: ONYX_PANEL_CONFIGS,
      },
      {
        key: "tilt_type",
        label: "Tilt Rod",
        field: "tilt_type",
        type: "select",
        options: ONYX_TILT_TYPES,
      },
      {
        key: "extension_rod",
        label: "Extension Rod",
        field: "json:extension_rod",
        type: "buttons",
        options: ONYX_EXTENSION_ROD_OPTIONS,
      },
      {
        key: "t_post",
        label: "T-Post",
        field: "json:t_post",
        type: "buttons",
        options: ONYX_T_POST_OPTIONS,
      },
      {
        key: "astragal",
        label: "Astragal",
        field: "json:astragal",
        type: "buttons",
        options: ONYX_ASTRAGAL_OPTIONS,
      },
    ];
  }

  return [
    {
      key: "frame_type",
      label: "Frame Type",
      field: "json:frame_type",
      type: "buttons",
      options: frameOptions,
    },
    {
      key: "louver_size",
      label: "Louver Size",
      field: "louver_size",
      type: "buttons",
      options: SHUTTER_LOUVER_SIZES,
    },
    {
      key: "tilt_type",
      label: "Tilt Type",
      field: "tilt_type",
      type: "buttons",
      options: SHUTTER_TILT_TYPES,
    },
    {
      key: "color",
      label: "Color",
      field: "json:color",
      type: "select",
      options: ONYX_COLORS,
    },
    {
      key: "hinge_color",
      label: "Hinge Color",
      field: "hinge_color",
      type: "select",
      options: SHUTTER_HINGE_COLORS,
    },
    {
      key: "panel_config",
      label: invisibleTiltPanelRate
        ? `Invisible Tilt Panels ($${invisibleTiltPanelRate}/panel)`
        : "Panel Configuration",
      field: "panel_config",
      type: "select",
      options: SHUTTER_PANEL_CONFIGS,
    },
    {
      key: "split_tilt",
      label: "Split Tilt",
      field: "json:split_tilt",
      type: "yes-no",
    },
  ];
}

// --- Small grid components ---

function GridButtonGroup({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
  hideLabel?: boolean;
}) {
  if (!options) return null;
  return (
    <div className="quote-style-option-field space-y-1">
      {!hideLabel && (
        <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
          {label}
        </Label>
      )}
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "quote-style-option-button rounded-md border text-[11px] font-semibold transition-all",
              value === opt
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent text-gray-900"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function GridSelect({
  label,
  options,
  value,
  onChange,
  grouped,
  hideLabel = false,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
  grouped?: GridSelectGroup[];
  hideLabel?: boolean;
}) {
  return (
    <div className="quote-style-option-field space-y-1">
      {!hideLabel && (
        <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
          {label}
        </Label>
      )}
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="quote-style-select h-6 min-h-0 px-2 py-0 text-[11px] text-gray-900">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {grouped
            ? grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-700 bg-accent">
                    {group.label}
                  </div>
                  {(group.items || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </div>
              ))
            : (options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RollerFabricAutocomplete({
  value,
  optionsJson,
  onSelect,
  onClear,
  hideLabel = false,
}: {
  value: string | null;
  optionsJson: Record<string, unknown>;
  onSelect: (fabricColor: MtsRollerFabricColor) => void;
  onClear: () => void;
  hideLabel?: boolean;
}) {
  const selectedColor = findMtsRollerFabricColorBySelection(
    stringOption(optionsJson, ROLLER_FABRIC_COLOR_COLLECTION_DETAIL) || value,
    stringOption(optionsJson, ROLLER_FABRIC_COLOR_CODE_DETAIL),
    stringOption(optionsJson, ROLLER_FABRIC_COLOR_NAME_DETAIL)
  );
  const selectedLabel = selectedColor?.label ?? value ?? "";
  const [query, setQuery] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (!hasDraft) setQuery(selectedLabel);
  }, [hasDraft, selectedLabel]);

  const results = useMemo(
    () => searchMtsRollerFabricColors(query, { limit: 400 }),
    [query]
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setIsOpen(true);
    setHasDraft(true);

    if (selectedLabel && nextQuery.trim() !== selectedLabel.trim()) {
      onClear();
    }
  };

  const handleSelect = (fabricColor: MtsRollerFabricColor) => {
    setQuery(fabricColor.label);
    setIsOpen(false);
    setHasDraft(false);
    onSelect(fabricColor);
  };

  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    setHasDraft(false);
    onClear();
  };

  return (
    <div className="quote-style-option-field relative col-span-2 space-y-1 lg:col-span-2">
      {!hideLabel && (
        <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
          Fabric Search
        </Label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          placeholder="Search collection, color, or code..."
          autoComplete="off"
          className="quote-style-input h-6 min-h-0 pl-7 pr-7 text-[11px] text-gray-900"
        />
        {(query || value) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear fabric search"
            title="Clear fabric search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[22rem] overflow-auto rounded-md border border-border bg-background shadow-lg">
          {results.length > 0 ? (
            results.map((fabricColor) => (
              <button
                key={fabricColor.id}
                type="button"
                disabled={!fabricColor.available || !fabricColor.programId}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (!fabricColor.available || !fabricColor.programId) return;
                  handleSelect(fabricColor);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                  selectedColor?.id === fabricColor.id && "bg-accent"
                )}
              >
                <span className="font-medium text-gray-950">{fabricColor.label}</span>
                <span className="text-xs text-muted-foreground">
                  {fabricColor.fabricType} · {getMtsRollerProgramLabel(fabricColor.programId)}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No Norman roller fabric matches.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductColorAutocomplete({
  productType,
  field,
  value,
  optionsJson,
  onSelect,
  onClear,
  hideLabel = false,
}: {
  productType: string;
  field: string;
  value: string | null;
  optionsJson: Record<string, unknown>;
  onSelect: (fabricColor: ProductColorOption) => void;
  onClear: () => void;
  hideLabel?: boolean;
}) {
  const selectedColor =
    findMtsProductColorById(productType, optionsJson, stringOption(optionsJson, PRODUCT_COLOR_ID_DETAIL)) ||
    findMtsProductColorBySelection(
      productType,
      optionsJson,
      stringOption(optionsJson, PRODUCT_COLOR_COLLECTION_DETAIL),
      stringOption(optionsJson, PRODUCT_COLOR_CODE_DETAIL),
      stringOption(optionsJson, PRODUCT_COLOR_NAME_DETAIL)
    );
  const selectedLabel = selectedColor ? getMtsProductColorValue(selectedColor) : value ?? "";
  const [query, setQuery] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (!hasDraft) setQuery(selectedLabel);
  }, [hasDraft, selectedLabel]);

  const results = useMemo(
    () => searchMtsProductColors(productType, optionsJson, query, { includeUnavailable: true, limit: 60 }),
    [optionsJson, productType, query]
  );

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setIsOpen(true);
    setHasDraft(true);

    if (selectedLabel && nextQuery.trim() !== selectedLabel.trim()) {
      onClear();
    }
  };

  const handleSelect = (fabricColor: ProductColorOption) => {
    setQuery(getMtsProductColorValue(fabricColor));
    setIsOpen(false);
    setHasDraft(false);
    onSelect(fabricColor);
  };

  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    setHasDraft(false);
    onClear();
  };

  const label = getMtsProductColorFieldLabel(productType, field);
  const noResultsLabel = label === "Color Search" ? "No Norman color matches." : "No Norman fabric matches.";

  return (
    <div className="quote-style-option-field relative col-span-2 space-y-1 lg:col-span-2">
      {!hideLabel && (
        <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
          {label}
        </Label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          placeholder="Search collection, color, or code..."
          autoComplete="off"
          className="quote-style-input h-6 min-h-0 pl-7 pr-7 text-[11px] text-gray-900"
        />
        {(query || value) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Clear ${label.toLowerCase()}`}
            title={`Clear ${label.toLowerCase()}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-72 w-full min-w-[22rem] overflow-auto rounded-md border border-border bg-background shadow-lg">
          {results.length > 0 ? (
            results.map((fabricColor) => {
              const disabled =
                !fabricColor.available || fabricColor.requiresProgram || !fabricColor.programId;
              return (
                <button
                  key={fabricColor.id}
                  type="button"
                  disabled={disabled}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (disabled) return;
                    handleSelect(fabricColor);
                  }}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                    selectedColor?.id === fabricColor.id && "bg-accent"
                  )}
                >
                  <span className="font-medium text-gray-950">{productColorLabel(fabricColor)}</span>
                  <span className="text-xs text-muted-foreground">
                    {fabricColor.fabricType || fabricColor.collection} ·{" "}
                    {getMtsProductColorProgramLabel(productType, fabricColor.programId)}
                    {fabricColor.requiresProgram ? " · choose a type first" : ""}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">{noResultsLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}

function GridYesNo({
  label,
  value,
  onChange,
  noFirst,
  hideLabel = false,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  noFirst?: boolean;
  hideLabel?: boolean;
}) {
  const items = noFirst ? ["No", "Yes"] : ["Yes", "No"];
  return (
    <div className="quote-style-option-field space-y-1">
      {!hideLabel && (
        <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
          {label}
        </Label>
      )}
      <div className="quote-style-yes-no-group">
        {items.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "quote-style-option-button quote-style-yes-no-button rounded-md border text-[11px] font-semibold transition-all",
              value === opt
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-accent text-gray-900"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Main DesignCard ---

function getPreferredSavedVariant(designs: SalesQuoteDesign[], variants: string[]): string {
  return variants.find((variant) => designs.some((design) => design.variant === variant)) || "A";
}

export function DesignCard({
  lineItem,
  lineNumber,
  lineNumberLabel,
  designs,
  onUpdateDesign,
  onCopyAll,
  onCopySome,
  onStack,
  copyMode: _copyMode,
  isCopyTarget,
  isSelectedTarget,
  onToggleCopyTarget,
  discountPercents = [],
  onApplyDiscount,
  isDiscountPending = false,
  isPriceLocked = false,
  onOpenMeasurement,
  onDelete,
  onCopyItem,
  onChangeProductType,
  onUpdateRoomName,
  onUpdateQuantity,
}: DesignCardProps) {
  const { isolated } = useQuoteBuilderDatabase();
  const isShutters = lineItem.product_type === "Shutters";
  const variants = useMemo(
    () => (isShutters ? SHUTTER_AUTO_VARIANTS.map((v) => v.variant) : ["A"]),
    [isShutters]
  );
  const [activeVariant, setActiveVariant] = useState(() =>
    getPreferredSavedVariant(designs, variants)
  );
  const userSelectedVariantRef = useRef(false);
  const lineItemIdRef = useRef(lineItem.id);
  const [editingRetail, setEditingRetail] = useState(false);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState(lineItem.room_name);
  const quantity = normalizeLineItemQuantity(lineItem.quantity);
  const [quantityDraft, setQuantityDraft] = useState(String(quantity));
  const [showLineNote, setShowLineNote] = useState(false);
  const [retailInput, setRetailInput] = useState("");
  const currentDesign = designs.find((d) => d.variant === activeVariant);
  const displayedUnitPrice = Number(currentDesign?.unit_price || 0);
  const displayedLineTotal = Math.round(displayedUnitPrice * quantity * 100) / 100;
  const displayedLineNumber = lineNumberLabel ?? (lineNumber > 0 ? `#${lineNumber}` : "");
  const currentOptions = (currentDesign?.options_json as Record<string, unknown> | undefined) || {};
  const discountPercent = Number(currentOptions.discount_percent) || 0;
  const hasDiscount = Boolean(currentDesign && discountPercent > 0);

  const { getRetailPrice, setRetailPrice } = useRetailPriceStore();

  useEffect(() => {
    const preferredVariant = getPreferredSavedVariant(designs, variants);
    const isNewLineItem = lineItemIdRef.current !== lineItem.id;

    if (isNewLineItem) {
      lineItemIdRef.current = lineItem.id;
      userSelectedVariantRef.current = false;
      setActiveVariant(preferredVariant);
      return;
    }

    if (!userSelectedVariantRef.current && !currentDesign && activeVariant !== preferredVariant) {
      setActiveVariant(preferredVariant);
    }
  }, [activeVariant, currentDesign, designs, lineItem.id, variants]);

  useEffect(() => {
    if (!isEditingRoomName) {
      setRoomNameDraft(lineItem.room_name);
    }
  }, [isEditingRoomName, lineItem.room_name]);

  useEffect(() => {
    setQuantityDraft(String(quantity));
  }, [quantity]);

  const handleVariantChange = (variant: string) => {
    userSelectedVariantRef.current = true;
    setActiveVariant(variant);
  };

  const startRoomNameEdit = () => {
    if (!onUpdateRoomName) return;
    setRoomNameDraft(lineItem.room_name);
    setIsEditingRoomName(true);
  };

  const cancelRoomNameEdit = () => {
    setRoomNameDraft(lineItem.room_name);
    setIsEditingRoomName(false);
  };

  const commitRoomNameEdit = () => {
    const nextRoomName = roomNameDraft.trim().replace(/\s+/g, " ");

    if (!nextRoomName) {
      cancelRoomNameEdit();
      return;
    }

    if (nextRoomName !== lineItem.room_name) {
      onUpdateRoomName?.(nextRoomName);
    }

    setRoomNameDraft(nextRoomName);
    setIsEditingRoomName(false);
  };

  const handleRoomNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitRoomNameEdit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelRoomNameEdit();
    }
  };

  const commitQuantityEdit = () => {
    const nextQuantity = normalizeLineItemQuantity(quantityDraft);
    setQuantityDraft(String(nextQuantity));

    if (nextQuantity !== quantity) {
      onUpdateQuantity?.(nextQuantity);
    }
  };

  const handleQuantityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitQuantityEdit();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setQuantityDraft(String(quantity));
      event.currentTarget.blur();
    }
  };

  // Compute sqft and current retail $/sqft for shutters
  const widthIn = measurementToInches(lineItem.width_whole, lineItem.width_fraction);
  const heightIn = measurementToInches(lineItem.height_whole, lineItem.height_fraction);
  const sqft =
    isShutters && widthIn > 0 && heightIn > 0 ? calculateSqft(widthIn, heightIn, true) : null;
  const rawSqft =
    isShutters && widthIn > 0 && heightIn > 0 ? calculateSqft(widthIn, heightIn, false) : null;
  const rollerShadeSpecWarnings = getRollerShadeSpecWarnings({
    productType: lineItem.product_type,
    widthInches: widthIn,
    heightInches: heightIn,
    fabricCollection:
      stringOption(currentOptions, ROLLER_FABRIC_COLOR_COLLECTION_DETAIL) || currentDesign?.fabric,
    fabricColorCode: stringOption(currentOptions, ROLLER_FABRIC_COLOR_CODE_DETAIL),
    shadeType: currentDesign?.shade_type,
    liftSystem: currentDesign?.lift_system,
  });
  const honeycombShadeSpecWarnings = getHoneycombShadeSpecWarnings({
    productType: lineItem.product_type,
    widthInches: widthIn,
    heightInches: heightIn,
    fabric: currentDesign?.fabric,
    fabricCollection: stringOption(currentOptions, PRODUCT_COLOR_COLLECTION_DETAIL),
    fabricColorCode: stringOption(currentOptions, PRODUCT_COLOR_CODE_DETAIL),
    fabricType: stringOption(currentOptions, PRODUCT_COLOR_TYPE_DETAIL),
    fabricProgramId: stringOption(currentOptions, PRODUCT_COLOR_PROGRAM_DETAIL),
    cellSize: stringOption(currentOptions, "cell_size"),
    shadeType: currentDesign?.shade_type,
    liftSystem: currentDesign?.lift_system,
  });
  const romanShadeSpecWarnings = getRomanShadeSpecWarnings({
    productType: lineItem.product_type,
    widthInches: widthIn,
    heightInches: heightIn,
    fabric: currentDesign?.fabric,
    fabricCollection:
      stringOption(currentOptions, PRODUCT_COLOR_COLLECTION_DETAIL) ||
      stringOption(currentOptions, "roman_fabric_category"),
    fabricColorCode: stringOption(currentOptions, PRODUCT_COLOR_CODE_DETAIL),
    fabricColorName: stringOption(currentOptions, PRODUCT_COLOR_NAME_DETAIL),
    foldStyle: stringOption(currentOptions, "fold_style"),
    shadeType: currentDesign?.shade_type,
    liftSystem: currentDesign?.lift_system,
    mountType: currentDesign?.mount_type,
    lining: stringOption(currentOptions, "lining"),
  });
  const miniBlindSpecWarnings = getMiniBlindSpecWarnings({
    productType: lineItem.product_type,
    widthInches: widthIn,
    heightInches: heightIn,
    slatSize: stringOption(currentOptions, "slat_size"),
  });
  const manufacturerSpecWarnings = [
    ...rollerShadeSpecWarnings,
    ...honeycombShadeSpecWarnings,
    ...romanShadeSpecWarnings,
    ...miniBlindSpecWarnings,
  ];

  const currentRetailPerSqft =
    isShutters && currentDesign?.supplier
      ? getRetailPrice(currentDesign.supplier, getShutterProgramName(currentDesign) ?? "")
      : null;

  const updateFields = (fields: Partial<SalesQuoteDesign>) => {
    onUpdateDesign({
      line_item_id: lineItem.id,
      variant: activeVariant,
      product_type: lineItem.product_type,
      ...(lineItem.product_type === "Mini Blinds"
        ? { supplier: "Norman", material: "CityLights Cordless Aluminum Blinds" }
        : {}),
      ...fields,
    });
  };

  const updateField = (field: string, value: unknown) => {
    updateFields({
      [field]: value,
    });
  };

  const handleRemoveDiscount = () => {
    if (!currentDesign || discountPercent <= 0) return;
    updateFields(removeQuoteDesignDiscount(currentDesign));
  };

  const handleRecalculateLockedPrice = () => {
    if (!currentDesign || widthIn === 0 || heightIn === 0) return;

    const opts = (currentDesign.options_json as Record<string, unknown>) || {};
    const fabricGroup = opts?.fabric_group as string | undefined;
    const romanFabricCategory = opts?.roman_fabric_category as string | undefined;
    const cellSize = opts?.cell_size as string | undefined;
    const shutterProgram = isShutters ? getShutterProgramName(currentDesign) : undefined;
    const retailOverride =
      isShutters && currentDesign.supplier && shutterProgram
        ? (getRetailPrice(currentDesign.supplier, shutterProgram) ?? undefined)
        : undefined;

    const priceBreakdown = getProductPriceBreakdown({
      productType: lineItem.product_type,
      width: widthIn,
      height: heightIn,
      priceGroup: getFabricPriceGroup(
        lineItem.product_type,
        currentDesign.fabric,
        fabricGroup,
        romanFabricCategory
      ),
      productLine: opts?.product_line as string | undefined,
      fabricGroup,
      shadeType: currentDesign.shade_type || undefined,
      program: shutterProgram || currentDesign.material || undefined,
      catalogProgramId: opts?.[PRODUCT_COLOR_PROGRAM_DETAIL] as string | undefined,
      supplier: currentDesign.supplier || undefined,
      retailPriceOverride: retailOverride,
      cellSize,
      slatSize: opts?.slat_size as string | undefined,
      fabric: currentDesign.fabric || undefined,
    });
    const basePrice = priceBreakdown.price;
    if (basePrice === null) return;

    const selectedSurcharges = dedupeQuoteSurcharges([
      ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign, widthIn),
      ...getSelectedSurcharges(currentDesign),
    ]);
    const surchargeTotal = calculateSurchargeTotal(basePrice, selectedSurcharges);
    const sourcePrice = Math.round((basePrice + surchargeTotal) * 100) / 100;
    const recalculatedOptions = stripPriceFreezeMetadata(opts);
    const recalculatedDiscountPercent = Number(opts.discount_percent) || 0;
    const discount =
      recalculatedDiscountPercent > 0
        ? calculateDiscountedPrice(sourcePrice, recalculatedDiscountPercent)
        : { discountAmount: 0, unitPrice: sourcePrice };

    updateFields({
      unit_price: discount.unitPrice,
      options_json: {
        ...recalculatedOptions,
        base_price: basePrice,
        surcharge_total: surchargeTotal,
        pricing_method: priceBreakdown.pricingMethod,
        ...(priceBreakdown.gridKey ? { pricing_grid_key: priceBreakdown.gridKey } : {}),
        ...(priceBreakdown.gridPrice !== undefined
          ? { pricing_grid_price: priceBreakdown.gridPrice }
          : {}),
        ...(priceBreakdown.matchedWidth !== undefined
          ? { pricing_grid_width: priceBreakdown.matchedWidth }
          : {}),
        ...(priceBreakdown.matchedHeight !== undefined
          ? { pricing_grid_height: priceBreakdown.matchedHeight }
          : {}),
        ...(priceBreakdown.builtInAdjustment
          ? { pricing_built_in_adjustment: priceBreakdown.builtInAdjustment }
          : {}),
        ...(recalculatedDiscountPercent > 0
          ? {
              discount_source_price: sourcePrice,
              discount_amount: discount.discountAmount,
            }
          : {}),
      },
    });
  };

  // Locked contract lines stay frozen unless motorization totals are stale or missing.
  useEffect(() => {
    if (!currentDesign || !isPriceLocked) return;

    const widthInches = measurementToInches(lineItem.width_whole, lineItem.width_fraction);
    const heightInches = measurementToInches(lineItem.height_whole, lineItem.height_fraction);

    if (widthInches === 0 || heightInches === 0) return;

    const opts = (currentDesign.options_json as Record<string, unknown>) || {};
    const fabricGroup = opts?.fabric_group as string | undefined;
    const romanFabricCategory = opts?.roman_fabric_category as string | undefined;
    const cellSize = opts?.cell_size as string | undefined;
    const shutterProgram = isShutters ? getShutterProgramName(currentDesign) : undefined;
    const retailOverride =
      isShutters && currentDesign.supplier && shutterProgram
        ? (getRetailPrice(currentDesign.supplier, shutterProgram) ?? undefined)
        : undefined;

    const priceBreakdown = getProductPriceBreakdown({
      productType: lineItem.product_type,
      width: widthInches,
      height: heightInches,
      priceGroup: getFabricPriceGroup(
        lineItem.product_type,
        currentDesign.fabric,
        fabricGroup,
        romanFabricCategory
      ),
      productLine: opts?.product_line as string | undefined,
      fabricGroup,
      shadeType: currentDesign.shade_type || undefined,
      program: shutterProgram || currentDesign.material || undefined,
      catalogProgramId: opts?.[PRODUCT_COLOR_PROGRAM_DETAIL] as string | undefined,
      supplier: currentDesign.supplier || undefined,
      retailPriceOverride: retailOverride,
      cellSize,
      slatSize: opts?.slat_size as string | undefined,
      fabric: currentDesign.fabric || undefined,
    });
    const basePrice = priceBreakdown.price;
    if (basePrice === null) return;

    const selectedSurcharges = dedupeQuoteSurcharges([
      ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign, widthInches),
      ...getSelectedSurcharges(currentDesign),
    ]);
    if (!hasMotorizationSurcharge(selectedSurcharges)) return;

    const surchargeTotal = calculateSurchargeTotal(basePrice, selectedSurcharges);
    const sourcePrice = Math.round((basePrice + surchargeTotal) * 100) / 100;
    const discountPercent = Number(opts.discount_percent) || 0;
    const discount =
      discountPercent > 0
        ? calculateDiscountedPrice(sourcePrice, discountPercent)
        : { discountAmount: 0, unitPrice: sourcePrice };
    const currentBasePrice = Number(opts.base_price);
    const currentSurchargeTotal = Number(opts.surcharge_total);
    const currentDiscountSourcePrice = Number(opts.discount_source_price);
    const currentDiscountAmount = Number(opts.discount_amount);
    const currentGridWidth = Number(opts.pricing_grid_width);
    const currentGridHeight = Number(opts.pricing_grid_height);
    const currentGridPrice = Number(opts.pricing_grid_price);
    const currentUnitPrice = Math.round(Number(currentDesign.unit_price || 0) * 100) / 100;
    const roundedBasePrice = Math.round(basePrice * 100) / 100;
    const discountMetadataChanged =
      discountPercent > 0 &&
      (currentDiscountSourcePrice !== sourcePrice ||
        currentDiscountAmount !== discount.discountAmount);
    const pricingMetadataChanged =
      (priceBreakdown.matchedWidth !== undefined &&
        currentGridWidth !== priceBreakdown.matchedWidth) ||
      (priceBreakdown.matchedHeight !== undefined &&
        currentGridHeight !== priceBreakdown.matchedHeight) ||
      (priceBreakdown.gridPrice !== undefined && currentGridPrice !== priceBreakdown.gridPrice) ||
      (priceBreakdown.gridKey !== undefined && opts.pricing_grid_key !== priceBreakdown.gridKey);
    const storedPricingChanged =
      currentBasePrice !== basePrice ||
      currentSurchargeTotal !== surchargeTotal ||
      discountMetadataChanged ||
      pricingMetadataChanged;
    const unitPriceMissingSurcharges = surchargeTotal > 0 && currentUnitPrice === roundedBasePrice;

    if (!storedPricingChanged && !unitPriceMissingSurcharges) return;

    const recalculatedOptions = stripPriceFreezeMetadata(opts);

    updateFields({
      unit_price: discount.unitPrice,
      options_json: {
        ...recalculatedOptions,
        base_price: basePrice,
        surcharge_total: surchargeTotal,
        pricing_method: priceBreakdown.pricingMethod,
        ...(priceBreakdown.gridKey ? { pricing_grid_key: priceBreakdown.gridKey } : {}),
        ...(priceBreakdown.gridPrice !== undefined
          ? { pricing_grid_price: priceBreakdown.gridPrice }
          : {}),
        ...(priceBreakdown.matchedWidth !== undefined
          ? { pricing_grid_width: priceBreakdown.matchedWidth }
          : {}),
        ...(priceBreakdown.matchedHeight !== undefined
          ? { pricing_grid_height: priceBreakdown.matchedHeight }
          : {}),
        ...(priceBreakdown.builtInAdjustment
          ? { pricing_built_in_adjustment: priceBreakdown.builtInAdjustment }
          : {}),
        ...(discountPercent > 0
          ? {
              discount_source_price: sourcePrice,
              discount_amount: discount.discountAmount,
            }
          : {}),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lineItem.width_whole,
    lineItem.width_fraction,
    lineItem.height_whole,
    lineItem.height_fraction,
    lineItem.product_type,
    currentDesign?.fabric,
    currentDesign?.shade_type,
    currentDesign?.lift_system,
    currentDesign?.valance,
    currentDesign?.material,
    currentDesign?.supplier,
    currentDesign?.motor_type,
    currentDesign?.remote_type,
    currentDesign?.options_json,
    currentRetailPerSqft,
    isPriceLocked,
  ]);

  // Auto-calculate price when options or retail override change
  useEffect(() => {
    if (!currentDesign) return;

    const widthInches = measurementToInches(lineItem.width_whole, lineItem.width_fraction);
    const heightInches = measurementToInches(lineItem.height_whole, lineItem.height_fraction);

    if (widthInches === 0 || heightInches === 0) return;

    const opts = (currentDesign.options_json as Record<string, unknown>) || {};
    if (opts.manual_price_override === true) return;
    if (isPriceLocked) return;

    const fabricGroup = opts?.fabric_group as string | undefined;
    const romanFabricCategory = opts?.roman_fabric_category as string | undefined;
    const cellSize = opts?.cell_size as string | undefined;

    // For shutters, pass the retail price override from the store
    const shutterProgram = isShutters ? getShutterProgramName(currentDesign) : undefined;
    const retailOverride =
      isShutters && currentDesign.supplier && shutterProgram
        ? (getRetailPrice(currentDesign.supplier, shutterProgram) ?? undefined)
        : undefined;

    const priceBreakdown = getProductPriceBreakdown({
      productType: lineItem.product_type,
      width: widthInches,
      height: heightInches,
      priceGroup: getFabricPriceGroup(
        lineItem.product_type,
        currentDesign.fabric,
        fabricGroup,
        romanFabricCategory
      ),
      productLine: opts?.product_line as string | undefined,
      fabricGroup,
      shadeType: currentDesign.shade_type || undefined,
      program: shutterProgram || currentDesign.material || undefined,
      catalogProgramId: opts?.[PRODUCT_COLOR_PROGRAM_DETAIL] as string | undefined,
      supplier: currentDesign.supplier || undefined,
      retailPriceOverride: retailOverride,
      cellSize, // Pass cell size for honeycomb routing
      slatSize: opts?.slat_size as string | undefined,
      fabric: currentDesign.fabric || undefined, // Pass fabric for all fabric-based routing
    });
    const basePrice = priceBreakdown.price;

    if (basePrice !== null) {
      const selectedSurcharges = dedupeQuoteSurcharges([
        ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign, widthInches),
        ...getSelectedSurcharges(currentDesign),
      ]);
      const surchargeTotal = calculateSurchargeTotal(basePrice, selectedSurcharges);
      const sourcePrice = Math.round((basePrice + surchargeTotal) * 100) / 100;
      const discountPercent = Number(opts.discount_percent) || 0;
      const discount =
        discountPercent > 0
          ? calculateDiscountedPrice(sourcePrice, discountPercent)
          : { discountAmount: 0, unitPrice: sourcePrice };
      const calculatedPrice = discount.unitPrice;
      const currentBasePrice = Number(opts.base_price);
      const currentSurchargeTotal = Number(opts.surcharge_total);
      const currentDiscountSourcePrice = Number(opts.discount_source_price);
      const currentDiscountAmount = Number(opts.discount_amount);
      const currentGridWidth = Number(opts.pricing_grid_width);
      const currentGridHeight = Number(opts.pricing_grid_height);
      const currentGridPrice = Number(opts.pricing_grid_price);
      const discountMetadataChanged =
        discountPercent > 0 &&
        (currentDiscountSourcePrice !== sourcePrice ||
          currentDiscountAmount !== discount.discountAmount);
      const pricingMetadataChanged =
        (priceBreakdown.matchedWidth !== undefined &&
          currentGridWidth !== priceBreakdown.matchedWidth) ||
        (priceBreakdown.matchedHeight !== undefined &&
          currentGridHeight !== priceBreakdown.matchedHeight) ||
        (priceBreakdown.gridPrice !== undefined && currentGridPrice !== priceBreakdown.gridPrice) ||
        (priceBreakdown.gridKey !== undefined && opts.pricing_grid_key !== priceBreakdown.gridKey);

      if (
        currentDesign.unit_price !== calculatedPrice ||
        currentBasePrice !== basePrice ||
        currentSurchargeTotal !== surchargeTotal ||
        discountMetadataChanged ||
        pricingMetadataChanged
      ) {
        updateFields({
          unit_price: calculatedPrice,
          options_json: {
            ...opts,
            base_price: basePrice,
            surcharge_total: surchargeTotal,
            pricing_method: priceBreakdown.pricingMethod,
            ...(priceBreakdown.gridKey ? { pricing_grid_key: priceBreakdown.gridKey } : {}),
            ...(priceBreakdown.gridPrice !== undefined
              ? { pricing_grid_price: priceBreakdown.gridPrice }
              : {}),
            ...(priceBreakdown.matchedWidth !== undefined
              ? { pricing_grid_width: priceBreakdown.matchedWidth }
              : {}),
            ...(priceBreakdown.matchedHeight !== undefined
              ? { pricing_grid_height: priceBreakdown.matchedHeight }
              : {}),
            ...(priceBreakdown.builtInAdjustment
              ? { pricing_built_in_adjustment: priceBreakdown.builtInAdjustment }
              : {}),
            ...(discountPercent > 0
              ? {
                  discount_source_price: sourcePrice,
                  discount_amount: discount.discountAmount,
                }
              : {}),
          },
        });
      }
    } else if (
      lineItem.product_type === "Mini Blinds" &&
      (Number(currentDesign.unit_price) !== 0 ||
        Number(opts.base_price) !== 0 ||
        Number(opts.surcharge_total) !== 0)
    ) {
      updateFields({
        unit_price: 0,
        options_json: {
          ...opts,
          base_price: 0,
          surcharge_total: 0,
          pricing_method: "grid",
          pricing_grid_key: priceBreakdown.gridKey || "citylights_aluminum",
          pricing_grid_price: null,
          pricing_grid_width: null,
          pricing_grid_height: null,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lineItem.width_whole,
    lineItem.width_fraction,
    lineItem.height_whole,
    lineItem.height_fraction,
    lineItem.product_type,
    currentDesign?.fabric,
    currentDesign?.shade_type,
    currentDesign?.lift_system,
    currentDesign?.valance,
    currentDesign?.material,
    currentDesign?.supplier,
    currentDesign?.motor_type,
    currentDesign?.remote_type,
    currentDesign?.options_json,
    currentRetailPerSqft,
    isPriceLocked,
  ]);

  const hasMeasurements = lineItem.width_whole > 0 || lineItem.height_whole > 0;

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white text-foreground shadow-[0_24px_70px_rgba(15,35,70,0.10)] transition-all",
        isCopyTarget && "ring-2 ring-blue-300/30",
        isSelectedTarget && "ring-2 ring-blue-400 bg-blue-50"
      )}
    >
      <CardHeader className="quote-line-card-header border-b border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-[#f3f3f0] px-4 py-3">
        <div className="quote-line-card-header-row">
          <div className="quote-line-card-title-wrap">
            {isCopyTarget && (
              <Checkbox
                aria-label={`Copy design to ${lineItem.room_name}`}
                checked={isSelectedTarget}
                onCheckedChange={onToggleCopyTarget}
              />
            )}
            <div className="quote-line-card-title-cluster">
              {displayedLineNumber && (
                <span
                  className="quote-line-card-number"
                  title={quantity > 1 ? `Lines ${displayedLineNumber}` : `Line ${displayedLineNumber}`}
                >
                  {displayedLineNumber}
                </span>
              )}
              {isEditingRoomName ? (
                <input
                  aria-label="Edit room name"
                  autoFocus
                  className="quote-line-card-room quote-line-card-room-input"
                  value={roomNameDraft}
                  onBlur={commitRoomNameEdit}
                  onChange={(event) => setRoomNameDraft(event.target.value)}
                  onKeyDown={handleRoomNameKeyDown}
                />
              ) : (
                <button
                  type="button"
                  className="quote-line-card-room quote-line-card-room-button"
                  title="Edit room name"
                  onClick={startRoomNameEdit}
                >
                  {lineItem.room_name}
                </button>
              )}
              <ProductTypeSwitcher
                productType={lineItem.product_type}
                onChangeProductType={onChangeProductType}
              />
              {hasMeasurements ? (
                <button
                  onClick={onOpenMeasurement}
                  className="quote-line-card-size"
                  title="Click to update measurements"
                >
                  <span className="quote-line-card-size-divider" aria-hidden="true">
                    -
                  </span>
                  <span className="quote-line-card-size-value">{formatDimensions(lineItem)}</span>
                </button>
              ) : (
                <button
                  onClick={onOpenMeasurement}
                  className="quote-line-card-add-size"
                  title="Add measurements"
                >
                  <Ruler className="h-3 w-3" />
                  Add Size
                </button>
              )}
            </div>
          </div>
          <div className="quote-line-card-summary">
            {/* Sqft + editable $/sqft for shutters */}
            {isShutters && sqft !== null && currentRetailPerSqft !== null && (
              <div className="flex flex-col items-end mr-2 text-xs text-muted-foreground leading-tight">
                <span>
                  {rawSqft !== null ? rawSqft.toFixed(1) : "—"} ft²
                  {sqft !== rawSqft && <span className="ml-1 text-[10px]">(min 8)</span>}
                </span>
                {editingRetail ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px]">$</span>
                    <input
                      type="number"
                      step="0.50"
                      min="0.01"
                      className="w-16 h-5 px-1 text-xs border rounded text-foreground bg-white text-right"
                      value={retailInput}
                      autoFocus
                      onChange={(e) => setRetailInput(e.target.value)}
                      onBlur={() => {
                        const val = parseFloat(retailInput);
                        if (
                          !isNaN(val) &&
                          val > 0 &&
                          currentDesign?.supplier &&
                          currentDesign?.material
                        ) {
                          setRetailPrice(currentDesign.supplier, currentDesign.material, val);
                        }
                        setEditingRetail(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                          setEditingRetail(false);
                        }
                      }}
                    />
                    <span className="text-[10px]">/ft²</span>
                  </div>
                ) : (
                  <button
                    className="hover:text-primary transition-colors cursor-pointer font-medium"
                    onClick={() => {
                      setRetailInput(currentRetailPerSqft.toFixed(2));
                      setEditingRetail(true);
                    }}
                    title="Click to edit retail $/sqft"
                  >
                    ${currentRetailPerSqft.toFixed(2)}/ft²
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-right">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="quote-line-price-readout">
                <span className="text-lg font-bold">
                  {formatMoney(displayedLineTotal)}
                </span>
                <div className="text-[11px] text-muted-foreground">
                  {quantity > 1 ? `${formatMoney(displayedUnitPrice)} ea · ` : ""}
                  excl. tax
                </div>
              </div>
            </div>
            <label className="quote-line-quantity-control" title="Line item quantity">
              <span>Qty</span>
              <input
                aria-label={`Quantity for ${lineItem.room_name}`}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantityDraft}
                onBlur={commitQuantityEdit}
                onChange={(event) => setQuantityDraft(event.target.value)}
                onKeyDown={handleQuantityKeyDown}
                disabled={!onUpdateQuantity}
              />
            </label>
            {onApplyDiscount && discountPercents.length > 0 && (
              <Select
                value={hasDiscount ? String(discountPercent) : "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    handleRemoveDiscount();
                    return;
                  }
                  onApplyDiscount(Number(value) as QuoteDiscountPercent);
                }}
                disabled={isDiscountPending || !currentDesign}
              >
                <SelectTrigger
                  aria-label={`Discount for ${lineItem.room_name}`}
                  className={cn(
                    "quote-line-discount-trigger border font-bold",
                    hasDiscount
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                  title={currentDesign ? "Apply a line item discount" : "Save line item details first"}
                >
                  <SelectValue placeholder="Discount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  {discountPercents.map((percent) => (
                    <SelectItem key={percent} value={String(percent)}>
                      {percent}% off
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {onCopyItem && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCopyItem}
                title="Copy line item"
                className="h-8 w-8"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                title="Delete line item"
                className="h-8 w-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Variant tabs */}
        {variants.length > 1 && (
          <Tabs value={activeVariant} onValueChange={handleVariantChange}>
            <TabsList className="bg-transparent gap-2 h-auto p-0">
              {variants.map((v) => {
                const label = isShutters
                  ? SHUTTER_AUTO_VARIANTS.find((sv) => sv.variant === v)?.label || `Quote ${v}`
                  : `Quote ${v}`;
                return (
                  <TabsTrigger
                    key={v}
                    value={v}
                    className="text-xs px-4 py-2 rounded-lg border border-[#d6d5cf] bg-white text-black data-[state=active]:bg-[#0b0b0b] data-[state=active]:text-white data-[state=active]:border-[#1c1c1a] data-[state=active]:shadow-sm"
                  >
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        {isolated && (
          <QuoteLabCatalogControls
            productType={lineItem.product_type}
            design={currentDesign}
            onUpdateFields={updateFields}
          />
        )}

        {/* Design options based on product type */}
        {isShutters ? (
          <ShutterDesignOptions
            design={currentDesign}
            activeVariant={activeVariant}
            productType={lineItem.product_type}
            onUpdate={updateField}
            onUpdateFields={updateFields}
            onRecalculatePrice={isPriceLocked ? handleRecalculateLockedPrice : undefined}
          />
        ) : (
          <ShadesAndBlindsOptions
            design={currentDesign}
            productType={lineItem.product_type}
            lineItem={lineItem}
            onUpdate={updateField}
            onUpdateFields={updateFields}
            onRecalculatePrice={isPriceLocked ? handleRecalculateLockedPrice : undefined}
          />
        )}

        {manufacturerSpecWarnings.length > 0 && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            <div className="mb-1 flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Manufacturer size warning</span>
            </div>
            <ul className="space-y-1 pl-6">
              {manufacturerSpecWarnings.map((warning) => (
                <li key={warning.id} className="list-disc">
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <PriceExplanation
          design={currentDesign}
          productType={lineItem.product_type}
          widthIn={widthIn}
          heightIn={heightIn}
          rawSqft={rawSqft}
          sqft={sqft}
          quantity={quantity}
          currentRetailPerSqft={currentRetailPerSqft}
        />

        {/* Copy actions */}
        <div className="quote-line-action-row">
          <span className="quote-line-action-label">Copy this design to:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyAll}
            className="quote-line-action-button"
          >
            <Copy className="h-3 w-3" />
            All lines
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCopySome}
            className="quote-line-action-button"
          >
            <CopyCheck className="h-3 w-3" />
            Some
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLineNote((value) => !value)}
            className="quote-line-action-button"
          >
            <FileText className="h-3 w-3" />
            Add Note
          </Button>
          <SurchargePicker
            productType={lineItem.product_type}
            design={currentDesign}
            width={widthIn}
            onUpdate={updateField}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onStack}
            className="quote-line-action-button quote-line-action-button--stack"
          >
            <Archive className="h-3 w-3" />
            Stack
          </Button>
        </div>
        {showLineNote && (
          <DeferredTextInput
            value={currentDesign?.notes || ""}
            onCommit={(value) => updateField("notes", value)}
            placeholder="Add a note for the contract..."
            className="h-8 text-sm"
            autoFocus
          />
        )}
      </CardContent>
    </Card>
  );
}

function QuoteLabCatalogControls({
  productType,
  design,
  onUpdateFields,
}: {
  productType: string;
  design: SalesQuoteDesign | undefined;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
}) {
  const [products, setProducts] = useState<QuoteLabCatalogProduct[]>([]);
  const options = (design?.options_json as Record<string, unknown> | undefined) || {};
  const productId = typeof options.quote_lab_product_id === "string" ? options.quote_lab_product_id : "";
  const programId = typeof options.quote_lab_program_id === "string" ? options.quote_lab_program_id : "";
  const selectedProduct = products.find((product) => product.id === productId);
  const selectedProgram = selectedProduct?.programs.find((program) => program.id === programId);
  const availableProducts = products.filter((product) =>
    product.productType === productType || (productType === "Roller Shades" && product.id === "roller"),
  );
  const selectedSurcharges = Array.isArray(options.surcharges)
    ? (options.surcharges as Array<{ id?: string; quantity?: number }>).filter((entry) => entry?.id)
    : [];

  useEffect(() => {
    let active = true;
    loadQuoteLabCatalog()
      .then((payload: QuoteLabCatalogResponse) => { if (active) setProducts(payload.products); })
      .catch(() => { if (active) setProducts([]); });
    return () => { active = false; };
  }, []);

  if (availableProducts.length === 0) return null;

  const chooseProduct = (nextId: string) => {
    const product = products.find((candidate) => candidate.id === nextId);
    if (!product || product.priceBasis === "unavailable") return;
    const firstProgram = product.programs[0];
    onUpdateFields({
      supplier: product.manufacturer,
      material: firstProgram?.name ?? product.system ?? product.name,
      fabric: null,
      motor_type: null,
      remote_type: null,
      options_json: {
        ...options,
        quote_lab_product_id: product.id,
        quote_lab_program_id: firstProgram?.id ?? null,
        catalog_program_id: firstProgram?.id ?? null,
        surcharges: [],
      },
    });
  };

  const addSurcharge = (id: string) => {
    if (!id || selectedSurcharges.some((entry) => entry.id === id)) return;
    onUpdateFields({ options_json: { ...options, surcharges: [...selectedSurcharges, { id, quantity: 1 }] } });
  };

  const statusText = selectedProgram?.priceBasis === "manual_required"
    ? "Manual price required; source price is missing"
    : selectedProduct?.priceBasis === "manual_required"
    ? "Manual price required by source"
    : selectedProduct?.priceBasis === "dealer_net"
      ? "Dealer-net only; customer retail undefined"
      : null;

  return (
    <div className="space-y-3 border-y border-slate-200 py-3" data-testid="quote-lab-catalog-controls">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Manufacturer / product</Label>
          <Select value={productId} onValueChange={chooseProduct}>
            <SelectTrigger aria-label="Manufacturer and product"><SelectValue placeholder="Select required">{selectedProduct ? `${selectedProduct.manufacturer ?? "Norman"} - ${selectedProduct.system ?? selectedProduct.name}` : undefined}</SelectValue></SelectTrigger>
            <SelectContent>
              {availableProducts.map((product) => (
                <SelectItem key={product.id} value={product.id} disabled={product.priceBasis === "unavailable"}>
                  {product.manufacturer ?? "Norman"} - {product.system ?? product.name}{product.priceBasis === "unavailable" ? " (unavailable)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProduct && selectedProduct.programs.length > 1 && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Price program</Label>
            <Select value={programId} onValueChange={(next) => {
              const program = selectedProduct.programs.find((candidate) => candidate.id === next);
              onUpdateFields({ material: program?.name ?? null, fabric: null, options_json: { ...options, quote_lab_program_id: next, catalog_program_id: next } });
            }}>
              <SelectTrigger aria-label="Price program"><SelectValue placeholder="Select required" /></SelectTrigger>
              <SelectContent>{selectedProduct.programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}{program.priceBasis === "manual_required" ? " (manual price required)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {selectedProduct && (selectedProduct.fabrics?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Fabric collection</Label>
            <Select value={design?.fabric || ""} onValueChange={(fabric) => {
              const choice = selectedProduct.fabrics?.find((candidate) => candidate.name === fabric);
              onUpdateFields({ fabric, material: choice ? `Price Group ${choice.programId.replace("group_", "")}` : null, options_json: { ...options, quote_lab_program_id: choice?.programId ?? null, catalog_program_id: choice?.programId ?? null } });
            }}>
              <SelectTrigger aria-label="Fabric collection"><SelectValue placeholder="Select fabric" /></SelectTrigger>
              <SelectContent>{selectedProduct.fabrics?.map((fabric) => <SelectItem key={fabric.name} value={fabric.name}>{fabric.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {selectedProduct && selectedProduct.surcharges.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Add accessory</Label>
            <Select value="" onValueChange={addSurcharge}>
              <SelectTrigger aria-label="Add accessory"><SelectValue placeholder="Choose accessory" /></SelectTrigger>
              <SelectContent>{selectedProduct.surcharges.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        {selectedProduct?.motorizationGroups.flatMap((group) => group.options).length ? (
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Motor / control</Label>
            <Select value={design?.motor_type || ""} onValueChange={(motor_type) => onUpdateFields({ motor_type })}>
              <SelectTrigger aria-label="Motor or control"><SelectValue placeholder="Manual / none" /></SelectTrigger>
              <SelectContent>{selectedProduct.motorizationGroups.flatMap((group) => group.options.map((item) => <SelectItem key={`${group.groupId}:${item.id}`} value={item.id}>{item.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {selectedSurcharges.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedSurcharges.map((entry) => {
            const item = selectedProduct?.surcharges.find((candidate) => candidate.id === entry.id);
            return <Button key={entry.id} type="button" variant="outline" size="sm" onClick={() => onUpdateFields({ options_json: { ...options, surcharges: selectedSurcharges.filter((candidate) => candidate.id !== entry.id) } })}>{item?.name ?? entry.id}<X className="ml-1 h-3 w-3" /></Button>;
          })}
        </div>
      )}
      {statusText && <div role="alert" className="text-sm font-semibold text-amber-800">{statusText}</div>}
    </div>
  );
}

// --- Shutter Design Options (restructured with pills + grid) ---

function ShutterDesignOptions({
  design,
  activeVariant,
  productType,
  onUpdate,
  onUpdateFields,
  onRecalculatePrice,
}: {
  design: SalesQuoteDesign | undefined;
  activeVariant: string;
  productType: string;
  onUpdate: (field: string, value: unknown) => void;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
  onRecalculatePrice?: () => void;
}) {
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [openOptionField, setOpenOptionField] = useState<string | null>(null);
  const draftDesign = useMemo(() => buildDraftShutterDesign(activeVariant), [activeVariant]);
  const workingDesign = design ?? draftDesign;
  const autoRoutePatchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const patch = getAutoShutterRoutePatch(activeVariant);
    if (!design || !patch || !needsShutterRoutePatch(design, patch)) return;

    const routeKey = [
      activeVariant,
      design?.id ?? "draft",
      patch.supplier,
      patch.material ?? "",
      JSON.stringify(patch.options),
    ].join(":");

    if (autoRoutePatchKeyRef.current === routeKey) return;
    autoRoutePatchKeyRef.current = routeKey;
    applyShutterRoutePatch(patch, design, onUpdate);
  }, [activeVariant, design, onUpdate]);

  const handleUpdate = (field: string, value: unknown) => {
    const patch = getAutoShutterRoutePatch(activeVariant);
    if (patch && needsShutterRoutePatch(design, patch)) {
      applyShutterRoutePatch(patch, design, onUpdate);
    }
    setFieldValue(field, value, workingDesign, onUpdate);
  };

  const handleDefiningStepSelect = (step: DefiningStep, value: string) => {
    if (step.field === "json:wood_route") {
      applyShutterRoutePatch(getWoodShutterRoutePatch(value as WoodShutterRoute), design, onUpdate);
      return;
    }

    handleUpdate(step.field, value);
  };

  const definingSteps = getDefiningSteps(workingDesign);
  const standardComplete = isStandardShutterComplete(workingDesign);
  const useOldSteps = isTrackedOrSpecialty(workingDesign);
  const optionsJson = (workingDesign.options_json as Record<string, unknown>) || {};
  const definingOptions: GridOption[] = definingSteps.map((step) => ({
    key: `define-${step.key}`,
    label: step.label,
    field: step.field,
    type: "buttons",
    options: step.options,
  }));

  const handleManualPriceChange = (price: number) => {
    onUpdateFields({
      unit_price: price,
      options_json: { ...optionsJson, manual_price_override: true },
    });
  };

  const gridOptions = standardComplete && !useOldSteps ? getStandardShutterGridOptions(workingDesign) : [];
  const slotOptions = standardComplete && !useOldSteps ? [...definingOptions, ...gridOptions] : definingOptions;
  const optionRows = partitionOptionSlots(slotOptions, [
    ...definingOptions.map((option) => option.field),
    ...getShutterMandatoryFields(gridOptions),
  ]);
  const confirmedOptions = getConfirmedOptionItems(workingDesign, [
    ...optionRows.mandatory,
    ...optionRows.optional,
  ]);
  const editableOptionRows = getEditableOptionRows(optionRows, workingDesign, openOptionField);

  const renderOptionControl = (opt: GridOption) => {
    const value = getFieldValue(workingDesign, opt.field);

    if (opt.type === "buttons") {
      return (
        <GridButtonGroup
          label={opt.label}
          options={opt.options}
          value={value}
          hideLabel
          onChange={(v) => {
            if (definingOptions.some((option) => option.field === opt.field)) {
              const step = definingSteps.find((candidate) => candidate.field === opt.field);
              if (step) handleDefiningStepSelect(step, v);
            } else {
              handleUpdate(opt.field, v);
            }
            setOpenOptionField(null);
          }}
        />
      );
    }

    if (opt.type === "select") {
      return (
        <GridSelect
          label={opt.label}
          options={opt.options}
          value={value}
          hideLabel
          onChange={(v) => {
            handleUpdate(opt.field, v);
            setOpenOptionField(null);
          }}
        />
      );
    }

    return (
      <GridYesNo
        label={opt.label}
        value={value}
        hideLabel
        noFirst={opt.noFirst}
        onChange={(v) => {
          handleUpdate(opt.field, v);
          setOpenOptionField(null);
        }}
      />
    );
  };

  const renderOptionSlot = (opt: GridOption, requirement: OptionSlotRequirement) => (
    <OptionSlot
      key={opt.key}
      option={opt}
      value={getOptionSlotValue(workingDesign, opt.field)}
      requirement={requirement}
      isOpen={openOptionField === opt.field}
      onToggle={() => setOpenOptionField((field) => (field === opt.field ? null : opt.field))}
      renderSelectedDirect={opt.type === "select"}
    >
      {renderOptionControl(opt)}
    </OptionSlot>
  );

  const handleConfirmedOptionReset = (field: string) => {
    handleUpdate(field, null);
    setOpenOptionField(field);
  };

  return (
    <div className="space-y-3">
      <ConfirmedOptionStrip
        items={confirmedOptions}
        editingField={openOptionField}
        onReset={handleConfirmedOptionReset}
      />

      {(editableOptionRows.mandatory.length > 0 || editableOptionRows.optional.length > 0) && (
        <OptionSlotRows
          mandatoryOptions={editableOptionRows.mandatory}
          optionalOptions={editableOptionRows.optional}
          renderSlot={renderOptionSlot}
        />
      )}

      {isInvisibleTiltPanelSelectionMissing(workingDesign) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Select the panel configuration to calculate the invisible-tilt surcharge.
        </div>
      )}

      {/* For Tracked/Specialty shutters, use the old step-by-step flow */}
      {useOldSteps && <LegacyShutterSteps design={workingDesign} onUpdate={onUpdate} />}

      {/* Show More section (divider rail, etc.) */}
      {standardComplete && !useOldSteps && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={showMoreOptions}
              onClick={() => setShowMoreOptions((value) => !value)}
              className="quote-more-options-button"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              More Options
            </button>
          </div>

          {showMoreOptions && (
            <div className="quote-style-option-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2">
              {INSTALL_MORE_OPTIONS.map((opt) => (
                <GridYesNo
                  key={opt.key}
                  label={opt.label}
                  value={getFieldValue(workingDesign, opt.field)}
                  onChange={(v) => handleUpdate(opt.field, v)}
                  noFirst={opt.noFirst}
                />
              ))}
              <GridYesNo
                label="Divider Rail"
                value={getFieldValue(workingDesign, "json:divider_rail")}
                onChange={(v) => handleUpdate("json:divider_rail", v)}
              />
              {(design?.options_json as Record<string, string>)?.divider_rail === "Yes" && (
                <>
                  <GridButtonGroup
                    label="Divider Rail Location"
                    options={ONYX_DIVIDER_RAIL_LOCATIONS}
                    value={getFieldValue(design, "json:divider_rail_location")}
                    onChange={(v) => handleUpdate("json:divider_rail_location", v)}
                  />
                  {(design?.options_json as Record<string, string>)?.divider_rail_location ===
                    "Custom" && (
                    <div className="quote-style-option-field space-y-1">
                      <Label className="quote-style-option-label text-[10px] font-bold uppercase tracking-[0.12em] text-[#77746d]">
                        Divider Rail Height
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <DeferredTextInput
                          placeholder="Enter height"
                          className="quote-style-input h-6 min-h-0 w-24 text-[11px]"
                          value={
                            (design?.options_json as Record<string, string>)?.divider_rail_height ||
                            ""
                          }
                          onCommit={(value) => handleUpdate("json:divider_rail_height", value)}
                        />
                        <span className="text-sm font-medium">&quot;</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Price input */}
      {(standardComplete || useOldSteps) && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Price:</Label>
            <div className="relative w-32">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <DeferredNumberInput
                value={design?.unit_price || ""}
                onCommit={handleManualPriceChange}
                commitOnChange
                className="pl-5 h-8 text-sm"
                placeholder="0.00"
              />
            </div>
            {onRecalculatePrice && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRecalculatePrice}
                className="h-8 rounded-lg text-xs"
                title="Recalculate this locked contract line"
              >
                <Calculator className="mr-1 h-3.5 w-3.5" />
                Reprice
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Legacy step-by-step for Tracked/Specialty Shutters ---

function LegacyShutterSteps({
  design,
  onUpdate,
}: {
  design: SalesQuoteDesign | undefined;
  onUpdate: (field: string, value: unknown) => void;
}) {
  const handleUpdate = (field: string, value: unknown) => {
    setFieldValue(field, value, design, onUpdate);
  };

  const shutterType = (design?.options_json as Record<string, string>)?.shutter_type;
  if (!shutterType) return null;

  if (shutterType === "Specialty Shutter") {
    const selectedShape = (design?.options_json as Record<string, string>)?.specialty_shape;
    if (selectedShape) {
      const shape = ONYX_SPECIALTY_SHAPES.find((s) => s.label === selectedShape);
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleUpdate("json:specialty_shape", null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background text-sm font-medium hover:bg-accent transition-all cursor-pointer group"
            title="Click to change"
          >
            {shape?.image && (
              <img
                src={shape.image}
                alt={selectedShape}
                className="h-8 w-8 object-contain rounded bg-accent"
              />
            )}
            <span className="text-muted-foreground">Shape:</span>
            <span className="font-semibold">{selectedShape}</span>
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-lg text-muted-foreground font-medium italic">Specialty Shape</p>
        <SpecialtyShapeGrid
          shapes={ONYX_SPECIALTY_SHAPES}
          categories={ONYX_SPECIALTY_CATEGORIES}
          onSelect={(label) => handleUpdate("json:specialty_shape", label)}
        />
      </div>
    );
  }

  if (shutterType === "Tracked Shutter") {
    return <TrackedShutterSteps design={design} onUpdate={onUpdate} handleUpdate={handleUpdate} />;
  }

  return null;
}

function TrackedShutterSteps({
  design,
  onUpdate: _onUpdate,
  handleUpdate,
}: {
  design: SalesQuoteDesign | undefined;
  onUpdate: (field: string, value: unknown) => void;
  handleUpdate: (field: string, value: unknown) => void;
}) {
  const opts = (design?.options_json as Record<string, string>) || {};

  // Build steps list for tracked shutter
  interface TrackedStep {
    key: string;
    label: string;
    field: string;
    options: readonly string[];
  }

  const steps: TrackedStep[] = [
    { key: "track_type", label: "Track Type", field: "json:track_type", options: ONYX_TRACK_TYPES },
  ];

  if (!opts.track_type) {
    return <StepWizard step={steps[0]} onSelect={(v) => handleUpdate(steps[0].field, v)} />;
  }

  if (opts.track_type === "Bypass") {
    steps.push({
      key: "bypass_type",
      label: "Bypass Type",
      field: "json:bypass_type",
      options: ONYX_BYPASS_TYPES,
    });
    if (!opts.bypass_type) {
      return (
        <div className="space-y-3">
          <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
          <StepWizard
            step={steps[steps.length - 1]}
            onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
          />
        </div>
      );
    }
  }

  steps.push({
    key: "folding_direction",
    label: "Folding Direction",
    field: "json:folding_direction",
    options: ONYX_FOLDING_DIRECTIONS,
  });
  if (!opts.folding_direction) {
    return (
      <div className="space-y-3">
        <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
        <StepWizard
          step={steps[steps.length - 1]}
          onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
        />
      </div>
    );
  }

  steps.push({
    key: "facia_type",
    label: "Facia Type",
    field: "json:facia_type",
    options: ONYX_FACIA_TYPES,
  });
  if (!opts.facia_type) {
    return (
      <div className="space-y-3">
        <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
        <StepWizard
          step={steps[steps.length - 1]}
          onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
        />
      </div>
    );
  }

  steps.push({
    key: "divider_rail",
    label: "Divider Rail",
    field: "json:divider_rail",
    options: ["Yes", "No"] as const,
  });
  if (!opts.divider_rail) {
    return (
      <div className="space-y-3">
        <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
        <StepWizard
          step={steps[steps.length - 1]}
          onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
        />
      </div>
    );
  }

  if (opts.divider_rail === "Yes") {
    steps.push({
      key: "divider_rail_location",
      label: "Divider Rail Location",
      field: "json:divider_rail_location",
      options: ONYX_DIVIDER_RAIL_LOCATIONS,
    });
    if (!opts.divider_rail_location) {
      return (
        <div className="space-y-3">
          <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
          <StepWizard
            step={steps[steps.length - 1]}
            onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
          />
        </div>
      );
    }
  }

  steps.push({
    key: "color",
    label: "Color",
    field: "json:color",
    options: ONYX_COLORS,
  });
  if (!opts.color) {
    return (
      <div className="space-y-3">
        <CompletedPills steps={steps.slice(0, -1)} design={design} onClear={handleUpdate} />
        <StepWizard
          step={steps[steps.length - 1]}
          onSelect={(v) => handleUpdate(steps[steps.length - 1].field, v)}
        />
      </div>
    );
  }

  // All tracked steps complete
  return <CompletedPills steps={steps} design={design} onClear={handleUpdate} />;
}

function CompletedPills({
  steps,
  design,
  onClear,
}: {
  steps: { key: string; label: string; field: string }[];
  design: SalesQuoteDesign | undefined;
  onClear: (field: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step) => {
        const value = getCompletedDisplayValue(design, step.field);
        if (!value) return null;
        return (
          <button
            key={step.key}
            onClick={() => onClear(step.field, null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-background text-sm font-medium hover:bg-accent transition-all cursor-pointer group"
            title="Click to change"
          >
            <span className="text-muted-foreground">{step.label}:</span>
            <span className="font-semibold">{value}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepWizard({
  step,
  onSelect,
}: {
  step: { label: string; options: readonly string[] };
  onSelect: (v: string) => void;
}) {
  if (!step.options) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700 font-semibold">{step.label}</p>
      <div className="inline-flex gap-1.5 p-1 rounded-md border border-border bg-accent/30 flex-row flex-wrap">
        {step.options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="quote-style-option-button rounded-md border border-border bg-background text-[11px] font-semibold text-gray-900 hover:bg-accent hover:border-primary/50 transition-all"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Shades and Blinds Design Options ---

function ShadesAndBlindsOptions({
  design,
  productType,
  lineItem: _lineItem,
  onUpdate,
  onUpdateFields,
  onRecalculatePrice,
}: {
  design: SalesQuoteDesign | undefined;
  productType: string;
  lineItem: SalesQuoteLineItem;
  onUpdate: (field: string, value: unknown) => void;
  onUpdateFields: (fields: Partial<SalesQuoteDesign>) => void;
  onRecalculatePrice?: () => void;
}) {
  const [openOptionField, setOpenOptionField] = useState<string | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const handleUpdate = (field: string, value: unknown) => {
    const currentJson = (design?.options_json as Record<string, unknown>) || {};
    const emptyValue = value === null || value === undefined || value === "";

    if (
      productType === "Roller Shades" &&
      field === "fabric" &&
      emptyValue
    ) {
      onUpdateFields({
        fabric: null,
        options_json: withoutProductColorDetails(currentJson),
      });
      return;
    }

    if (productType === "Roller Shades" && field === "lift_system") {
      const nextJson = { ...currentJson };
      if (value !== "Continuous Cord Loop") nextJson.cord_loop_release = null;
      if (value !== "Motorized") nextJson.hub_required = null;

      onUpdateFields({
        lift_system: typeof value === "string" ? value : null,
        motor_type: value === "Motorized" ? design?.motor_type || null : null,
        remote_type: null,
        options_json: nextJson,
      });
      return;
    }

    if (productType === "Roller Shades" && field === "json:premium_hardware") {
      onUpdateFields({
        options_json: {
          ...currentJson,
          premium_hardware: value,
          ...(value === "Yes" ? {} : { premium_hardware_color: null }),
        },
      });
      return;
    }

    if (productType === "Mini Blinds" && field === "json:slat_size") {
      const slatSize = typeof value === "string" ? value : null;
      if (slatSize) setOpenOptionField("json:color");
      onUpdateFields({
        options_json: {
          ...withoutProductColorDetails(currentJson),
          slat_size: slatSize,
          color: null,
          light_control: getMiniBlindDefaultLightControl(slatSize),
          side_mount_bracket: slatSize === '2"' ? currentJson.side_mount_bracket : null,
        },
      });
      return;
    }

    // Roman Shades cascades — mirror Norman's dependency rules, but clear a
    // dependent field only when its current value becomes invalid (Norman
    // wipes style + fabric unconditionally; we keep what still fits).
    if (productType === "Roman Shades" && field === "shade_type") {
      const nextShadeType = typeof value === "string" ? value : null;
      const nextJson = { ...currentJson };
      let clearFabric = false;

      const fold = String(nextJson.fold_style || "");
      if (fold && !getRomanFoldStylesFor(nextShadeType).includes(fold)) {
        nextJson.fold_style = null;
      }
      const category = String(nextJson.roman_fabric_category || "");
      if (
        category &&
        !getRomanFabricCategoryNamesFor(String(nextJson.fold_style || ""), nextShadeType).includes(
          category
        )
      ) {
        nextJson.roman_fabric_category = null;
        clearFabric = true;
      }
      if (nextShadeType !== "Day & Night") {
        nextJson.back_fabric = null;
        nextJson.back_hem_bar = null;
      }

      onUpdateFields({
        shade_type: nextShadeType,
        // Norman forces a valance on Common Valance shades.
        ...(nextShadeType === "Common Valance" ? { valance: "Fabric Valance" } : {}),
        ...(clearFabric ? { fabric: null } : {}),
        options_json: clearFabric ? withoutProductColorDetails(nextJson) : nextJson,
      });
      return;
    }

    if (productType === "Roman Shades" && field === "lift_system") {
      const nextControl = typeof value === "string" ? value : null;
      const nextJson = { ...currentJson };
      if (!(nextControl === "Continuous Cord Loop" || nextControl === "SmartRelease")) {
        nextJson.chain_type = null;
        nextJson.chain_color = null;
        nextJson.chain_location = null;
        nextJson.chain_length = null;
      }
      if (nextControl !== "Cordless") {
        nextJson.poles = null;
        nextJson.pole_length = null;
      }
      if (nextControl !== "Motorized") {
        nextJson.hub_required = null;
      }
      onUpdateFields({
        lift_system: nextControl,
        motor_type: nextControl === "Motorized" ? design?.motor_type || null : null,
        remote_type: nextControl === "Motorized" ? design?.remote_type || null : null,
        options_json: nextJson,
      });
      return;
    }

    if (productType === "Roman Shades" && field === "json:fold_style") {
      const nextStyle = typeof value === "string" ? value : null;
      const nextJson: Record<string, unknown> = { ...currentJson, fold_style: nextStyle };
      const category = String(nextJson.roman_fabric_category || "");
      const allowed = getRomanFabricCategoryNamesFor(
        nextStyle,
        design?.shade_type || null
      );
      if (category && !allowed.includes(category)) {
        nextJson.roman_fabric_category = null;
        onUpdateFields({
          fabric: null,
          options_json: withoutProductColorDetails(nextJson),
        });
      } else {
        onUpdateFields({ options_json: nextJson });
      }
      return;
    }

    if (productType === "Roman Shades" && field === "motor_type") {
      const nextSource = typeof value === "string" ? value : null;
      const remotes = nextSource
        ? ROMAN_AUTOMATE_POWER_SOURCES.has(nextSource)
          ? ROMAN_REMOTES_AUTOMATE
          : ROMAN_REMOTES_NORMAN
        : [];
      const keepRemote =
        design?.remote_type && (remotes as readonly string[]).includes(design.remote_type);
      onUpdateFields({
        motor_type: nextSource,
        ...(keepRemote ? {} : { remote_type: null }),
        ...(nextSource === "AutoWand"
          ? { options_json: { ...currentJson, hub_required: null } }
          : {}),
      });
      return;
    }

    if (productType === "Roman Shades" && field === "mount_type") {
      const nextMount = typeof value === "string" ? value : null;
      const nextJson = { ...currentJson };
      if (nextMount !== "Outside Mount") {
        nextJson.hold_downs = null;
        nextJson.magnet_color = null;
        // Pleated returns are an outside-mount option at Norman.
        if (nextJson.valance_returns === "Pleated Returns") nextJson.valance_returns = null;
      }
      // Inside Mount + Continuous Cord Loop is standard chain length only.
      if (
        nextMount === "Inside Mount" &&
        design?.lift_system === "Continuous Cord Loop" &&
        nextJson.chain_length &&
        nextJson.chain_length !== "Standard"
      ) {
        nextJson.chain_length = "Standard";
      }
      onUpdateFields({ mount_type: nextMount, options_json: nextJson });
      return;
    }

    if (productType === "Roman Shades" && field === "valance") {
      const nextValance = typeof value === "string" ? value : null;
      onUpdateFields({
        valance: nextValance,
        ...(nextValance !== "Fabric Valance"
          ? { options_json: { ...currentJson, valance_returns: null } }
          : {}),
      });
      return;
    }

    if (productType === "Roman Shades" && field === "json:chain_type") {
      onUpdateFields({
        options_json: {
          ...currentJson,
          chain_type: value,
          ...(value === "Standard (Plastic)" ? {} : { chain_color: null }),
        },
      });
      return;
    }

    if (productType === "Roman Shades" && field === "json:poles") {
      onUpdateFields({
        options_json: {
          ...currentJson,
          poles: value,
          ...(value === "Pole with Attachment" ? {} : { pole_length: null }),
        },
      });
      return;
    }

    if (productType === "Roman Shades" && field === "json:hold_downs") {
      onUpdateFields({
        options_json: {
          ...currentJson,
          hold_downs: value,
          ...(value === "Magnetic" ? {} : { magnet_color: null }),
        },
      });
      return;
    }

    // Honeycomb Shades cascades — mirror Norman's dependency rules with
    // validity-based clearing (see docs/norman-honeycomb-order-map.md).
    if (productType === "Honeycomb Shades" && field === "json:cell_size") {
      const nextSize = typeof value === "string" ? value : null;
      const nextJson: Record<string, unknown> = { ...currentJson, cell_size: nextSize };
      const patch: Partial<SalesQuoteDesign> = {};

      // Frame (SmartFit/Decoflex) sizes only take the SmartFit systems.
      const allowedSystems = getHoneycombOperatingSystemsFor(nextSize);
      if (design?.lift_system && !allowedSystems.includes(design.lift_system)) {
        patch.lift_system = null;
        patch.motor_type = null;
        patch.remote_type = null;
        patch.shade_type = null;
        nextJson.chain_location = null;
        nextJson.chain_length = null;
        nextJson.poles = null;
        nextJson.hub_required = null;
        nextJson.back_fabric = null;
      }

      // Frame quantity / pre-drill only exist for the frame sizes.
      if (!isHoneycombFrameCellSize(canonicalizeHoneycombCellSize(nextSize))) {
        nextJson.frame_qty = null;
        nextJson.pre_drilled = null;
      }

      // The back (Day & Night) fabric list is per shade size.
      const backFabric = String(nextJson.back_fabric || "");
      if (backFabric && !getHoneycombDealerFabricTypesFor(nextSize).includes(backFabric)) {
        nextJson.back_fabric = null;
      }

      // Clear the fabric only when its color is no longer offered for the
      // new size on the Norman dealer form.
      const fabricColorCode = stringOption(currentJson, PRODUCT_COLOR_CODE_DETAIL);
      const clearFabric = Boolean(
        design?.fabric &&
          fabricColorCode &&
          nextSize &&
          !isHoneycombDealerColorAvailable(nextSize, fabricColorCode)
      );
      if (clearFabric) setOpenOptionField("fabric");

      onUpdateFields({
        ...patch,
        ...(clearFabric ? { fabric: null } : {}),
        options_json: clearFabric ? withoutProductColorDetails(nextJson) : nextJson,
      });
      return;
    }

    if (productType === "Honeycomb Shades" && field === "lift_system") {
      const nextOs = typeof value === "string" ? value : null;
      const nextJson = { ...currentJson };
      if (!isHoneycombChainOperatingSystem(nextOs)) {
        nextJson.chain_location = null;
        nextJson.chain_length = null;
      }
      if (!isHoneycombCordlessPoleOperatingSystem(nextOs)) {
        nextJson.poles = null;
      }
      const motorized = isHoneycombMotorizedOperatingSystem(nextOs);
      if (!motorized) nextJson.hub_required = null;
      if (!isHoneycombDayNightOperatingSystem(nextOs)) nextJson.back_fabric = null;

      // Keep the power source / remote only while they stay valid for the
      // new system's motor family.
      const motors = motorized ? getHoneycombMotorsFor(nextOs) : [];
      const keepMotor = Boolean(
        design?.motor_type && (motors as readonly string[]).includes(design.motor_type)
      );
      const remotes =
        keepMotor && design?.motor_type && design.motor_type !== "AutoWand"
          ? HONEYCOMB_AUTOMATE_POWER_SOURCES.has(design.motor_type)
            ? ROMAN_REMOTES_AUTOMATE
            : ROMAN_REMOTES_NORMAN
          : ([] as readonly string[]);
      const keepRemote = Boolean(
        design?.remote_type && (remotes as readonly string[]).includes(design.remote_type)
      );
      // "2 on 1" is only offered on a few operating systems.
      const clearShadeType =
        design?.shade_type === "2 on 1" && !honeycombOperatingSystemAllows2On1(nextOs);

      onUpdateFields({
        lift_system: nextOs,
        motor_type: keepMotor ? design?.motor_type || null : null,
        remote_type: keepRemote ? design?.remote_type || null : null,
        ...(clearShadeType ? { shade_type: null } : {}),
        options_json: nextJson,
      });
      return;
    }

    if (productType === "Honeycomb Shades" && field === "motor_type") {
      const nextSource = typeof value === "string" ? value : null;
      const remotes =
        nextSource && nextSource !== "AutoWand"
          ? HONEYCOMB_AUTOMATE_POWER_SOURCES.has(nextSource)
            ? ROMAN_REMOTES_AUTOMATE
            : ROMAN_REMOTES_NORMAN
          : ([] as readonly string[]);
      const keepRemote =
        design?.remote_type && (remotes as readonly string[]).includes(design.remote_type);
      onUpdateFields({
        motor_type: nextSource,
        ...(keepRemote ? {} : { remote_type: null }),
        ...(nextSource === "AutoWand"
          ? { options_json: { ...currentJson, hub_required: null } }
          : {}),
      });
      return;
    }

    if (productType === "Honeycomb Shades" && field === "mount_type") {
      const nextMount = typeof value === "string" ? value : null;
      onUpdateFields({
        mount_type: nextMount,
        // Hold downs are an outside-mount option at Norman.
        ...(nextMount !== "Outside Mount"
          ? { options_json: { ...currentJson, hold_downs: null } }
          : {}),
      });
      return;
    }

    if (supportsMtsProductColorSearch(productType, field, currentJson) && emptyValue) {
      let nextJson = withoutProductColorDetails(currentJson);
      const jsonKey = getJsonFieldKey(field);
      if (jsonKey) {
        nextJson = { ...nextJson, [jsonKey]: null };
      }
      onUpdateFields({
        ...(field === "fabric" ? { fabric: null } : {}),
        options_json: nextJson,
      });
      return;
    }

    const dependentProductColorField = getDependentProductColorField(productType, field);
    if (dependentProductColorField) {
      if (!emptyValue) setOpenOptionField(dependentProductColorField);

      let nextJson = withJsonField(withoutProductColorDetails(currentJson), field, value);
      const dependentJsonKey = getJsonFieldKey(dependentProductColorField);
      if (dependentJsonKey) {
        nextJson = { ...nextJson, [dependentJsonKey]: null };
      }

      onUpdateFields({
        ...(getJsonFieldKey(field) ? {} : { [field]: value }),
        ...(dependentProductColorField === "fabric" ? { fabric: null } : {}),
        options_json: nextJson,
      });
      return;
    }

    setFieldValue(field, value, design, onUpdate);

    if (
      productType === "Roman Shades" &&
      field === "fabric" &&
      typeof value === "string" &&
      !stringOption(currentJson, PRODUCT_COLOR_ID_DETAIL)
    ) {
      const category = getRomanFabricCategoryForColor(value);
      if (category && currentJson.roman_fabric_category !== category) {
        onUpdate("options_json", { ...currentJson, roman_fabric_category: category });
      }
    }
  };

  useEffect(() => {
    if (productType !== "Roman Shades" || !design?.fabric) return;
    const currentJson = (design.options_json as Record<string, unknown>) || {};
    if (stringOption(currentJson, PRODUCT_COLOR_ID_DETAIL)) return;

    const canonicalFabric = getRomanFabricCanonicalLabel(design.fabric);
    const category =
      getRomanFabricCategoryForColor(design.fabric) || getRomanFabricCategoryName(design.fabric);

    if (canonicalFabric && canonicalFabric !== design.fabric) {
      onUpdate("fabric", canonicalFabric);
    }

    if (category && currentJson.roman_fabric_category !== category) {
      onUpdate("options_json", { ...currentJson, roman_fabric_category: category });
    }
  }, [productType, design?.fabric, design?.options_json, onUpdate]);

  const getGridOptions = (): GridOption[] => {
    switch (productType) {
      case "Roller Shades": {
        const liftSystem = getFieldValue(design, "lift_system");
        const shadeType = getFieldValue(design, "shade_type");
        const premiumHardware = getFieldValue(design, "json:premium_hardware");
        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: ROLLER_MOUNT_TYPES,
          },
          {
            key: "shade_type",
            label: "Shade Type",
            field: "shade_type",
            type: "buttons",
            options: ROLLER_SHADE_TYPES,
          },
          {
            key: "fabric",
            label: "Fabric",
            field: "fabric",
            type: "select",
            options: getMtsRollerFabricCollections(),
          },
          {
            key: "lift",
            label: "Lift System",
            field: "lift_system",
            type: "buttons",
            options: ROLLER_LIFT_SYSTEMS,
          },
          {
            key: "valance",
            label: "Valance",
            field: "valance",
            type: "select",
            options: ROLLER_VALANCES,
          },
          {
            key: "hem_bar",
            label: "Hem Bar",
            field: "json:hem_bar",
            type: "buttons",
            options: ROLLER_HEM_BARS,
          },
          {
            key: "light_guard_rails",
            label: "Light Guard Rails",
            field: "json:light_guard_rails",
            type: "yes-no",
            noFirst: true,
          },
          {
            key: "roll_type",
            label: "Roll Type",
            field: "json:roll_type",
            type: "buttons",
            options: ROLLER_ROLL_TYPES,
          },
          {
            key: "premium_hardware",
            label: "Premium Hardware",
            field: "json:premium_hardware",
            type: "yes-no",
            noFirst: true,
          },
        ];

        if (shadeType === "Coupled Shades") {
          options.push({
            key: "coupled_shade_count",
            label: "Coupled Shade Count",
            field: "json:coupled_shade_count",
            type: "buttons",
            options: ["2", "3", "4"],
          });
        }

        if (shadeType === "LightGuard 360 with T-Post") {
          options.push({
            key: "lightguard_360_shade_count",
            label: "LightGuard 360 Shade Count",
            field: "json:lightguard_360_shade_count",
            type: "buttons",
            options: ["2", "3", "4"],
          });
        }

        if (premiumHardware === "Yes") {
          options.push({
            key: "premium_hardware_color",
            label: "Premium Color",
            field: "json:premium_hardware_color",
            type: "select",
            options: ROLLER_PREMIUM_HARDWARE_COLORS,
          });
        }

        if (liftSystem === "Continuous Cord Loop") {
          options.push({
            key: "cord_loop_release",
            label: "Cord Loop Release",
            field: "json:cord_loop_release",
            type: "buttons",
            options: ROLLER_CORD_LOOP_RELEASES,
          });
        }

        if (liftSystem === "Motorized") {
          options.push({
            key: "motor_type",
            label: "Motor Type",
            field: "motor_type",
            type: "select",
            options: ROLLER_MOTOR_TYPE_OPTIONS,
          });
        }

        return options;
      }

      case "Roman Shades": {
        // Mirrors the Norman Roman Shades order form flow — see
        // docs/norman-roman-shades-order-map.md for the cascade source.
        const opts = (design?.options_json as Record<string, unknown>) || {};
        const mountType = getFieldValue(design, "mount_type");
        const shadeType = getFieldValue(design, "shade_type");
        const controlType = getFieldValue(design, "lift_system");
        const foldStyle = String(opts.fold_style || "");
        const chainType = String(opts.chain_type || "");
        const poles = String(opts.poles || "");
        const powerSource = getFieldValue(design, "motor_type");
        const valance = getFieldValue(design, "valance");
        const holdDowns = String(opts.hold_downs || "");
        const isDayNight = shadeType === "Day & Night";
        const isCommonValance = shadeType === "Common Valance";
        const isChainControl =
          controlType === "Continuous Cord Loop" || controlType === "SmartRelease";

        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: ROMAN_MOUNT_TYPES,
          },
          {
            key: "shade_type",
            label: "Shade Type",
            field: "shade_type",
            type: "buttons",
            options: ROMAN_SHADE_TYPES,
          },
          {
            key: "control",
            label: "Control Type",
            field: "lift_system",
            type: "buttons",
            options: ROMAN_LIFT_SYSTEMS,
          },
        ];

        // Chain controls — Continuous Cord Loop and SmartRelease only.
        if (isChainControl) {
          options.push({
            key: "chain_type",
            label: "Chain Type",
            field: "json:chain_type",
            type: "buttons",
            options: ROMAN_CHAIN_TYPES,
          });
          if (chainType === "Standard (Plastic)") {
            options.push({
              key: "chain_color",
              label: "Chain Color",
              field: "json:chain_color",
              type: "buttons",
              options: ROMAN_CHAIN_COLORS,
            });
          }
          options.push({
            key: "chain_location",
            label: "Chain Location",
            field: "json:chain_location",
            type: "buttons",
            options: ROMAN_CHAIN_LOCATIONS,
          });
          // Norman: Inside Mount + Continuous Cord Loop is standard-length only.
          const standardOnly =
            controlType === "Continuous Cord Loop" && mountType === "Inside Mount";
          options.push({
            key: "chain_length",
            label: "Chain Length",
            field: "json:chain_length",
            type: "select",
            options: standardOnly ? (["Standard"] as readonly string[]) : ROMAN_CHAIN_LENGTHS,
          });
        }

        // Cordless pole options.
        if (controlType === "Cordless") {
          options.push({
            key: "poles",
            label: "Poles",
            field: "json:poles",
            type: "select",
            options: ROMAN_POLE_OPTIONS,
          });
          if (poles === "Pole with Attachment") {
            options.push({
              key: "pole_length",
              label: "Pole Length",
              field: "json:pole_length",
              type: "buttons",
              options: ROMAN_POLE_LENGTHS,
            });
          }
        }

        // Motorization — power source drives which remotes/hubs apply.
        if (controlType === "Motorized") {
          options.push({
            key: "motor_type",
            label: "Power Source",
            field: "motor_type",
            type: "select",
            options: ROMAN_POWER_SOURCES,
          });
          if (powerSource && powerSource !== "AutoWand") {
            const isAutomate = ROMAN_AUTOMATE_POWER_SOURCES.has(powerSource);
            options.push({
              key: "remote_type",
              label: isAutomate ? "Remote / Wall Switch" : "Remote Type",
              field: "remote_type",
              type: "select",
              options: isAutomate ? ROMAN_REMOTES_AUTOMATE : ROMAN_REMOTES_NORMAN,
            });
            options.push({
              key: "hub_required",
              label: "Hub Required",
              field: "json:hub_required",
              type: "yes-no",
              noFirst: true,
            });
          }
        }

        // Shade style filters the available fabric collections.
        options.push({
          key: "fold_style",
          label: "Shade Style",
          field: "json:fold_style",
          type: "select",
          options: getRomanFoldStylesFor(shadeType),
        });
        options.push({
          key: "roman_fabric_category",
          label: "Fabric Category",
          field: "json:roman_fabric_category",
          type: "select",
          options: getRomanFabricCategoryNamesFor(foldStyle, shadeType),
        });
        options.push({
          key: "roman_fabric_color",
          label: isDayNight ? "Front Shade Fabric" : "Fabric Color",
          field: "fabric",
          type: "select",
          options: [] as readonly string[],
        });

        // Day & Night adds the back roller shade.
        if (isDayNight) {
          options.push({
            key: "back_fabric",
            label: "Back Shade Fabric",
            field: "json:back_fabric",
            type: "select",
            options: ROMAN_BACK_SHADE_FABRICS,
          });
          options.push({
            key: "back_hem_bar",
            label: "Back Shade Hem Bar",
            field: "json:back_hem_bar",
            type: "buttons",
            options: ROMAN_BACK_HEM_BARS,
          });
        }

        // Valance — Common Valance shades must have one (Norman forces Yes).
        const valanceChoices = isCommonValance
          ? (["Fabric Valance"] as readonly string[])
          : ROMAN_VALANCES;
        options.push({
          key: "valance",
          label: "Valance",
          field: "valance",
          type: "select",
          // Keep legacy stored values selectable so old quotes still render.
          options:
            valance && !valanceChoices.includes(valance)
              ? ([...valanceChoices, valance] as readonly string[])
              : valanceChoices,
        });
        if (valance === "Fabric Valance") {
          options.push({
            key: "valance_returns",
            label: "Valance Returns",
            field: "json:valance_returns",
            type: "select",
            options:
              mountType === "Outside Mount"
                ? ROMAN_VALANCE_RETURNS_OUTSIDE
                : ROMAN_VALANCE_RETURNS_INSIDE,
          });
        }

        options.push({
          key: "lining",
          label: "Lining",
          field: "json:lining",
          type: "buttons",
          options: ROMAN_LININGS,
        });

        // Hold downs are an outside-mount option (magnetic catch).
        if (mountType === "Outside Mount") {
          options.push({
            key: "hold_downs",
            label: "Hold Down Brackets",
            field: "json:hold_downs",
            type: "buttons",
            options: ROMAN_HOLD_DOWNS,
          });
          if (holdDowns === "Magnetic") {
            options.push({
              key: "magnet_color",
              label: "Magnet Catch Color",
              field: "json:magnet_color",
              type: "select",
              options: ROMAN_MAGNET_COLORS,
            });
          }
        }

        return options;
      }

      case "Honeycomb Shades": {
        // Mirrors the Norman Portrait Honeycomb order form flow — see
        // docs/norman-honeycomb-order-map.md for the cascade source.
        const mountType = getFieldValue(design, "mount_type");
        const storedCellSize = getFieldValue(design, "json:cell_size");
        const cellSize = canonicalizeHoneycombCellSize(storedCellSize);
        const operatingSystem = getFieldValue(design, "lift_system");
        const powerSource = getFieldValue(design, "motor_type");

        // Keep legacy stored values selectable so old quotes still render.
        const withStoredValue = (choices: readonly string[], stored: string | null) =>
          stored && !choices.includes(stored)
            ? ([...choices, stored] as readonly string[])
            : choices;

        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: HONEYCOMB_MOUNT_TYPES,
          },
          {
            key: "cell_size",
            label: "Shade Size",
            field: "json:cell_size",
            type: "select",
            options: withStoredValue(HONEYCOMB_CELL_SIZES, storedCellSize),
          },
          {
            key: "operating_system",
            label: "Operating System",
            field: "lift_system",
            type: "select",
            options: withStoredValue(getHoneycombOperatingSystemsFor(cellSize), operatingSystem),
          },
        ];

        // Chain controls — the Cord Loop family and SmartRelease.
        if (isHoneycombChainOperatingSystem(operatingSystem)) {
          options.push({
            key: "chain_location",
            label: "Chain Location",
            field: "json:chain_location",
            type: "buttons",
            options: HONEYCOMB_CHAIN_LOCATIONS,
          });
          options.push({
            key: "chain_length",
            label: "Chain Length",
            field: "json:chain_length",
            type: "buttons",
            options: HONEYCOMB_CHAIN_LENGTHS,
          });
        }

        // Cordless and SmartFit systems take an operating pole.
        if (isHoneycombCordlessPoleOperatingSystem(operatingSystem)) {
          options.push({
            key: "poles",
            label: "Poles",
            field: "json:poles",
            type: "select",
            options: HONEYCOMB_POLE_OPTIONS,
          });
        }

        // Motorization — power source drives which remotes/hubs apply.
        if (isHoneycombMotorizedOperatingSystem(operatingSystem)) {
          options.push({
            key: "motor_type",
            label: "Power Source",
            field: "motor_type",
            type: "select",
            options: withStoredValue(getHoneycombMotorsFor(operatingSystem), powerSource),
          });
          if (powerSource && powerSource !== "AutoWand") {
            const isAutomate = HONEYCOMB_AUTOMATE_POWER_SOURCES.has(powerSource);
            options.push({
              key: "remote_type",
              label: isAutomate ? "Remote / Wall Switch" : "Remote Type",
              field: "remote_type",
              type: "select",
              options: isAutomate ? ROMAN_REMOTES_AUTOMATE : ROMAN_REMOTES_NORMAN,
            });
            options.push({
              key: "hub_required",
              label: "Hub Required",
              field: "json:hub_required",
              type: "yes-no",
              noFirst: true,
            });
          }
        }

        // Day & Night systems add the back shade fabric (the rep records the
        // fabric line here; the front color comes from the fabric search).
        if (isHoneycombDayNightOperatingSystem(operatingSystem)) {
          options.push({
            key: "back_fabric",
            label: "Back Shade Fabric",
            field: "json:back_fabric",
            type: "select",
            options: getHoneycombDealerFabricTypesFor(cellSize),
          });
        }

        // SmartFit-with-Frame (Decoflex) sizes add the frame details.
        if (isHoneycombFrameCellSize(cellSize)) {
          options.push({
            key: "frame_qty",
            label: "Frame Quantity",
            field: "json:frame_qty",
            type: "select",
            options: ["1", "2", "3"] as readonly string[],
          });
          options.push({
            key: "pre_drilled",
            label: "Pre-Drilled Frame",
            field: "json:pre_drilled",
            type: "yes-no",
            noFirst: true,
          });
        }

        // "2 on 1" shades are only offered on a few operating systems.
        if (honeycombOperatingSystemAllows2On1(operatingSystem)) {
          options.push({
            key: "shade_type",
            label: "Shade Type",
            field: "shade_type",
            type: "buttons",
            options: HONEYCOMB_SHADE_TYPES_2ON1,
          });
        }

        options.push({
          key: "light_control",
          label: "Light Control",
          field: "json:light_control",
          type: "buttons",
          options: HONEYCOMB_LIGHT_CONTROL,
        });
        options.push({
          key: "fabric",
          label: "Fabric",
          field: "fabric",
          type: "select",
          options: [] as readonly string[],
        });
        options.push({
          key: "rail_color",
          label: "Rail Color",
          field: "json:rail_color",
          type: "select",
          options: HONEYCOMB_RAIL_COLORS,
        });

        // Hold downs are an outside-mount option at Norman.
        if (mountType === "Outside Mount") {
          options.push({
            key: "hold_downs",
            label: "Hold Down Brackets",
            field: "json:hold_downs",
            type: "buttons",
            options: HONEYCOMB_HOLD_DOWNS,
          });
        }

        return options;
      }

      case "Sheer Shades": {
        const liftSystem = getFieldValue(design, "lift_system");
        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: PERFECTSHEER_MOUNT_TYPES,
          },
          {
            key: "light_control",
            label: "Light Control",
            field: "json:light_control",
            type: "buttons",
            options: PERFECTSHEER_LIGHT_CONTROL,
          },
          {
            key: "lift",
            label: "Lift System",
            field: "lift_system",
            type: "buttons",
            options: PERFECTSHEER_LIFT_SYSTEMS,
          },
          {
            key: "fabric",
            label: "Fabric",
            field: "fabric",
            type: "select",
            options: [] as readonly string[],
          },
        ];

        // Show motorization options if Motorized is selected
        if (liftSystem === "Motorized") {
          options.push({
            key: "motor_type",
            label: "Motor Type",
            field: "motor_type",
            type: "select",
            options: MOTORIZATION_OPTIONS.map((m) => m.name) as readonly string[],
          });
          options.push({
            key: "hub_required",
            label: "Hub Required",
            field: "json:hub_required",
            type: "yes-no",
            noFirst: true,
          });
          options.push({
            key: "remote_type",
            label: "Remote Type",
            field: "remote_type",
            type: "select",
            options: [
              "15-Channel Remote",
              "5-Channel Wall Switch",
              "SmartDial Remote",
              "Basic Remote",
            ] as readonly string[],
          });
        }

        return options;
      }

      case "Faux Wood Blinds": {
        return [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: FAUX_WOOD_MOUNT_TYPES,
          },
          {
            key: "slat_size",
            label: "Slat Size",
            field: "json:slat_size",
            type: "buttons",
            options: FAUX_WOOD_SLAT_SIZES,
          },
          {
            key: "product_line",
            label: "Product Line",
            field: "json:product_line",
            type: "buttons",
            options: FAUX_WOOD_PRODUCT_LINES,
          },
          {
            key: "color",
            label: "Color",
            field: "json:color",
            type: "select",
            options: [] as readonly string[],
          },
        ];
      }

      case "Mini Blinds": {
        const slatSize = getFieldValue(design, "json:slat_size");
        return [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: MINI_BLIND_MOUNT_TYPES,
          },
          {
            key: "slat_size",
            label: "Slat Size",
            field: "json:slat_size",
            type: "buttons",
            options: MINI_BLIND_SLAT_SIZES,
          },
          {
            key: "color",
            label: "Color",
            field: "json:color",
            type: "select",
            options: [] as readonly string[],
          },
          {
            key: "slat_finish",
            label: "Slat Finish",
            field: "json:slat_finish",
            type: "buttons",
            options: MINI_BLIND_FINISHES,
          },
          {
            key: "light_control",
            label: "Light Control",
            field: "json:light_control",
            type: "buttons",
            options: getMiniBlindLightControlOptions(slatSize),
          },
          ...(slatSize === '2"'
            ? [{
                key: "side_mount_bracket",
                label: "Side Mount Bracket",
                field: "json:side_mount_bracket",
                type: "yes-no" as const,
                noFirst: true,
              }]
            : []),
          {
            key: "shim",
            label: "Shim",
            field: "json:shim",
            type: "yes-no",
            noFirst: true,
          },
        ];
      }

      case "Wood Blinds":
        return [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: WOOD_BLIND_MOUNT_TYPES,
          },
          {
            key: "slat_size",
            label: "Slat Size",
            field: "json:slat_size",
            type: "buttons",
            options: WOOD_BLIND_SLAT_SIZES,
          },
          {
            key: "color",
            label: "Color",
            field: "json:color",
            type: "select",
            options: [] as readonly string[],
          },
        ];

      case "Vertical Blinds": {
        return [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: VERTICAL_MOUNT_TYPES,
          },
          {
            key: "fabric_group",
            label: "Fabric Group",
            field: "json:fabric_group",
            type: "select",
            options: VERTICAL_FABRIC_GROUPS,
          },
          {
            key: "vertical_color",
            label: "Color / Material",
            field: "json:vertical_color",
            type: "select",
            options: [] as readonly string[],
          },
          {
            key: "stack",
            label: "Stack Option",
            field: "json:stack_option",
            type: "buttons",
            options: VERTICAL_STACK_OPTIONS,
          },
          {
            key: "control_type",
            label: "Control Type",
            field: "json:control_type",
            type: "buttons",
            options: VERTICAL_CONTROL_TYPES,
          },
        ];
      }

      case "Smart Drapes": {
        const controlType = getFieldValue(design, "json:control_type");
        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: SMARTDRAPE_MOUNT_TYPES,
          },
          {
            key: "shade_type",
            label: "Shade Type",
            field: "shade_type",
            type: "buttons",
            options: SMARTDRAPE_SHADE_TYPES,
          },
          {
            key: "fabric",
            label: "Fabric",
            field: "fabric",
            type: "select",
            options: [] as readonly string[],
          },
          {
            key: "stack",
            label: "Stack Option",
            field: "json:stack_option",
            type: "buttons",
            options: SMARTDRAPE_STACK_OPTIONS,
          },
          {
            key: "control_type",
            label: "Control Type",
            field: "json:control_type",
            type: "buttons",
            options: SMARTDRAPE_CONTROL_TYPES,
          },
          {
            key: "control_side",
            label: "Control Side",
            field: "json:control_side",
            type: "buttons",
            options: SMARTDRAPE_CONTROL_SIDES,
          },
        ];

        // Show motorization options if Motorized is selected
        if (controlType === "Motorized") {
          options.push({
            key: "motor_type",
            label: "Motor Type",
            field: "motor_type",
            type: "select",
            options: MOTORIZATION_OPTIONS.map((m) => m.name) as readonly string[],
          });
          options.push({
            key: "hub_required",
            label: "Hub Required",
            field: "json:hub_required",
            type: "yes-no",
            noFirst: true,
          });
          options.push({
            key: "remote_type",
            label: "Remote Type",
            field: "remote_type",
            type: "select",
            options: ["15-Channel Remote", "5-Channel Wall Switch"] as readonly string[],
          });
        }

        return options;
      }

      default:
        return [];
    }
  };

  const gridOptions = getGridOptions();
  const optionsJson = (design?.options_json as Record<string, unknown>) || {};

  const handleManualPriceChange = (price: number) => {
    onUpdateFields({
      unit_price: price,
      options_json: { ...optionsJson, manual_price_override: true },
    });
  };

  const handleRollerFabricSelect = (fabricColor: MtsRollerFabricColor) => {
    setOpenOptionField(null);
    onUpdateFields({
      fabric: fabricColor.collection,
      options_json: {
        ...withoutProductColorDetails(optionsJson),
        [ROLLER_FABRIC_COLOR_ID_DETAIL]: fabricColor.id,
        [PRODUCT_COLOR_PRODUCT_ID_DETAIL]: "roller",
        [PRODUCT_COLOR_PROGRAM_DETAIL]: fabricColor.programId,
        [ROLLER_FABRIC_COLOR_COLLECTION_DETAIL]: fabricColor.collection,
        [ROLLER_FABRIC_COLOR_CODE_DETAIL]: fabricColor.colorCode,
        [ROLLER_FABRIC_COLOR_NAME_DETAIL]: fabricColor.colorName,
        [ROLLER_FABRIC_COLOR_TYPE_DETAIL]: fabricColor.fabricType,
      },
    });
  };

  const handleRollerFabricClear = () => {
    setOpenOptionField("fabric");
    onUpdateFields({
      fabric: null,
      options_json: withoutProductColorDetails(optionsJson),
    });
  };

  const handleProductColorSelect = (field: string, fabricColor: ProductColorOption) => {
    setOpenOptionField(null);

    const selectedValue = getMtsProductColorValue(fabricColor);
    let nextJson: Record<string, unknown> = {
      ...withoutProductColorDetails(optionsJson),
      ...fabricColor.automaticDetails,
      [PRODUCT_COLOR_ID_DETAIL]: fabricColor.id,
      [PRODUCT_COLOR_PRODUCT_ID_DETAIL]: fabricColor.productId,
      [PRODUCT_COLOR_PROGRAM_DETAIL]: fabricColor.programId,
      [PRODUCT_COLOR_COLLECTION_DETAIL]: fabricColor.collection,
      [PRODUCT_COLOR_CODE_DETAIL]: fabricColor.colorCode,
      [PRODUCT_COLOR_NAME_DETAIL]: fabricColor.colorName,
      [PRODUCT_COLOR_TYPE_DETAIL]: fabricColor.fabricType,
    };
    const patch: Record<string, unknown> = {};
    const jsonKey = getJsonFieldKey(field);

    if (jsonKey) {
      nextJson = { ...nextJson, [jsonKey]: selectedValue };
    } else {
      patch[field] = selectedValue;
    }

    if (productType === "Roman Shades") {
      nextJson.roman_fabric_category = fabricColor.collection;
    }

    if (productType === "Honeycomb Shades") {
      const inferredCellSize = getHoneycombCellSizeFromProgram(fabricColor.programId);
      const inferredLightControl = getLightControlFromProductColor(fabricColor);
      if (inferredCellSize && !nextJson.cell_size) nextJson.cell_size = inferredCellSize;
      if (inferredLightControl && !nextJson.light_control) nextJson.light_control = inferredLightControl;
    }

    if (productType === "Sheer Shades") {
      const inferredLightControl = getLightControlFromProductColor(fabricColor);
      if (inferredLightControl) nextJson.light_control = inferredLightControl;
    }

    if (productType === "Smart Drapes") {
      const inferredShadeType = getSmartDrapeShadeTypeFromProductColor(fabricColor);
      if (inferredShadeType) patch.shade_type = inferredShadeType;
    }

    if (productType === "Vertical Blinds") {
      nextJson.fabric_group = fabricColor.collection;
    }

    if (productType === "Faux Wood Blinds") {
      const inferredProductLine = getFauxWoodProductLineFromProductId(fabricColor.productId);
      if (inferredProductLine) nextJson.product_line = inferredProductLine;
    }

    if (productType === "Mini Blinds") {
      nextJson.slat_finish = getMiniBlindFinishFromColor(fabricColor.colorName);
    }

    onUpdateFields({
      ...patch,
      options_json: nextJson,
    });
  };

  const handleProductColorClear = (field: string) => {
    setOpenOptionField(field);

    let nextJson = withoutProductColorDetails(optionsJson);
    const jsonKey = getJsonFieldKey(field);
    if (jsonKey) {
      nextJson = { ...nextJson, [jsonKey]: null };
    }

    onUpdateFields({
      ...(field === "fabric" ? { fabric: null } : {}),
      options_json: nextJson,
    });
  };

  // Create fabric groups for dropdowns
  const getFabricGroups = (): GridSelectGroup[] | undefined => {
    if (productType === "Honeycomb Shades") {
      const cellSize = getFieldValue(design, "json:cell_size");
      if (cellSize) {
        return getHoneycombFabricGroups(cellSize);
      }
    }
    return undefined;
  };

  const mainGridOptions =
    productType === "Roller Shades"
      ? gridOptions.filter((option) => !ROLLER_MORE_OPTION_FIELDS.has(option.field))
      : gridOptions;
  const moreGridOptions =
    productType === "Roller Shades"
      ? gridOptions.filter((option) => ROLLER_MORE_OPTION_FIELDS.has(option.field))
      : [];
  const optionRows = partitionOptionSlots(
    mainGridOptions,
    getShadeMandatoryFields(productType, gridOptions)
  );
  const moreOptionRows = partitionOptionSlots(moreGridOptions, []);
  const moreEditableOptionRows = getEditableOptionRows(moreOptionRows, design, openOptionField);
  const confirmedOptions = getConfirmedOptionItems(design, gridOptions);
  const editableOptionRows = getEditableOptionRows(optionRows, design, openOptionField);
  const hasAnySelectedOption = gridOptions.some((option) =>
    hasOptionValue(getFieldValue(design, option.field))
  );

  const renderOptionControl = (opt: GridOption) => {
    const value = getFieldValue(design, opt.field);

    if (opt.type === "buttons") {
      return (
        <GridButtonGroup
          label={opt.label}
          options={opt.options}
          value={value}
          hideLabel
          onChange={(v) => {
            handleUpdate(opt.field, v);
            setOpenOptionField(null);
          }}
        />
      );
    }

    if (opt.type === "select") {
      if (supportsMtsProductColorSearch(productType, opt.field, optionsJson)) {
        return (
          <ProductColorAutocomplete
            productType={productType}
            field={opt.field}
            value={value}
            optionsJson={optionsJson}
            hideLabel
            onSelect={(fabricColor) => {
              handleProductColorSelect(opt.field, fabricColor);
              setOpenOptionField(null);
            }}
            onClear={() => {
              handleProductColorClear(opt.field);
              setOpenOptionField(null);
            }}
          />
        );
      }

      if (productType === "Roller Shades" && opt.field === "fabric") {
        return (
          <RollerFabricAutocomplete
            value={value}
            optionsJson={optionsJson}
            hideLabel
            onSelect={(fabricColor) => {
              handleRollerFabricSelect(fabricColor);
              setOpenOptionField(null);
            }}
            onClear={() => {
              handleRollerFabricClear();
              setOpenOptionField(null);
            }}
          />
        );
      }

      const fabricGroups = opt.field === "fabric" ? getFabricGroups() : undefined;
      return (
        <GridSelect
          label={opt.label}
          options={opt.options}
          value={value}
          grouped={fabricGroups}
          hideLabel
          onChange={(v) => {
            handleUpdate(opt.field, v);
            setOpenOptionField(null);
          }}
        />
      );
    }

    return (
      <GridYesNo
        label={opt.label}
        value={value}
        noFirst={opt.noFirst}
        hideLabel
        onChange={(v) => {
          handleUpdate(opt.field, v);
          setOpenOptionField(null);
        }}
      />
    );
  };

  const renderOptionSlot = (opt: GridOption, requirement: OptionSlotRequirement) => (
    <OptionSlot
      key={opt.key}
      option={opt}
      value={getOptionSlotValue(design, opt.field)}
      requirement={requirement}
      isOpen={openOptionField === opt.field}
      onToggle={() => setOpenOptionField((field) => (field === opt.field ? null : opt.field))}
      renderSelectedDirect={
        opt.type === "select" &&
        !supportsMtsProductColorSearch(productType, opt.field, optionsJson) &&
        !(productType === "Roller Shades" && opt.field === "fabric")
      }
    >
      {renderOptionControl(opt)}
    </OptionSlot>
  );

  const handleConfirmedOptionReset = (field: string) => {
    if (ROLLER_MORE_OPTION_FIELDS.has(field)) setShowMoreOptions(true);
    handleUpdate(field, null);
    setOpenOptionField(field);
  };

  return (
    <div className="space-y-3">
      <ConfirmedOptionStrip
        items={confirmedOptions}
        editingField={openOptionField}
        onReset={handleConfirmedOptionReset}
      />

      {(editableOptionRows.mandatory.length > 0 || editableOptionRows.optional.length > 0) && (
        <OptionSlotRows
          mandatoryOptions={editableOptionRows.mandatory}
          optionalOptions={editableOptionRows.optional}
          renderSlot={renderOptionSlot}
        />
      )}

      {gridOptions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={showMoreOptions}
              onClick={() => setShowMoreOptions((value) => !value)}
              className="quote-more-options-button"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              More Options
            </button>
          </div>

          {showMoreOptions && (
            <div className="space-y-2">
              {moreGridOptions.length > 0 &&
                (moreEditableOptionRows.mandatory.length > 0 ||
                  moreEditableOptionRows.optional.length > 0) && (
                  <OptionSlotRows
                    mandatoryOptions={moreEditableOptionRows.mandatory}
                    optionalOptions={moreEditableOptionRows.optional}
                    renderSlot={renderOptionSlot}
                  />
                )}
              <div className="quote-style-option-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2">
                {INSTALL_MORE_OPTIONS.map((opt) => (
                  <GridYesNo
                    key={opt.key}
                    label={opt.label}
                    value={getFieldValue(design, opt.field)}
                    onChange={(v) => handleUpdate(opt.field, v)}
                    noFirst={opt.noFirst}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price input - always show when at least one option is confirmed */}
      {hasAnySelectedOption && (
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Price:</Label>
            <div className="relative w-32">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <DeferredNumberInput
                value={design?.unit_price || ""}
                onCommit={handleManualPriceChange}
                commitOnChange
                className="pl-5 h-8 text-sm"
                placeholder="0.00"
              />
            </div>
            {onRecalculatePrice && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRecalculatePrice}
                className="h-8 rounded-lg text-xs"
                title="Recalculate this locked contract line"
              >
                <Calculator className="mr-1 h-3.5 w-3.5" />
                Reprice
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Specialty Shape Grid (kept from original) ---

function SpecialtyShapeGrid({
  shapes,
  categories,
  onSelect,
}: {
  shapes: SpecialtyShape[];
  categories: readonly string[];
  onSelect: (label: string) => void;
}) {
  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const categoryShapes = shapes.filter((s) => s.category === category);
        if (categoryShapes.length === 0) return null;
        return (
          <div key={category} className="space-y-3">
            <h4 className="text-sm font-bold">{category}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categoryShapes.map((shape) => (
                <button
                  key={shape.id}
                  onClick={() => onSelect(shape.label)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-border bg-background hover:bg-accent hover:border-primary/50 transition-all group"
                >
                  <div className="w-full aspect-square flex items-center justify-center bg-accent/50 rounded-lg overflow-hidden">
                    <img
                      src={shape.image}
                      alt={shape.label}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        target.parentElement!.innerHTML = `<span class="text-xs text-center text-muted-foreground px-1">${shape.label}</span>`;
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">
                    {shape.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

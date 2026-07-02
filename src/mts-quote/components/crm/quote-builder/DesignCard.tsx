import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ChangeEvent,
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
  ROMAN_LIFT_SYSTEMS,
  ROMAN_VALANCES,
  ROMAN_FABRIC_CATEGORY_NAMES,
  getRomanFabricCategoryForColor,
  getRomanFabricCategoryName,
  getRomanFabricCanonicalLabel,
  getRomanFabricColorsForCategory,
  HONEYCOMB_MOUNT_TYPES,
  HONEYCOMB_CELL_SIZES,
  HONEYCOMB_SHADE_TYPES,
  HONEYCOMB_LIFT_SYSTEMS,
  HONEYCOMB_LIGHT_CONTROL,
  PERFECTSHEER_MOUNT_TYPES,
  PERFECTSHEER_LIGHT_CONTROL,
  PERFECTSHEER_LIFT_SYSTEMS,
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
import {
  calculateDiscountedPrice,
  removeQuoteDesignDiscount,
  type QuoteDiscountPercent,
} from "@mts/lib/quoteDiscounts";
import { getAutomaticShutterOptionSurcharges } from "@mts/lib/shutterOptionSurcharges";
import {
  FAUX_WOOD_SURCHARGES,
  HONEYCOMB_SURCHARGES,
  MOTORIZATION_OPTIONS,
  ONYX_SHUTTER_FIXED_SURCHARGES,
  ONYX_SHUTTER_PERCENTAGE_SURCHARGES,
  PERFECTSHEER_SURCHARGES,
  ROLLER_MOTORIZATION,
  ROLLER_SURCHARGES,
  ROMAN_SURCHARGES,
  SHUTTER_FIXED_SURCHARGES,
  SHUTTER_PERCENTAGE_SURCHARGES,
  SMARTDRAPE_SURCHARGES,
  VERTICAL_SURCHARGES,
  WOOD_BLIND_SURCHARGES,
  type MotorOption,
  type Surcharge,
} from "@mts/lib/pricingData";
import { useRetailPriceStore } from "@mts/stores/retailPriceStore";

interface DesignCardProps {
  lineItem: SalesQuoteLineItem;
  lineNumber: number;
  instanceIndex: number;
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
  design: SalesQuoteDesign | undefined
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

  if (
    productType === "Roller Shades" &&
    (liftSystem === "Smart Release" || cordLoopRelease === "Smart Release")
  ) {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(HONEYCOMB_SURCHARGES, "SmartRelease"),
        "Lift System",
        "Smart Release"
      )
    );
  }

  if (productType === "Honeycomb Shades" && liftSystem === "Smart Release") {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(HONEYCOMB_SURCHARGES, "SmartRelease"),
        "Lift System",
        "Smart Release"
      )
    );
  }

  if (productType === "Honeycomb Shades" && liftSystem === "Top Down-Bottom Up") {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(HONEYCOMB_SURCHARGES, "TDBU (Top Down Bottom Up)"),
        "Lift System",
        "Top Down-Bottom Up"
      )
    );
  }

  if (productType === "Honeycomb Shades" && cellSize.includes("SmartFit")) {
    const smartFitCharge =
      design.shade_type === "Day/Night*" ? "SmartFit Dual Shade with Frame" : "SmartFit with Frame";
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(HONEYCOMB_SURCHARGES, smartFitCharge),
        "Cell Size"
      )
    );
  }

  const selectedValance = typeof design.valance === "string" ? design.valance.toLowerCase() : "";
  const hasWoodValance =
    selectedValance.includes("premium wood") || selectedValance.includes("modern wood");

  if ((productType === "Roller Shades" || productType === "Roman Shades") && hasWoodValance) {
    appendSurcharge(
      surcharges,
      toAutomaticSurcharge(
        productType,
        findSurcharge(
          productType === "Roller Shades" ? ROLLER_SURCHARGES : ROMAN_SURCHARGES,
          "Premium Wood Light Guard"
        ),
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
    appendSurcharge(
      surcharges,
      getMotorOptionSurcharge(productType, design.motor_type, motorBrand)
    );
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
  const motorized = design?.lift_system === "Motorized" || opts.control_type === "Motorized";
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

function PriceExplanation({
  design,
  productType,
  rawSqft,
  sqft,
}: {
  design: SalesQuoteDesign | undefined;
  productType: string;
  rawSqft: number | null;
  sqft: number | null;
}) {
  const options = (design?.options_json as Record<string, unknown> | undefined) || {};
  const isManual = options.manual_price_override === true;
  const hasStoredPricing =
    options.base_price !== undefined ||
    options.pricing_grid_width !== undefined ||
    options.surcharge_total !== undefined ||
    options.discount_percent !== undefined;
  const hasPrice = Boolean(design && (hasStoredPricing || isManual || design.unit_price));

  const gridWidth = Number(options.pricing_grid_width);
  const gridHeight = Number(options.pricing_grid_height);
  const hasGridMatch = Number.isFinite(gridWidth) && Number.isFinite(gridHeight);
  const discountPercent = Number(options.discount_percent) || 0;
  const surchargeTotal = Number(options.surcharge_total) || 0;

  return (
    <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-900">Why this price?</summary>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        <div>
          <span className="font-semibold">Product:</span> {productType}
        </div>
        {!hasPrice && (
          <div>
            <span className="font-semibold">Status:</span> waiting for saved selections and measurements
          </div>
        )}
        {isManual && (
          <div>
            <span className="font-semibold">Mode:</span> manual customer price
          </div>
        )}
        {hasGridMatch && (
          <div>
            <span className="font-semibold">Grid cell:</span> {gridWidth}&quot; W x {gridHeight}
            &quot; H
          </div>
        )}
        {!!options.pricing_grid_key && (
          <div>
            <span className="font-semibold">Grid:</span> {String(options.pricing_grid_key)}
          </div>
        )}
        {options.pricing_grid_price !== undefined && (
          <div>
            <span className="font-semibold">Grid price:</span>{" "}
            {formatMoney(options.pricing_grid_price)}
          </div>
        )}
        {options.base_price !== undefined && (
          <div>
            <span className="font-semibold">Base:</span> {formatMoney(options.base_price)}
          </div>
        )}
        <div>
          <span className="font-semibold">Surcharges:</span> {formatMoney(surchargeTotal)}
        </div>
        {discountPercent > 0 && (
          <>
            <div>
              <span className="font-semibold">Discount:</span> {discountPercent}% (
              {formatMoney(options.discount_amount)})
            </div>
            <div>
              <span className="font-semibold">Discount source:</span>{" "}
              {formatMoney(options.discount_source_price)}
            </div>
          </>
        )}
        {productType === "Shutters" && rawSqft !== null && sqft !== null && (
          <div>
            <span className="font-semibold">Sq ft:</span> {rawSqft.toFixed(2)} actual,{" "}
            {sqft.toFixed(2)} priced
          </div>
        )}
        <div>
          <span className="font-semibold">Final:</span> {formatMoney(design?.unit_price || 0)}
        </div>
      </div>
    </details>
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
  if (
    productType === "Honeycomb Shades" &&
    (changedField === "json:cell_size" || changedField === "json:light_control")
  ) {
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
        "lift_system",
        "valance",
        "json:roman_fabric_category",
        "fabric",
      ].filter((field) => allFields.includes(field));
    case "Honeycomb Shades":
      return [
        "mount_type",
        "json:cell_size",
        "shade_type",
        "lift_system",
        "json:light_control",
        "fabric",
      ].filter((field) => allFields.includes(field));
    case "Sheer Shades":
      return ["mount_type", "json:light_control", "lift_system", "fabric"].filter((field) =>
        allFields.includes(field)
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
  onUpdate,
}: {
  productType: string;
  design: SalesQuoteDesign | undefined;
  onUpdate: (field: string, value: unknown) => void;
}) {
  const [adding, setAdding] = useState(false);
  const automaticSurcharges = getAutomaticOptionSurcharges(productType, design);
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
        label: "Panel Configuration",
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
      label: "Panel Configuration",
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
    () => searchMtsRollerFabricColors(query, { includeUnavailable: true, limit: 60 }),
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
  instanceIndex,
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
}: DesignCardProps) {
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
  const [showLineNote, setShowLineNote] = useState(false);
  const [retailInput, setRetailInput] = useState("");
  const currentDesign = designs.find((d) => d.variant === activeVariant);
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

  const handleVariantChange = (variant: string) => {
    userSelectedVariantRef.current = true;
    setActiveVariant(variant);
  };

  // Compute sqft and current retail $/sqft for shutters
  const widthIn = measurementToInches(lineItem.width_whole, lineItem.width_fraction);
  const heightIn = measurementToInches(lineItem.height_whole, lineItem.height_fraction);
  const sqft =
    isShutters && widthIn > 0 && heightIn > 0 ? calculateSqft(widthIn, heightIn, true) : null;
  const rawSqft =
    isShutters && widthIn > 0 && heightIn > 0 ? calculateSqft(widthIn, heightIn, false) : null;

  const currentRetailPerSqft =
    isShutters && currentDesign?.supplier
      ? getRetailPrice(currentDesign.supplier, getShutterProgramName(currentDesign) ?? "")
      : null;

  const updateFields = (fields: Partial<SalesQuoteDesign>) => {
    onUpdateDesign({
      line_item_id: lineItem.id,
      variant: activeVariant,
      product_type: lineItem.product_type,
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
      fabric: currentDesign.fabric || undefined,
    });
    const basePrice = priceBreakdown.price;
    if (basePrice === null) return;

    const selectedSurcharges = dedupeQuoteSurcharges([
      ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign),
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
      fabric: currentDesign.fabric || undefined,
    });
    const basePrice = priceBreakdown.price;
    if (basePrice === null) return;

    const selectedSurcharges = dedupeQuoteSurcharges([
      ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign),
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
      fabric: currentDesign.fabric || undefined, // Pass fabric for all fabric-based routing
    });
    const basePrice = priceBreakdown.price;

    if (basePrice !== null) {
      const selectedSurcharges = dedupeQuoteSurcharges([
        ...getAutomaticOptionSurcharges(lineItem.product_type, currentDesign),
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
              {lineNumber > 0 && (
                <span className="quote-line-card-number" title={`Line ${lineNumber}`}>
                  #{lineNumber}
                </span>
              )}
              <h3 className="quote-line-card-room">{lineItem.room_name}</h3>
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
              {lineItem.quantity > 1 && (
                <span className="quote-line-card-quantity">
                  x{lineItem.quantity} (#{instanceIndex + 1})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-2.5 py-1.5 shadow-sm">
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
              <div>
                <span className="text-lg font-bold">
                  {formatMoney(currentDesign?.unit_price || 0)}
                </span>
                <div className="text-[11px] text-muted-foreground">excl. tax</div>
              </div>
            </div>
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

        <PriceExplanation
          design={currentDesign}
          productType={lineItem.product_type}
          rawSqft={rawSqft}
          sqft={sqft}
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
          <PriceExplanation design={design} productType={productType} rawSqft={null} sqft={null} />
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
        const liftSystem = getFieldValue(design, "lift_system");
        const options: GridOption[] = [
          {
            key: "mount",
            label: "Mount Type",
            field: "mount_type",
            type: "buttons",
            options: ROMAN_MOUNT_TYPES,
          },
          {
            key: "lift",
            label: "Lift System",
            field: "lift_system",
            type: "buttons",
            options: ROMAN_LIFT_SYSTEMS,
          },
          {
            key: "valance",
            label: "Valance",
            field: "valance",
            type: "select",
            options: ROMAN_VALANCES,
          },
          {
            key: "roman_fabric_category",
            label: "Fabric Category",
            field: "json:roman_fabric_category",
            type: "select",
            options: ROMAN_FABRIC_CATEGORY_NAMES,
          },
          {
            key: "roman_fabric_color",
            label: "Fabric Color",
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

      case "Honeycomb Shades": {
        const liftSystem = getFieldValue(design, "lift_system");

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
            label: "Cell Size",
            field: "json:cell_size",
            type: "buttons",
            options: HONEYCOMB_CELL_SIZES,
          },
          {
            key: "shade_type",
            label: "Shade Type",
            field: "shade_type",
            type: "buttons",
            options: HONEYCOMB_SHADE_TYPES,
          },
          {
            key: "lift",
            label: "Lift System",
            field: "lift_system",
            type: "buttons",
            options: HONEYCOMB_LIFT_SYSTEMS,
          },
          {
            key: "light_control",
            label: "Light Control",
            field: "json:light_control",
            type: "buttons",
            options: HONEYCOMB_LIGHT_CONTROL,
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
          <PriceExplanation design={design} productType={productType} rawSqft={null} sqft={null} />
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

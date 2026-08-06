/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { ManufacturerProductButtons } from "./ManufacturerProductButtons";
import { RoomPresetButtons } from "./RoomPresetButtons";
import { MeasurementGridModal } from "./MeasurementGridModal";
import {
  buildCatalogSelectionPatch,
  DesignCard,
  loadQuoteBuilderCatalog,
} from "./DesignCard";
import { resolveManufacturerStamp } from "./manufacturerStamp";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import {
  QUOTE_LAB_MAX_LINES,
  type QuoteLabCatalogProduct,
} from "@/lib/quote-lab/types";
import {
  QUOTE_V2_SELECTED_DESIGN_MARKER,
  hasCompletePersistedDesignSelections,
  projectPersistedDesignSelections,
  resolveSelectedQuoteDesign,
} from "@/lib/quote-v2/selected-design";
import { isPolarQuoteOnlyProductId } from "@/lib/quote/quote-only-policy";
import { Textarea } from "@mts/components/ui/textarea";
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  Loader2,
  RotateCcw,
  Pencil,
  CopyCheck,
  Send,
  CreditCard,
  DollarSign,
  MapPin,
  Percent,
  Phone,
  X,
} from "lucide-react";
import { SendQuoteDialog } from "./SendQuoteDialog";
import { SendPaymentLinkDialog } from "./SendPaymentLinkDialog";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { CollectPaymentDialog } from "./CollectPaymentDialog";
import { FloatingQuoteTotalBadge } from "./FloatingQuoteTotalBadge";
import { toast } from "sonner";
import { cn } from "@mts/lib/utils";
import {
  SHUTTER_AUTO_VARIANTS as _SHUTTER_AUTO_VARIANTS,
  getQuoteColor,
} from "@mts/lib/quoteConstants";
import { QuoteGroupTabs } from "./QuoteGroupTabs";
import { getQuoteStatsStatus } from "@mts/lib/quoteDashboardFilters";
import {
  buildCopiedDesignSet,
  buildCopiedLineItemPatch,
  buildExternalRelationshipCleanupRows,
  getMatchingCatalogCopyTargetIds,
  lineItemsHaveMatchingCatalogIdentity,
} from "@mts/lib/quoteDesignCopy";
import {
  applyQuoteDesignDiscount,
  QUOTE_DISCOUNT_PERCENTS,
  type QuoteDiscountPercent,
} from "@mts/lib/quoteDiscounts";
import {
  buildQuoteInstallerNotesMeta,
  calculateLineItemDesignTotal,
  calculateQuoteDesignSubtotal,
  getQuoteBuilderNote,
  parseQuoteMeta,
  shouldPersistQuoteDesignSubtotal,
} from "@mts/lib/quoteTotals";
import { isQuotePriceLocked } from "@mts/lib/quotePriceLock";
import {
  mutateQuoteV2Structure,
  priceQuoteV2,
  quoteV2DesignPatch,
  quoteV2LinePatch,
  quoteV2QuotePatch,
  type QuoteV2StructureOperation,
  type QuoteV2StructureResponse,
} from "@mts/lib/quoteV2ServerClient";
import {
  formatDimensions,
  formatDimensionsOrNull,
  type SalesQuote,
  type SalesQuoteLineItem,
  type SalesQuoteDesign,
} from "@mts/types/quote";

const STACKED_LINE_ITEM_META_KEY = "__stackedLineItemIds";

const STACK_DESIGN_FIELDS: {
  key: keyof SalesQuoteDesign;
  label: string;
  booleanLabel?: string;
}[] = [
  { key: "supplier", label: "Supplier" },
  { key: "material", label: "Material" },
  { key: "louver_size", label: "Louver" },
  { key: "tilt_type", label: "Tilt" },
  { key: "hinge_color", label: "Hinge" },
  { key: "panel_config", label: "Panels" },
  { key: "mount_type", label: "Mount" },
  { key: "shade_type", label: "Shade" },
  { key: "lift_system", label: "Lift" },
  { key: "valance", label: "Valance" },
  { key: "fabric", label: "Fabric" },
  { key: "motor_type", label: "Motor" },
  { key: "remote_type", label: "Remote" },
  { key: "hard_surface_install", label: "Hard install", booleanLabel: "Hard install" },
  { key: "ladder_over_15ft", label: "Ladder >15ft", booleanLabel: "Ladder >15ft" },
  { key: "requires_takedown", label: "Takedown", booleanLabel: "Takedown" },
  { key: "notes", label: "Notes" },
];

const STACK_OPTION_EXCLUDED_KEYS = new Set([
  "base_price",
  "surcharge_total",
  "pricing_method",
  "pricing_grid_key",
  "pricing_grid_width",
  "pricing_grid_height",
  "pricing_grid_price",
  "pricing_built_in_adjustment",
  "discount_source_price",
  "discount_amount",
  "manual_price_override",
]);

const V2_OPTIMISTIC_PRICE_KEYS = new Set([
  "authoritative_price_breakdown",
  "authoritative_cost_breakdown",
  "authoritative_once_total",
  "authoritative_v2_snapshot",
  "priced_selection_fingerprint",
  "priced_catalog_version",
  "base_price",
  "surcharge_total",
  "discount_amount",
]);

export function invalidateOptimisticV2Design(
  current: Partial<SalesQuoteDesign> | undefined,
  patch: Partial<SalesQuoteDesign>
): SalesQuoteDesign {
  // Supabase replaces a provided JSON column; mirror that exact behavior in
  // the optimistic row. Merging a deliberately clean product/program payload
  // back into the previous JSON resurrects hidden fabric, motor, and catalog
  // identities long enough for a fast follow-up edit to save them again.
  const options = patch.options_json !== undefined
    ? { ...(patch.options_json as Record<string, unknown>) }
    : { ...((current?.options_json as Record<string, unknown> | undefined) ?? {}) };
  for (const key of V2_OPTIMISTIC_PRICE_KEYS) delete options[key];
  return {
    ...(current ?? {}),
    ...patch,
    unit_price: 0,
    options_json: {
      ...options,
      authoritative_price_status: "stale",
      authoritative_price_error: "Repricing the latest selection…",
    },
  } as SalesQuoteDesign;
}

export class ProductTypeChangeRollbackError extends Error {
  readonly cleanupError: unknown;
  readonly rollbackError: unknown;

  constructor(
    lineItemId: string,
    previousProductType: string,
    cleanupError: unknown,
    rollbackError: unknown,
  ) {
    const describe = (error: unknown) => {
      if (error instanceof Error) return error.message;
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return error.message;
      }
      return String(error || "Unknown error");
    };
    super(
      `Design cleanup failed for line ${lineItemId}: ${describe(cleanupError)} ` +
        `Rollback to ${previousProductType} also failed: ${describe(rollbackError)}`,
    );
    this.name = "ProductTypeChangeRollbackError";
    this.cleanupError = cleanupError;
    this.rollbackError = rollbackError;
    this.cause = cleanupError;
  }
}

type ProductTypeChangeOperation = () => Promise<unknown | null>;

async function captureProductTypeChangeError(
  operation: ProductTypeChangeOperation,
): Promise<unknown | null> {
  try {
    return (await operation()) ?? null;
  } catch (error) {
    return error;
  }
}

/**
 * Supabase cannot make the line update and design deletion one browser-side
 * transaction. Compensate immediately if cleanup fails so the old designs are
 * never intentionally left attached to a different product category.
 */
export async function changeLineItemProductTypeWithRollback({
  lineItemId,
  previousProductType,
  nextProductType,
  updateProductType,
  deleteDesigns,
}: {
  lineItemId: string;
  previousProductType: string;
  nextProductType: string;
  updateProductType: (productType: string) => Promise<unknown | null>;
  deleteDesigns: ProductTypeChangeOperation;
}): Promise<void> {
  if (previousProductType === nextProductType) return;

  const updateError = await captureProductTypeChangeError(() =>
    updateProductType(nextProductType),
  );
  if (updateError) throw updateError;

  const cleanupError = await captureProductTypeChangeError(deleteDesigns);
  if (!cleanupError) return;

  const rollbackError = await captureProductTypeChangeError(() =>
    updateProductType(previousProductType),
  );
  if (rollbackError) {
    throw new ProductTypeChangeRollbackError(
      lineItemId,
      previousProductType,
      cleanupError,
      rollbackError,
    );
  }

  // Preserve the exact cleanup error for callers and telemetry when rollback
  // restored the prior category successfully.
  throw cleanupError;
}

const STACK_OPTION_LABELS: Record<string, string> = {
  catalog_program_id: "Program",
  cell_size: "Cell",
  color: "Color",
  control_side: "Control",
  discount_percent: "Discount",
  fabric_color_code: "Color code",
  fabric_color_collection: "Collection",
  fabric_color_name: "Color",
  fabric_color_type: "Fabric type",
  fabric_group: "Fabric group",
  cord_loop_release: "Cord loop",
  hem_bar: "Hem bar",
  light_guard_rails: "Light guard",
  premium_hardware: "Premium hardware",
  premium_hardware_color: "Premium color",
  product_color_code: "Color code",
  product_color_collection: "Collection",
  product_color_name: "Color",
  product_color_type: "Color type",
  product_line: "Line",
  roman_fabric_category: "Fabric category",
  roll_type: "Roll",
  stack_option: "Stack",
};

const STACKED_PRODUCT_TYPE_CLASSES: Record<string, string> = {
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

function getStackedLineItemIds(source: unknown) {
  const ids = parseQuoteMeta(source)[STACKED_LINE_ITEM_META_KEY];
  if (!Array.isArray(ids)) return [];

  return ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function sortLineItemIdsByQuoteOrder(ids: string[], lineItems: Pick<SalesQuoteLineItem, "id">[]) {
  const order = new Map(lineItems.map((item, index) => [item.id, index]));

  return Array.from(new Set(ids))
    .filter((id) => order.has(id))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function normalizeLineItemQuantity(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

type LineNumberRange = {
  start: number;
  end: number;
  label: string;
  numbers: number[];
};

function buildLineNumberRanges(lineItems: Pick<SalesQuoteLineItem, "id" | "quantity">[]) {
  let nextNumber = 1;
  const ranges = new Map<string, LineNumberRange>();

  lineItems.forEach((item) => {
    const quantity = normalizeLineItemQuantity(item.quantity);
    const start = nextNumber;
    const end = nextNumber + quantity - 1;
    const numbers = Array.from({ length: quantity }, (_, index) => start + index);

    ranges.set(item.id, {
      start,
      end,
      label: start === end ? `#${start}` : `#${start}-${end}`,
      numbers,
    });
    nextNumber = end + 1;
  });

  return ranges;
}

function appendLineNumbers(
  numbers: Map<string, number[]>,
  key: string,
  range: LineNumberRange | undefined
) {
  if (!range) return;
  const existing = numbers.get(key) ?? [];
  numbers.set(key, [...existing, ...range.numbers]);
}

function formatStackMoney(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatCustomerPhone(phone: string | null | undefined) {
  const value = phone?.trim();
  if (!value) return "No phone number";

  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return value;
}

function formatStackKey(key: string) {
  return (
    STACK_OPTION_LABELS[key] ??
    key
      .replace(/^json:/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatStackValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "" || value === false) return null;
  if (value === true) return "Yes";
  if (Array.isArray(value)) {
    const values = value.map(formatStackValue).filter((entry): entry is string => Boolean(entry));
    return values.length ? values.join(", ") : null;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const formatted = formatStackValue(entryValue);
        return formatted ? `${formatStackKey(key)} ${formatted}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(", ") : null;
  }
  return String(value);
}

function getStackedProductTypeClass(productType: string) {
  return STACKED_PRODUCT_TYPE_CLASSES[productType] ?? "quote-stacked-product--default";
}

function buildStackedDesignSummary(designs: SalesQuoteDesign[]) {
  if (designs.length === 0) return "No saved design details";

  return designs
    .map((design) => {
      const detailParts: string[] = [];

      STACK_DESIGN_FIELDS.forEach(({ key, label, booleanLabel }) => {
        const formatted = formatStackValue(design[key]);
        if (!formatted) return;
        detailParts.push(formatted === "Yes" && booleanLabel ? booleanLabel : `${label} ${formatted}`);
      });

      Object.entries((design.options_json as Record<string, unknown> | undefined) ?? {}).forEach(
        ([key, value]) => {
          if (STACK_OPTION_EXCLUDED_KEYS.has(key)) return;
          const formatted = formatStackValue(value);
          if (!formatted) return;
          detailParts.push(`${formatStackKey(key)} ${key === "discount_percent" ? `${formatted}%` : formatted}`);
        }
      );

      const summary = detailParts.length ? detailParts.join(" | ") : "No option details";
      return designs.length > 1 ? `${design.variant}: ${summary}` : summary;
    })
    .join("  /  ");
}

function StackedLineItemRow({
  item,
  lineNumberLabel,
  designs,
  authoritativeV2,
  onUnstack,
}: {
  item: SalesQuoteLineItem;
  lineNumberLabel: string;
  designs: SalesQuoteDesign[];
  authoritativeV2: boolean;
  onUnstack: () => void;
}) {
  const details = buildStackedDesignSummary(designs);
  const dimensions = formatDimensionsOrNull(item) ?? "Size needed";
  const selectedDesign = resolveSelectedQuoteDesign(designs);
  const manufacturerStamp = resolveManufacturerStamp(selectedDesign);
  const total = calculateLineItemDesignTotal(item, designs, {
    mode: authoritativeV2 ? "authoritative_v2" : "legacy",
  });
  const title = `Click to unstack line ${lineNumberLabel}. ${item.room_name}. ${dimensions}. ${item.product_type}. ${details}. ${formatStackMoney(total)}.`;

  return (
    <button
      type="button"
      onClick={onUnstack}
      title={title}
      aria-label={`Unstack line ${lineNumberLabel}, ${item.room_name}`}
      className="grid min-h-9 w-full grid-cols-[3rem_minmax(7rem,0.8fr)_7.5rem_8rem_minmax(0,2.7fr)_6.5rem] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left text-[10px] leading-none text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="inline-flex h-6 items-center justify-center rounded-md bg-slate-950 font-mono text-[11px] font-black text-white">
        {lineNumberLabel}
      </span>
      <span className="truncate text-xs font-black text-slate-950">{item.room_name}</span>
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-[11px] font-bold text-slate-700">
          {dimensions}
        </span>
        {manufacturerStamp && (
          <span
            aria-label={`Manufacturer: ${manufacturerStamp.label}`}
            className={cn(
              "quote-line-manufacturer-stamp quote-line-manufacturer-stamp--stacked",
              `quote-line-manufacturer-stamp--${manufacturerStamp.tone}`,
            )}
            data-manufacturer={manufacturerStamp.label}
            data-testid="stacked-manufacturer-stamp"
            title={`Manufacturer: ${manufacturerStamp.label}`}
          >
            <span className="quote-line-manufacturer-stamp-caption">MFR</span>
            <span className="quote-line-manufacturer-stamp-name">
              {manufacturerStamp.label}
            </span>
          </span>
        )}
      </span>
      <span className={cn("quote-stacked-product-badge", getStackedProductTypeClass(item.product_type))}>
        <span className="quote-stacked-product-badge__label">
          {item.product_type}
          {item.quantity > 1 ? ` x${item.quantity}` : ""}
        </span>
      </span>
      <span className="min-w-0 overflow-hidden whitespace-nowrap text-[10px] text-slate-600">
        {details}
      </span>
      <span className="justify-self-end font-mono text-xs font-black text-slate-950">
        {formatStackMoney(total)}
      </span>
    </button>
  );
}

export function QuoteBuilder() {
  const {
    database: supabase,
    isolated,
    authoritativeV2,
    serverOwnedV2,
    preferStoredTotal,
  } = useQuoteBuilderDatabase();
  const {
    activeQuoteId,
    selectedRoom: _selectedRoom,
    showMeasurementGrid,
    pendingWidth,
    pendingHeight,
    measurementStep,
    selectProduct,
    selectRoom: _selectRoom,
    closeMeasurementGrid,
    setWidthWhole,
    setWidthFraction,
    setHeightWhole,
    setHeightFraction,
    resetMeasurement,
    copyMode,
    setCopyMode,
    copySourceItemId,
    setCopySource,
    clearCopyTargets,
    setActiveQuote,
    setActiveTab,
  } = useQuoteBuilderStore();

  const queryClient = useQueryClient();
  const quoteQueryKey = queryKeys.salesQuotes.detail(activeQuoteId || "");
  const lineItemsQueryKey = [...quoteQueryKey, "line-items"] as const;
  const designsQueryKey = [...quoteQueryKey, "designs"] as const;
  const v2MutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Dedicated full-screen builder: hide the CRM chrome while a quote is open.
  // The class is removed on unmount (e.g. when the X switches back to the
  // dashboard, or Contract opens), which restores the CRM nav.
  useEffect(() => {
    if (!activeQuoteId) return;
    document.body.classList.add("qb-fullscreen");
    return () => document.body.classList.remove("qb-fullscreen");
  }, [activeQuoteId]);

  const [editingName, setEditingName] = useState(false);
  const [measuringItemId, setMeasuringItemId] = useState<string | null>(null);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showPaymentLinkDialog, setShowPaymentLinkDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState<"deposit" | "balance" | null>(null);
  const [copiedCopyTargets, setCopiedCopyTargets] = useState<string[]>([]);
  const [copyAllTargetsBySource, setCopyAllTargetsBySource] = useState<Record<string, string[]>>({});
  const [stackedLineItemIds, setStackedLineItemIds] = useState<string[]>([]);
  const [quoteNoteDraft, setQuoteNoteDraft] = useState("");
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<QuoteLabCatalogProduct[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null);
  const [selectedCatalogProductId, setSelectedCatalogProductId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsCatalogLoading(true);
    loadQuoteBuilderCatalog()
      .then((catalog) => {
        if (active) setCatalogProducts(catalog.products);
      })
      .catch((error) => {
        if (!active) return;
        setCatalogProducts([]);
        toast.error(
          error instanceof Error
            ? error.message
            : "Manufacturer catalog could not be loaded",
        );
      })
      .finally(() => {
        if (active) setIsCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedCatalogProduct =
    catalogProducts.find((product) => product.id === selectedCatalogProductId) ??
    null;

  const syncQuoteTotal = async (options: { allowZero?: boolean } = {}) => {
    if (!activeQuoteId) return;
    if (serverOwnedV2) {
      throw new Error(
        "Quote V2 totals are server-owned and cannot be written by the browser.",
      );
    }

    const { data: latestLineItems, error: lineItemsError } = await (supabase as any)
      .from("sales_quote_line_items")
      .select("id, quantity, selected_design_id")
      .eq("quote_id", activeQuoteId);
    if (lineItemsError) throw lineItemsError;

    const latestLineItemIds = (latestLineItems ?? []).map((item: SalesQuoteLineItem) => item.id);
    let latestDesigns: Pick<
      SalesQuoteDesign,
      "id" | "line_item_id" | "variant" | "unit_price" | "options_json"
    >[] = [];

    if (latestLineItemIds.length > 0) {
      const { data: designRows, error: designsError } = await (supabase as any)
        .from("sales_quote_designs")
        .select("id, line_item_id, variant, unit_price, options_json")
        .in("line_item_id", latestLineItemIds);
      if (designsError) throw designsError;
      latestDesigns = designRows ?? [];
    }

    const projectedDesigns = projectPersistedDesignSelections(
      latestDesigns as SalesQuoteDesign[],
      latestLineItems ?? [],
    );
    const totalMode =
      authoritativeV2 ||
      hasCompletePersistedDesignSelections(
        latestLineItems ?? [],
        latestDesigns as SalesQuoteDesign[],
      )
        ? "authoritative_v2"
        : "legacy";
    const total = calculateQuoteDesignSubtotal(latestLineItems ?? [], projectedDesigns, {
      mode: totalMode,
    });
    if (!shouldPersistQuoteDesignSubtotal(projectedDesigns, { ...options, mode: totalMode })) return;

    const { error: quoteError } = await (supabase as any)
      .from("sales_quotes")
      .update({ total_amount: total })
      .eq("id", activeQuoteId);
    if (quoteError) throw quoteError;
  };

  // Fetch active quote
  const {
    data: quote,
    isPending: isQuoteLoading,
    isError: isQuoteLoadError,
  } = useQuery({
    queryKey: quoteQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .select("*")
        .eq("id", activeQuoteId!)
        .single();
      if (error) throw error;
      return data as SalesQuote;
    },
    enabled: !!activeQuoteId,
  });

  useEffect(() => {
    if (!quote) return;

    setQuoteNoteDraft(getQuoteBuilderNote(quote));
    setStackedLineItemIds(getStackedLineItemIds(quote));
  }, [quote]);

  // Fetch line items
  const {
    data: lineItems = [],
    isPending: areLineItemsLoading,
    isError: isLineItemsLoadError,
  } = useQuery({
    queryKey: lineItemsQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .eq("quote_id", activeQuoteId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as SalesQuoteLineItem[];
    },
    enabled: !!activeQuoteId && !!quote,
  });

  // Fetch all designs for this quote's line items
  const lineItemIds = lineItems.map((i) => i.id);
  const quoteDesignMutationKey = ["sales-quote-designs", activeQuoteId || ""];
  const isActiveQuotePriceLocked = isQuotePriceLocked(quote);
  const {
    data: designs = [],
    isPending: areDesignsLoading,
    isError: isDesignsLoadError,
  } = useQuery({
    queryKey: designsQueryKey,
    queryFn: async () => {
      if (lineItemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("sales_quote_designs")
        .select("*")
        .in("line_item_id", lineItemIds);
      if (error) throw error;
      const rows = (data || []) as SalesQuoteDesign[];
      return projectPersistedDesignSelections(rows, lineItems);
    },
    enabled: lineItemIds.length > 0,
  });

  const refreshServerOwnedV2Rows = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: quoteQueryKey }),
      queryClient.invalidateQueries({ queryKey: lineItemsQueryKey }),
      queryClient.invalidateQueries({ queryKey: designsQueryKey }),
    ]);
  };

  const updateServerOwnedV2QuoteCache = (
    response:
      | QuoteV2StructureResponse
      | Awaited<ReturnType<typeof priceQuoteV2>>,
  ) => {
    queryClient.setQueryData<SalesQuote>(quoteQueryKey, (current) => {
      if (!current) return current;
      if ("quoteTotal" in response) {
        return {
          ...current,
          quote_v2_revision: response.revision,
          quote_v2_status: response.quoteStatus as SalesQuote["quote_v2_status"],
          total_amount: response.quoteTotal,
        };
      }
      return {
        ...current,
        quote_v2_revision: response.revision,
        quote_v2_status: response.quoteV2Status,
        total_amount: 0,
        product_cost: 0,
        profit_amount: 0,
      };
    });
  };

  /**
   * Serialize edits because every authoritative structural request uses
   * optimistic concurrency. The server invalidates all quote money, then the
   * existing price endpoint reconstructs the full quote from saved selections.
   */
  const mutateAndRepriceServerOwnedV2 = (
    operations: readonly QuoteV2StructureOperation[],
    preferredLineItemId?: string,
  ): Promise<void> => {
    const execute = async () => {
      if (!activeQuoteId) throw new Error("No active quote is open.");
      const cachedQuote =
        queryClient.getQueryData<SalesQuote>(quoteQueryKey) ?? quote;
      if (!cachedQuote?.quote_v2_backend) {
        throw new Error(
          "Historical quote conversion is required before this quote can be changed in V2.",
        );
      }
      const expectedRevision = Number(cachedQuote.quote_v2_revision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error(
          "This Quote V2 draft has no valid revision. Reload it before editing.",
        );
      }

      let structure: QuoteV2StructureResponse | null = null;
      try {
        structure = await mutateQuoteV2Structure(
          supabase,
          activeQuoteId,
          expectedRevision,
          operations,
        );
        updateServerOwnedV2QuoteCache(structure);

        if (structure.lineCount > 0) {
          const preferredDesignId = preferredLineItemId
            ? structure.selectedDesigns[preferredLineItemId]
            : null;
          const selectedEntry =
            preferredLineItemId && preferredDesignId
              ? ([preferredLineItemId, preferredDesignId] as const)
              : Object.entries(structure.selectedDesigns).find(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string" && entry[1].length > 0,
                );
          if (!selectedEntry) {
            throw new Error(
              "Every Quote V2 line needs one selected design before pricing.",
            );
          }

          const priced = await priceQuoteV2(supabase, activeQuoteId, {
            lineItemId: selectedEntry[0],
            designId: selectedEntry[1],
            expectedRevision: structure.revision,
          });
          updateServerOwnedV2QuoteCache(priced);
        }
      } finally {
        if (structure) {
          await refreshServerOwnedV2Rows();
        }
      }
    };

    const queued = v2MutationQueueRef.current.then(execute, execute);
    v2MutationQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };

  // Update customer info
  const updateQuote = useMutation({
    mutationFn: async (updates: Partial<SalesQuote>) => {
      if (serverOwnedV2) {
        const patch = quoteV2QuotePatch(
          updates as unknown as Record<string, unknown>,
        );
        if (Object.keys(patch).length === 0) {
          throw new Error("That Quote V2 field is not structurally editable.");
        }
        await mutateAndRepriceServerOwnedV2([
          { type: "quote.update", patch },
        ]);
        return;
      }
      const { error } = await (supabase as any)
        .from("sales_quotes")
        .update(updates)
        .eq("id", activeQuoteId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Quote details could not be saved",
      );
    },
  });

  const saveQuoteBuilderNote = () => {
    if (!quote) return;
    const currentNote = getQuoteBuilderNote(quote);
    if (quoteNoteDraft === currentNote) return;

    updateQuote.mutate({
      installer_notes: buildQuoteInstallerNotesMeta(quote, {
        __quoteBuilderNote: quoteNoteDraft,
        [STACKED_LINE_ITEM_META_KEY]: stackedLineItemIds,
      }),
    });
  };

  const saveStackedLineItemIds = (nextIds: string[]) => {
    if (!quote) return;

    const orderedIds = sortLineItemIdsByQuoteOrder(nextIds, lineItems);
    setStackedLineItemIds(orderedIds);
    updateQuote.mutate({
      installer_notes: buildQuoteInstallerNotesMeta(quote, {
        __quoteBuilderNote: quoteNoteDraft,
        [STACKED_LINE_ITEM_META_KEY]: orderedIds,
      }),
    });
  };

  useEffect(() => {
    if (!quote || stackedLineItemIds.length === 0) return;

    const orderedIds = sortLineItemIdsByQuoteOrder(stackedLineItemIds, lineItems);
    const changed =
      orderedIds.length !== stackedLineItemIds.length ||
      orderedIds.some((id, index) => id !== stackedLineItemIds[index]);

    if (changed) saveStackedLineItemIds(orderedIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems]);

  // Add line item (no measurements required initially)
  const addLineItem = useMutation({
    mutationFn: async (item: {
      room_name: string;
      product_type: string;
      catalog_product: QuoteLabCatalogProduct;
      width_whole?: number;
      width_fraction?: string;
      height_whole?: number;
      height_fraction?: string;
    }) => {
      if (authoritativeV2 && lineItems.length >= QUOTE_LAB_MAX_LINES) {
        throw new Error(`A V2 quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
      }
      const catalogSelectionPatch = buildCatalogSelectionPatch(
        {},
        item.catalog_product,
      );
      if (serverOwnedV2) {
        const lineItemId = crypto.randomUUID();
        const designId = crypto.randomUUID();
        await mutateAndRepriceServerOwnedV2(
          [
            {
              type: "line.create",
              lineItemId,
              patch: {
                roomName: item.room_name,
                productType: item.product_type,
                widthWhole: item.width_whole ?? 0,
                widthFraction: item.width_fraction ?? "0",
                heightWhole: item.height_whole ?? 0,
                heightFraction: item.height_fraction ?? "0",
                quantity: 1,
                sortOrder: lineItems.length,
              },
            },
            {
              type: "design.upsert",
              lineItemId,
              designId,
              variant: "A",
              selectDesign: true,
              patch: quoteV2DesignPatch({
                product_type: item.product_type,
                ...catalogSelectionPatch,
              }),
            },
          ],
          lineItemId,
        );
        return;
      }
      const lineItemId = crypto.randomUUID();
      const { error } = await (supabase as any).from("sales_quote_line_items").insert({
        id: lineItemId,
        quote_id: activeQuoteId!,
        room_name: item.room_name,
        product_type: item.product_type,
        width_whole: item.width_whole ?? 0,
        width_fraction: item.width_fraction ?? "0",
        height_whole: item.height_whole ?? 0,
        height_fraction: item.height_fraction ?? "0",
        quantity: 1,
        sort_order: lineItems.length,
      });
      if (error) throw error;
      const designId = crypto.randomUUID();
      const { error: designError } = await (supabase as any)
        .from("sales_quote_designs")
        .upsert(
          {
            id: designId,
            line_item_id: lineItemId,
            variant: "A",
            product_type: item.product_type,
            ...catalogSelectionPatch,
          },
          { onConflict: "line_item_id,variant" },
        );
      if (designError) {
        await (supabase as any)
          .from("sales_quote_line_items")
          .delete()
          .eq("id", lineItemId);
        throw designError;
      }
      const { error: selectionError } = await (supabase as any)
        .from("sales_quote_line_items")
        .update({ selected_design_id: designId })
        .eq("id", lineItemId);
      if (selectionError) {
        await (supabase as any)
          .from("sales_quote_line_items")
          .delete()
          .eq("id", lineItemId);
        throw selectionError;
      }
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal({ allowZero: true });
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Line item could not be added");
    },
  });

  // Update line item measurements
  const updateLineItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<SalesQuoteLineItem>) => {
      if (serverOwnedV2) {
        const patch = quoteV2LinePatch(updates);
        if (Object.keys(patch).length === 0) {
          throw new Error("That Quote V2 line field is not structurally editable.");
        }
        await mutateAndRepriceServerOwnedV2(
          [{ type: "line.update", lineItemId: id, patch }],
          id,
        );
        return;
      }
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Line item could not be updated",
      );
    },
  });

  const changeLineItemProductType = useMutation({
    mutationFn: async ({
      id,
      productType,
      previousProductType,
    }: {
      id: string;
      productType: string;
      previousProductType: string;
    }) => {
      if (serverOwnedV2) {
        if (productType === previousProductType) return;
        const designId = crypto.randomUUID();
        await mutateAndRepriceServerOwnedV2(
          [
            {
              type: "line.update",
              lineItemId: id,
              patch: { productType },
            },
            {
              type: "design.upsert",
              lineItemId: id,
              designId,
              variant: "A",
              selectDesign: true,
              patch: { productType },
            },
          ],
          id,
        );
        return;
      }
      await changeLineItemProductTypeWithRollback({
        lineItemId: id,
        previousProductType,
        nextProductType: productType,
        updateProductType: async (nextProductType) => {
          const { error } = await (supabase as any)
            .from("sales_quote_line_items")
            .update({ product_type: nextProductType })
            .eq("id", id);
          return error;
        },
        deleteDesigns: async () => {
          const { error } = await (supabase as any)
            .from("sales_quote_designs")
            .delete()
            .eq("line_item_id", id);
          return error;
        },
      });
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
      toast.success("Product type changed. Design details cleared for the new quote.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Product type could not be changed");
    },
  });

  // Delete line item
  const deleteLineItem = useMutation({
    mutationFn: async (id: string) => {
      if (serverOwnedV2) {
        await mutateAndRepriceServerOwnedV2([
          { type: "line.delete", lineItemId: id },
        ]);
        return;
      }
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Line item could not be deleted",
      );
    },
  });

  const upsertCopiedDesignSet = async (
    sourceDesigns: SalesQuoteDesign[],
    targetLineItemId: string
  ) => {
    const copied = buildCopiedDesignSet(sourceDesigns, targetLineItemId, {
      invalidateAuthoritativePrice: authoritativeV2,
    });
    if (copied.rows.length === 0) return copied;

    const { error } = await (supabase as any)
      .from("sales_quote_designs")
      .upsert(copied.rows, { onConflict: "line_item_id,variant" });
    if (error) throw error;

    // The isolated V2 database records the selected alternative when it sees a
    // single-row upsert. Re-upserting just the source selection also remains a
    // harmless normal upsert for the legacy Supabase adapter.
    if (copied.rows.length > 1 && copied.selectedVariant) {
      const selectedRow = copied.rows.find(
        (row) => row.variant === copied.selectedVariant
      );
      if (selectedRow) {
        const { error: selectionError } = await (supabase as any)
          .from("sales_quote_designs")
          .upsert(selectedRow, { onConflict: "line_item_id,variant" });
        if (selectionError) throw selectionError;
      }
    }

    return copied;
  };

  // Copy line item
  const copyLineItem = useMutation({
    mutationFn: async (id: string) => {
      if (authoritativeV2 && lineItems.length >= QUOTE_LAB_MAX_LINES) {
        throw new Error(`A V2 quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
      }
      if (serverOwnedV2) {
        const targetLineItemId = crypto.randomUUID();
        await mutateAndRepriceServerOwnedV2(
          [
            {
              type: "line.copy",
              sourceLineItemId: id,
              targetLineItemId,
              sortOrder: lineItems.length,
            },
          ],
          targetLineItemId,
        );
        return targetLineItemId;
      }
      const source = lineItems.find((i) => i.id === id);
      if (!source) return;
      const sourceDesigns = designs.filter((design) => design.line_item_id === id);
      let copiedLineId: string | null = null;

      try {
        const { data: copiedLine, error } = await (supabase as any)
          .from("sales_quote_line_items")
          .insert({
            quote_id: activeQuoteId!,
            room_name: source.room_name,
            product_type: source.product_type,
            width_whole: source.width_whole,
            width_fraction: source.width_fraction,
            height_whole: source.height_whole,
            height_fraction: source.height_fraction,
            quantity: source.quantity,
            sort_order: lineItems.length,
          })
          .select("*")
          .single();
        if (error) throw error;
        if (!copiedLine?.id) throw new Error("The copied line item did not return an ID.");
        copiedLineId = copiedLine.id;

        await upsertCopiedDesignSet(sourceDesigns, copiedLine.id);
        return copiedLine.id;
      } catch (error) {
        if (copiedLineId) {
          await (supabase as any)
            .from("sales_quote_line_items")
            .delete()
            .eq("id", copiedLineId);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal({ allowZero: true });
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
      toast.success("Line item copied");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Line item could not be copied");
    },
  });

  // Fresh start - clear all line items
  const freshStart = useMutation({
    mutationFn: async () => {
      if (serverOwnedV2) {
        await mutateAndRepriceServerOwnedV2([{ type: "lines.clear" }]);
        return;
      }
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .delete()
        .eq("quote_id", activeQuoteId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
      selectProduct(null);
      setSelectedManufacturer(null);
      setSelectedCatalogProductId(null);
      toast.success("All line items cleared");
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Line items could not be cleared",
      );
    },
  });

  // Upsert design
  const upsertDesign = useMutation({
    mutationKey: quoteDesignMutationKey,
    mutationFn: async (
      design: Partial<SalesQuoteDesign> & { line_item_id: string; variant: string }
    ) => {
      if (serverOwnedV2) {
        const latestDesigns =
          queryClient.getQueryData<SalesQuoteDesign[]>(designsQueryKey) ??
          designs;
        const existing = latestDesigns.find(
          (row) =>
            row.line_item_id === design.line_item_id &&
            row.variant === design.variant,
        );
        const designId = existing?.id ?? crypto.randomUUID();
        await mutateAndRepriceServerOwnedV2(
          [
            {
              type: "design.upsert",
              lineItemId: design.line_item_id,
              designId,
              variant: design.variant,
              selectDesign: true,
              patch: quoteV2DesignPatch(design),
            },
          ],
          design.line_item_id,
        );
        return;
      }
      const { data: savedDesign, error } = await (supabase as any)
        .from("sales_quote_designs")
        .upsert(design, { onConflict: "line_item_id,variant" })
        .select("id")
        .single();
      if (error) throw error;
      if (!savedDesign?.id) throw new Error("Saved design selection did not return an ID.");
      const { error: selectionError } = await (supabase as any)
        .from("sales_quote_line_items")
        .update({ selected_design_id: savedDesign.id })
        .eq("id", design.line_item_id);
      if (selectionError) throw selectionError;
      return savedDesign.id as string;
    },
    onMutate: async (design) => {
      await queryClient.cancelQueries({ queryKey: designsQueryKey });
      const previousDesigns = queryClient.getQueryData<SalesQuoteDesign[]>(designsQueryKey);

      queryClient.setQueryData<SalesQuoteDesign[]>(designsQueryKey, (current = []) => {
        const index = current.findIndex(
          (row) => row.line_item_id === design.line_item_id && row.variant === design.variant
        );

        const markSelected = (rows: SalesQuoteDesign[]) =>
          rows.map((row) =>
            row.line_item_id === design.line_item_id
              ? {
                  ...row,
                  [QUOTE_V2_SELECTED_DESIGN_MARKER]:
                    row.variant === design.variant,
                }
              : row,
          );

        if (index === -1) {
          return markSelected([
            ...current,
            authoritativeV2
              ? invalidateOptimisticV2Design(undefined, design)
              : design as SalesQuoteDesign,
          ]);
        }

        const next = [...current];
        next[index] = authoritativeV2
          ? invalidateOptimisticV2Design(next[index], design)
          : { ...next[index], ...design };
        return markSelected(next);
      });

      return { previousDesigns };
    },
    onError: (_error, _design, context) => {
      if (context?.previousDesigns) {
        queryClient.setQueryData(designsQueryKey, context.previousDesigns);
      }
      toast.error(
        _error instanceof Error ? _error.message : "Design could not be saved",
      );
    },
    onSuccess: async () => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
    },
  });

  // Copy designs to targets
  const copyDesigns = useMutation({
    mutationKey: quoteDesignMutationKey,
    mutationFn: async ({
      sourceItemId,
      mode,
      targetIds = [],
    }: {
      sourceItemId: string;
      mode: "all" | "some";
      targetIds?: string[];
    }) => {
      const sourceItem = lineItems.find((item) => item.id === sourceItemId);
      if (!sourceItem) throw new Error("Copy source line item was not found.");

      const sourceDesigns = designs.filter((d) => d.line_item_id === sourceItemId);
      if (sourceDesigns.length === 0) throw new Error("No saved design specs found to copy.");

      const targets = getMatchingCatalogCopyTargetIds(
        sourceItem,
        lineItems,
        designs,
        mode === "all" ? undefined : targetIds
      );

      if (targets.length === 0) throw new Error("No matching line items selected to copy to.");

      if (serverOwnedV2) {
        const linePatch = quoteV2LinePatch(
          buildCopiedLineItemPatch(sourceItem),
        );
        const operations = targets.flatMap<QuoteV2StructureOperation>(
          (targetLineItemId) => [
            {
              type: "line.update",
              lineItemId: targetLineItemId,
              patch: linePatch,
            },
            {
              type: "design.copySet",
              sourceLineItemId: sourceItemId,
              targetLineItemId,
            },
          ],
        );
        await mutateAndRepriceServerOwnedV2(operations, targets[0]);
        return targets;
      }

      const sourceVariants = sourceDesigns.map((sd) => sd.variant);
      const sourceVariantFilter = `(${sourceVariants.map((variant) => `"${variant}"`).join(",")})`;

      const relationshipCleanupRows = authoritativeV2
        ? buildExternalRelationshipCleanupRows(designs, targets)
        : [];
      if (relationshipCleanupRows.length > 0) {
        const { error: relationshipCleanupError } = await (supabase as any)
          .from("sales_quote_designs")
          .upsert(relationshipCleanupRows, {
            onConflict: "line_item_id,variant",
          });
        if (relationshipCleanupError) throw relationshipCleanupError;
      }

      for (const targetId of targets) {
        const { error: lineItemError } = await (supabase as any)
          .from("sales_quote_line_items")
          .update(buildCopiedLineItemPatch(sourceItem))
          .eq("id", targetId);
        if (lineItemError) throw lineItemError;

        await upsertCopiedDesignSet(sourceDesigns, targetId);

        const { error: staleVariantError } = await (supabase as any)
          .from("sales_quote_designs")
          .delete()
          .eq("line_item_id", targetId)
          .not("variant", "in", sourceVariantFilter);
        if (staleVariantError) throw staleVariantError;
      }

      return targets;
    },
    onSuccess: async (copiedTargetIds, variables) => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: lineItemsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
      if (variables.mode === "all") {
        clearCopyTargets();
        setCopiedCopyTargets([]);
        setCopyAllTargetsBySource((current) => ({
          ...current,
          [variables.sourceItemId]: copiedTargetIds,
        }));
        if (stackedLineItemIds.includes(variables.sourceItemId)) {
          saveStackedLineItemIds([
            ...stackedLineItemIds,
            variables.sourceItemId,
            ...copiedTargetIds,
          ]);
        }
      } else {
        setCopiedCopyTargets((current) =>
          Array.from(new Set([...current, ...copiedTargetIds]))
        );
      }
      const targetCount = copiedTargetIds.length;
      toast.success(
        `Design specs copied to ${targetCount} line item${targetCount === 1 ? "" : "s"}`
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Design specs could not be copied");
    },
  });

  const applyDiscount = useMutation({
    mutationKey: quoteDesignMutationKey,
    mutationFn: async ({
      percent,
      lineItemIds: targetLineItemIds,
    }: {
      percent: QuoteDiscountPercent;
      lineItemIds: string[];
    }) => {
      const targetIds = new Set(targetLineItemIds);
      const targetDesigns = designs.filter((design) => targetIds.has(design.line_item_id));
      if (targetDesigns.length === 0) {
        throw new Error("No saved line item designs found for that discount.");
      }

      const discountedRows = targetDesigns.map((design) =>
        applyQuoteDesignDiscount(design, percent)
      );

      if (serverOwnedV2) {
        const selectedByLine = new Map(
          lineItems.map((line) => [line.id, line.selected_design_id ?? null]),
        );
        const operations = targetDesigns.map<QuoteV2StructureOperation>(
          (design, index) => ({
            type: "design.upsert",
            lineItemId: design.line_item_id,
            designId: design.id,
            variant: design.variant,
            selectDesign:
              selectedByLine.get(design.line_item_id) === design.id,
            patch: quoteV2DesignPatch(discountedRows[index]),
          }),
        );
        await mutateAndRepriceServerOwnedV2(
          operations,
          targetDesigns[0]?.line_item_id,
        );
        return {
          count: targetDesigns.length,
          rows: discountedRows,
        };
      }

      const { error } = await (supabase as any).from("sales_quote_designs").upsert(discountedRows, {
        onConflict: "line_item_id,variant",
      });
      if (error) throw error;

      return {
        count: targetDesigns.length,
        rows: discountedRows,
      };
    },
    onMutate: async ({ percent, lineItemIds: targetLineItemIds }) => {
      await queryClient.cancelQueries({ queryKey: designsQueryKey });
      const previousDesigns = queryClient.getQueryData<SalesQuoteDesign[]>(designsQueryKey);
      if (serverOwnedV2) {
        return { previousDesigns };
      }
      const targetIds = new Set(targetLineItemIds);

      queryClient.setQueryData<SalesQuoteDesign[]>(designsQueryKey, (current = []) =>
        current.map((design) =>
          targetIds.has(design.line_item_id)
            ? { ...design, ...applyQuoteDesignDiscount(design, percent) }
            : design
        )
      );

      return { previousDesigns };
    },
    onError: (error, _variables, context) => {
      if (context?.previousDesigns) {
        queryClient.setQueryData(designsQueryKey, context.previousDesigns);
      }
      toast.error(error instanceof Error ? error.message : "Discount could not be applied");
    },
    onSuccess: async (result, variables) => {
      if (!serverOwnedV2) {
        await syncQuoteTotal();
      }
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: quoteQueryKey,
      });
      toast.success(
        `${variables.percent}% discount applied to ${result.count} design${
          result.count === 1 ? "" : "s"
        }`
      );
    },
  });

  // Handle room selection — immediately add line item
  const handleManufacturerSelect = (manufacturer: string | null) => {
    setSelectedManufacturer(manufacturer);
    setSelectedCatalogProductId(null);
    selectProduct(null);
  };

  const handleCatalogProductSelect = (productId: string | null) => {
    const product =
      catalogProducts.find((candidate) => candidate.id === productId) ?? null;
    setSelectedCatalogProductId(product?.id ?? null);
    selectProduct(product?.productType ?? null);
  };

  const handleRoomSelect = (room: string) => {
    if (!selectedManufacturer || !selectedCatalogProduct) {
      toast.error("Select a manufacturer and exact product first");
      return;
    }
    if (authoritativeV2 && lineItems.length >= QUOTE_LAB_MAX_LINES) {
      toast.error(`A V2 quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
      return;
    }
    addLineItem.mutate({
      room_name: room,
      product_type: selectedCatalogProduct.productType,
      catalog_product: selectedCatalogProduct,
    });
  };

  // Open measurement grid for a specific line item
  const handleOpenMeasurement = (itemId: string) => {
    setMeasuringItemId(itemId);
    useQuoteBuilderStore.getState().openMeasurementGrid();
    useQuoteBuilderStore.setState({ measurementStep: "width_whole" });
  };

  // When height fraction is selected, save measurements to the line item
  const handleHeightFraction = (f: string) => {
    setHeightFraction(f);
    if (measuringItemId && pendingWidth) {
      const heightWhole = useQuoteBuilderStore.getState().pendingHeight?.whole || 0;
      updateLineItem.mutate({
        id: measuringItemId,
        width_whole: pendingWidth.whole,
        width_fraction: pendingWidth.fraction,
        height_whole: heightWhole,
        height_fraction: f,
      });
      setMeasuringItemId(null);
      resetMeasurement();
    }
  };

  const handleDirectMeasurements = (
    width: { whole: number; fraction: string },
    height: { whole: number; fraction: string },
  ) => {
    if (!measuringItemId) return;
    updateLineItem.mutate({
      id: measuringItemId,
      width_whole: width.whole,
      width_fraction: width.fraction,
      height_whole: height.whole,
      height_fraction: height.fraction,
    });
    setMeasuringItemId(null);
    resetMeasurement();
  };

  const handleCopyAll = (sourceId: string) => {
    const sourceItem = lineItems.find((item) => item.id === sourceId);
    if (!sourceItem) return;

    const matchingTargetCount = getMatchingCatalogCopyTargetIds(
      sourceItem,
      lineItems,
      designs,
    ).length;
    if (matchingTargetCount === 0) {
      toast.error("No other line uses this exact manufacturer and product.");
      return;
    }

    setCopySource(sourceId);
    setCopyMode("all");
    setCopiedCopyTargets([]);
    copyDesigns.mutate({ sourceItemId: sourceId, mode: "all" });
  };

  const handleCopySome = (sourceId: string) => {
    const sourceItem = lineItems.find((item) => item.id === sourceId);
    if (!sourceItem) return;

    const matchingTargetCount = getMatchingCatalogCopyTargetIds(
      sourceItem,
      lineItems,
      designs,
    ).length;
    if (matchingTargetCount === 0) {
      toast.error("No other line uses this exact manufacturer and product.");
      return;
    }

    setCopySource(sourceId);
    setCopyMode("some");
    setCopiedCopyTargets([]);
    toast.info("Click each matching manufacturer/product line to copy this design.");
  };

  const handleCopySomeTarget = (targetId: string) => {
    if (!copySourceItemId) return;
    if (targetId === copySourceItemId) return;

    const sourceItem = lineItems.find((item) => item.id === copySourceItemId);
    const targetItem = lineItems.find((item) => item.id === targetId);
    if (
      !sourceItem ||
      !targetItem ||
      !lineItemsHaveMatchingCatalogIdentity(sourceItem, targetItem, designs)
    ) {
      toast.error("Copy Some requires the exact same manufacturer and product.");
      return;
    }

    copyDesigns.mutate({
      sourceItemId: copySourceItemId,
      mode: "some",
      targetIds: [targetId],
    });
  };

  const handleStackLineItem = (lineItemId: string) => {
    const copiedTargetIds = copyAllTargetsBySource[lineItemId] ?? [];
    const lineItem = lineItems.find((item) => item.id === lineItemId);
    const nextIds = [...stackedLineItemIds, lineItemId, ...copiedTargetIds];

    saveStackedLineItemIds(nextIds);
    toast.success(
      copiedTargetIds.length > 0
        ? `Stacked ${copiedTargetIds.length + 1} copied ${lineItem?.product_type ?? "line"} items.`
        : "Line item stacked."
    );
  };

  const handleUnstackLineItem = (lineItemId: string) => {
    saveStackedLineItemIds(stackedLineItemIds.filter((id) => id !== lineItemId));
  };

  const handleApplyProjectDiscount = (percent: QuoteDiscountPercent) => {
    const targetLineItemIds = lineItems.map((item) => item.id);

    if (targetLineItemIds.length === 0) {
      toast.error("Add at least one line item before applying a project discount.");
      return;
    }

    applyDiscount.mutate({ percent, lineItemIds: targetLineItemIds });
  };

  const handleApplyLineItemDiscount = (lineItemId: string, percent: QuoteDiscountPercent) => {
    applyDiscount.mutate({ percent, lineItemIds: [lineItemId] });
  };

  const isSavingQuote =
    updateQuote.isPending ||
    addLineItem.isPending ||
    updateLineItem.isPending ||
    changeLineItemProductType.isPending ||
    deleteLineItem.isPending ||
    copyLineItem.isPending ||
    freshStart.isPending ||
    upsertDesign.isPending ||
    copyDesigns.isPending ||
    applyDiscount.isPending;

  useEffect(() => {
    if (!isSavingQuote) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSavingQuote]);

  const quoteStatsStatus = quote ? getQuoteStatsStatus(quote) : null;
  const polarQuoteOnlyHold = designs.some((design) => {
    const productId =
      typeof design.options_json?.catalog_product_id === "string"
        ? design.options_json.catalog_product_id
        : null;
    return isPolarQuoteOnlyProductId(productId);
  });
  const stackedLineItemIdSet = new Set(stackedLineItemIds);
  const stackedLineItems = lineItems.filter((item) => stackedLineItemIdSet.has(item.id));
  const editableLineItems = lineItems.filter((item) => !stackedLineItemIdSet.has(item.id));
  const lineNumberRanges = useMemo(() => buildLineNumberRanges(lineItems), [lineItems]);
  const roomLineNumbers = useMemo(() => {
    const numbers = new Map<string, number[]>();
    lineItems.forEach((item) => {
      const roomName = item.room_name.trim();
      if (!roomName) return;
      appendLineNumbers(numbers, roomName, lineNumberRanges.get(item.id));
    });
    return numbers;
  }, [lineItems, lineNumberRanges]);
  const designsByLineItemId = new Map<string, SalesQuoteDesign[]>();
  designs.forEach((design) => {
    const lineDesigns = designsByLineItemId.get(design.line_item_id) ?? [];
    lineDesigns.push(design);
    designsByLineItemId.set(design.line_item_id, lineDesigns);
  });

  if (!activeQuoteId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Select or create a quote from the Dashboard to start building.
      </div>
    );
  }

  if (isQuoteLoading || (quote && areLineItemsLoading) || (lineItemIds.length > 0 && areDesignsLoading)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading the saved quote structure...
        </div>
      </div>
    );
  }

  if (
    isQuoteLoadError ||
    !quote ||
    isLineItemsLoadError ||
    isDesignsLoadError
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div
          className="max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950 shadow-sm"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <div>
              <h2 className="text-lg font-black">Quote could not be opened safely</h2>
              <p className="mt-2 text-sm leading-6">
                The saved quote record or its line-item structure is unavailable in V2. No empty
                quote was created and no price was changed.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-red-300 bg-white text-red-950 hover:bg-red-100"
                onClick={() => {
                  setActiveQuote(null);
                  setActiveTab("dashboard");
                }}
              >
                Back to quote dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (serverOwnedV2 && quote.quote_v2_backend !== true) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div
          className="max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950 shadow-sm"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
            <div>
              <h2 className="text-lg font-black">Historical quote conversion is required</h2>
              <p className="mt-2 text-sm leading-6">
                This record is a legacy quote, not a server-authoritative V2 draft. It has been
                left unchanged so its saved configuration and pricing cannot be silently replaced
                or edited through the wrong backend.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
                onClick={() => {
                  setActiveQuote(null);
                  setActiveTab("dashboard");
                }}
              >
                Back to quote dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const quoteLetterColor = quote?.quote_letter ? getQuoteColor(quote.quote_letter) : null;
  const copySourceItem = copySourceItemId
    ? lineItems.find((item) => item.id === copySourceItemId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#f4f4f2] p-4 text-[#1c1c1a]">
      <div className="quote-builder-sticky-shell sticky top-0 z-40 -mx-4 -mt-4 mb-3">
        <nav
          className="quote-alternative-bar border-b border-[#d8d8d2] bg-white/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/85"
          aria-label="Quote alternatives"
        >
          <QuoteGroupTabs />
        </nav>
        <div className={cn("quote-command-menu", isCommandMenuOpen && "quote-command-menu--open")}>
          <button
            type="button"
            className={cn("quote-command-toggle", isCommandMenuOpen && "quote-command-toggle--open")}
            aria-controls="quote-builder-command-bar"
            aria-expanded={isCommandMenuOpen}
            aria-label={isCommandMenuOpen ? "Hide quote actions menu" : "Show quote actions menu"}
            title={isCommandMenuOpen ? "Hide quote actions" : "Show quote actions"}
            onClick={() => setIsCommandMenuOpen((open) => !open)}
          >
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
          <div
            className="quote-command-reveal-zone"
            aria-label="Show quote actions menu"
            role="button"
            tabIndex={0}
            onClick={() => setIsCommandMenuOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsCommandMenuOpen(true);
              }
            }}
          />
          {/* Slim full-screen command bar (replaces the CRM chrome + tall header card) */}
          <div
            id="quote-builder-command-bar"
            className="quote-builder-command-bar border-b border-[#d8d8d2] bg-white/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/85"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h1 className="flex items-center gap-2.5 text-lg font-black tracking-[-0.02em] text-[#0b0b0b]">
                  {quoteLetterColor && (
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${quoteLetterColor.bg} text-sm font-black text-white`}
                    >
                      {quote?.quote_letter}
                    </span>
                  )}
                  <span className="leading-none">
                    Quote Builder
                    <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.22em] text-[#8d8a82]">
                      Window treatment studio
                    </span>
                  </span>
                </h1>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => freshStart.mutate()}
                  className="rounded-xl border-slate-200 bg-white shadow-sm"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Fresh Start
                </Button>
                {quote && (
                  <Button
                    size="sm"
                    onClick={() =>
                      isolated
                        ? toast.info("Testing mode: sending is safely disabled.")
                        : authoritativeV2
                          ? toast.info("Quote V2 customer delivery remains safely disabled.")
                        : setShowSendDialog(true)
                    }
                    className="rounded-xl bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_14px_26px_rgba(47,131,189,0.24)] hover:from-[#4c4b46] hover:to-[#1d1d1b]"
                    disabled={isolated || authoritativeV2}
                    title={
                      isolated
                        ? "Disabled in isolated Quote Lab"
                        : authoritativeV2
                          ? "Quote V2 delivery is blocked until the protected customer-send cutover"
                          : "Email or text the quote link to the customer"
                    }
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Quote
                  </Button>
                )}
                {quote && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      isolated
                        ? toast.info("Testing mode: payment links are safely disabled.")
                        : authoritativeV2
                          ? toast.info("Quote V2 payment links remain safely disabled.")
                        : setShowPaymentLinkDialog(true)
                    }
                    className="rounded-xl border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm hover:bg-emerald-100 hover:text-emerald-900"
                    disabled={isolated || authoritativeV2}
                    title={
                      isolated
                        ? "Disabled in isolated Quote Lab"
                        : authoritativeV2
                          ? "Quote V2 payment links are blocked until customer delivery is cut over"
                          : "Email the deposit payment link to the customer"
                    }
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Send Payment Link
                  </Button>
                )}
                {quote && (quoteStatsStatus === "sold" || quoteStatsStatus === "ordered") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPaymentDialog("deposit")}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    title="Record a deposit payment"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Deposit
                  </Button>
                )}
                {quote && quoteStatsStatus === "received" && (
                  <Button
                    size="sm"
                    onClick={() => setShowPaymentDialog("balance")}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    title="Record COD at install — auto-flips to Complete"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Collect COD
                  </Button>
                )}
                {quote && quoteStatsStatus && (
                  <QuoteStatusPill
                    status={quoteStatsStatus}
                    quoteId={quote.id}
                    showAdvance={!polarQuoteOnlyHold}
                    size="md"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {editingName ? (
                  <div className="grid w-72 gap-1.5 rounded-xl border border-slate-300 bg-white p-2 shadow-sm">
                    <Input
                      defaultValue={quote?.customer_name || ""}
                      placeholder="Customer Name"
                      aria-label="Customer name"
                      className="h-8"
                      autoFocus
                      onBlur={(e) => {
                        updateQuote.mutate({ customer_name: e.target.value });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateQuote.mutate({
                            customer_name: (e.target as HTMLInputElement).value,
                          });
                          setEditingName(false);
                        }
                      }}
                    />
                    <Input
                      type="tel"
                      defaultValue={quote?.customer_phone || ""}
                      placeholder="Phone Number"
                      aria-label="Customer phone number"
                      className="h-8"
                      onBlur={(e) =>
                        updateQuote.mutate({ customer_phone: e.target.value.trim() || null })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateQuote.mutate({
                            customer_phone: (e.target as HTMLInputElement).value.trim() || null,
                          });
                          setEditingName(false);
                        }
                      }}
                    />
                    <AddressAutocomplete
                      inputAs={Input}
                      defaultValue={quote?.customer_address || ""}
                      placeholder="City / Address"
                      aria-label="Customer address"
                      className="h-8"
                      onBlur={(e) =>
                        updateQuote.mutate({ customer_address: e.target.value.trim() || null })
                      }
                      onResolved={(address) =>
                        updateQuote.mutate({ customer_address: address.fullAddress })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateQuote.mutate({
                            customer_address:
                              (e.target as HTMLInputElement).value.trim() || null,
                          });
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="group grid w-72 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-slate-500 hover:shadow-md"
                    onClick={() => setEditingName(true)}
                    aria-label={`Customer ${quote?.customer_name || "not named"}. Phone ${
                      quote?.customer_phone || "not provided"
                    }. Address ${quote?.customer_address || "not provided"}. Click to edit.`}
                    title="Customer details — click to edit"
                  >
                    <span className="min-w-0 truncate text-sm font-black text-slate-950">
                      {quote?.customer_name || "Add Customer"}
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-slate-700" />
                    <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{formatCustomerPhone(quote?.customer_phone)}</span>
                    </span>
                    <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{quote?.customer_address || "No address"}</span>
                    </span>
                  </button>
                )}
                {/* Builder / Pricing Grids / Contract toggle */}
                <div className="quote-view-toggle ml-1" role="group" aria-label="Quote view">
                  <button
                    type="button"
                    aria-pressed="true"
                    className="quote-view-toggle__button quote-view-toggle__button--active"
                    onClick={() => setActiveTab("builder")}
                  >
                    Builder
                  </button>
                  <button
                    type="button"
                    aria-pressed="false"
                    onClick={() => setActiveTab("pricing")}
                    className="quote-view-toggle__button"
                  >
                    Pricing Grids
                  </button>
                  <button
                    type="button"
                    aria-pressed="false"
                    onClick={() => setActiveTab("contract")}
                    className="quote-view-toggle__button"
                  >
                    Contract
                  </button>
                </div>
                <div className="h-7 w-px bg-[#d8d8d2]" aria-hidden />
                {/* X - exit full-screen back to the Quotes dashboard */}
                <button
                  onClick={() => setActiveTab("dashboard")}
                  aria-label="Close builder - back to dashboard"
                  title="Close - back to dashboard"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d8d8d2] bg-white text-[#0b0b0b] transition hover:border-[#0b0b0b] hover:bg-[#0b0b0b] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="quote-command-project-discounts mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8d8d2] pt-3">
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-800">
                <Percent className="h-4 w-4" />
                Project Discount
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {QUOTE_DISCOUNT_PERCENTS.map((percent) => (
                  <Button
                    key={percent}
                    type="button"
                    size="sm"
                    onClick={() => handleApplyProjectDiscount(percent)}
                    disabled={applyDiscount.isPending}
                    className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                    title={`Apply ${percent}% discount to the entire order`}
                  >
                    {percent}% off
                  </Button>
                ))}
              </div>
            </div>
            {quote && (
              <div className="quote-command-note mt-3 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="quote-builder-note"
                    className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600"
                  >
                    General Job Notes
                  </label>
                  {updateQuote.isPending && (
                    <span className="text-xs font-semibold text-amber-700">Saving...</span>
                  )}
                </div>
                <Textarea
                  id="quote-builder-note"
                  value={quoteNoteDraft}
                  onChange={(event) => setQuoteNoteDraft(event.target.value)}
                  onBlur={saveQuoteBuilderNote}
                  placeholder="Internal sales or ordering notes..."
                  className="min-h-16 max-h-28 resize-y border-slate-200 bg-white text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <div className="quote-add-controls" aria-label="Add quote line item">
          <ManufacturerProductButtons
            products={catalogProducts}
            selectedManufacturer={selectedManufacturer}
            selectedProductId={selectedCatalogProductId}
            onSelectManufacturer={handleManufacturerSelect}
            onSelectProduct={handleCatalogProductSelect}
            loading={isCatalogLoading}
          />
          <RoomPresetButtons
            onSelect={handleRoomSelect}
            disabled={
              !selectedCatalogProduct ||
              addLineItem.isPending ||
              (authoritativeV2 && lineItems.length >= QUOTE_LAB_MAX_LINES)
            }
            lineNumbers={roomLineNumbers}
          />
        </div>

        {stackedLineItems.length > 0 && (
          <div
            className="border-b border-[#d8d8d2] bg-white/95 px-4 py-2"
            aria-label="Stacked completed line items"
          >
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
              <Archive className="h-3.5 w-3.5" />
              Stacked Lines
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
              {stackedLineItems.map((item) => (
                <StackedLineItemRow
                  key={item.id}
                  item={item}
                  lineNumberLabel={lineNumberRanges.get(item.id)?.label ?? "#0"}
                  designs={designsByLineItemId.get(item.id) ?? []}
                  authoritativeV2={authoritativeV2}
                  onUnstack={() => handleUnstackLineItem(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="quote-builder-scroll-flow space-y-3">
        {polarQuoteOnlyHold && (
          <div
            className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 shadow-sm"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div>
                <p className="font-black uppercase tracking-[0.12em]">QUOTE ONLY · Polar</p>
                <p className="mt-1 text-sm font-semibold">
                  Internal task: obtain and review a manual Polar quote. Pricing, customer send,
                  status advance, order preparation, and manufacturer action are blocked.
                </p>
              </div>
            </div>
          </div>
        )}
        <div
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]",
            isSavingQuote
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}
          role="status"
          aria-live="polite"
        >
          {isSavingQuote ? "Saving quote..." : "Quote saved"}
        </div>

      {/* Rooms relocated to the top control zone (above) */}

      {/* Copy Some confirmation bar */}
        {copyMode === "some" && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm text-muted-foreground">
            Copy Some is active. Click the checkbox on each target line item to copy immediately.
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            <CopyCheck className="h-4 w-4 mr-2" />
            {copiedCopyTargets.length} copied
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCopiedCopyTargets([]);
              clearCopyTargets();
            }}
          >
            Cancel
          </Button>
          </div>
        )}

      {/* Line Items with Design Cards */}
        {lineItems.length === 0 ? (
          <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground text-sm">
            Select a manufacturer, exact product, and room to add a line item.
          </div>
        ) : editableLineItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-center text-sm font-medium text-slate-600">
            All line items are stacked. Click any stacked line above to edit it.
          </div>
        ) : (
          <div className="space-y-4">
            {editableLineItems.map((item) => {
              const isMatchingCopyTarget =
                copyMode === "some" &&
                copySourceItem !== null &&
                copySourceItem.id !== item.id &&
                lineItemsHaveMatchingCatalogIdentity(
                  copySourceItem,
                  item,
                  designs,
                );
              const lineRange = lineNumberRanges.get(item.id);

              return (
                <DesignCard
                  key={item.id}
                  lineItem={item}
                  lineNumber={lineRange?.start ?? 0}
                  lineNumberLabel={lineRange?.label}
                  designs={designs.filter((d) => d.line_item_id === item.id)}
                  sideBySideLineOptions={lineItems.flatMap((candidate) => {
                    if (
                      candidate.id === item.id ||
                      candidate.product_type !== item.product_type
                    ) {
                      return [];
                    }
                    const candidateDesign = designs.find(
                      (design) =>
                        design.line_item_id === candidate.id && design.variant === "A",
                    );
                    if (!candidateDesign) return [];
                    const candidateRange = lineNumberRanges.get(candidate.id);
                    return [
                      {
                        lineId: candidate.id,
                        label: `${candidateRange?.label ?? "#?"} • ${candidate.room_name} • ID ${candidate.id}`,
                        design: candidateDesign,
                      },
                    ];
                  })}
                  onUpdateDesign={(design) => upsertDesign.mutate(design)}
                  onCopyAll={() => handleCopyAll(item.id)}
                  onCopySome={() => handleCopySome(item.id)}
                  onStack={() => handleStackLineItem(item.id)}
                  copyMode={copyMode}
                  isCopyTarget={isMatchingCopyTarget}
                  isSelectedTarget={copiedCopyTargets.includes(item.id)}
                  onToggleCopyTarget={() => handleCopySomeTarget(item.id)}
                  discountPercents={QUOTE_DISCOUNT_PERCENTS}
                  onApplyDiscount={(percent) => handleApplyLineItemDiscount(item.id, percent)}
                  isDiscountPending={applyDiscount.isPending}
                  isPriceLocked={isActiveQuotePriceLocked}
                  onOpenMeasurement={() => handleOpenMeasurement(item.id)}
                  onDelete={() => deleteLineItem.mutate(item.id)}
                  onCopyItem={() => copyLineItem.mutate(item.id)}
                  onChangeProductType={(productType) =>
                    changeLineItemProductType.mutate({
                      id: item.id,
                      productType,
                      previousProductType: item.product_type,
                    })
                  }
                  onUpdateRoomName={(roomName) =>
                    updateLineItem.mutate({ id: item.id, room_name: roomName })
                  }
                  onUpdateQuantity={(quantity) =>
                    updateLineItem.mutate({ id: item.id, quantity })
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Measurement Grid Modal */}
      <MeasurementGridModal
        open={showMeasurementGrid}
        onClose={() => {
          closeMeasurementGrid();
          setMeasuringItemId(null);
        }}
        step={measurementStep}
        onWidthWhole={setWidthWhole}
        onWidthFraction={setWidthFraction}
        onHeightWhole={setHeightWhole}
        onHeightFraction={handleHeightFraction}
        onDirectMeasurements={handleDirectMeasurements}
        pendingWidth={pendingWidth}
        pendingHeight={pendingHeight}
      />

      {/* Send Quote Dialog (email now; SMS later) */}
      {quote && (
        <SendQuoteDialog
          open={showSendDialog}
          onClose={() => setShowSendDialog(false)}
          quote={quote}
        />
      )}

      {quote && (
        <SendPaymentLinkDialog
          open={showPaymentLinkDialog}
          onClose={() => setShowPaymentLinkDialog(false)}
          quote={quote}
        />
      )}

      {/* Collect Payment Dialog — deposit (sold/ordered) or COD (received) */}
      {quote && showPaymentDialog && (
        <CollectPaymentDialog
          open={!!showPaymentDialog}
          onClose={() => setShowPaymentDialog(null)}
          quote={quote}
          mode={showPaymentDialog}
        />
      )}

      {quote && (
        <FloatingQuoteTotalBadge
          lineItems={lineItems}
          designs={designs}
          storedTotal={quote.total_amount}
          preferStoredTotal={preferStoredTotal}
          authoritativeV2={authoritativeV2}
        />
      )}
    </div>
  );
}

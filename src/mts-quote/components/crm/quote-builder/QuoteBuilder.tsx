/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { ProductTypeButtons } from "./ProductTypeButtons";
import { RoomPresetButtons } from "./RoomPresetButtons";
import { MeasurementGridModal } from "./MeasurementGridModal";
import { DesignCard } from "./DesignCard";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { Textarea } from "@mts/components/ui/textarea";
import { RotateCcw, Pencil, CopyCheck, Send, DollarSign, Percent, X } from "lucide-react";
import { SendQuoteDialog } from "./SendQuoteDialog";
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
import { buildCopiedDesignRows, buildCopiedLineItemPatch } from "@mts/lib/quoteDesignCopy";
import {
  applyQuoteDesignDiscount,
  QUOTE_DISCOUNT_PERCENTS,
  type QuoteDiscountPercent,
} from "@mts/lib/quoteDiscounts";
import {
  buildQuoteInstallerNotesMeta,
  calculateQuoteDesignSubtotal,
  getQuoteBuilderNote,
  shouldPersistQuoteDesignSubtotal,
} from "@mts/lib/quoteTotals";
import { isQuotePriceLocked } from "@mts/lib/quotePriceLock";
import type { SalesQuote, SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";

export function QuoteBuilder() {
  const {
    activeQuoteId,
    selectedProductType,
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
    setActiveTab,
  } = useQuoteBuilderStore();

  const queryClient = useQueryClient();

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
  const [showPaymentDialog, setShowPaymentDialog] = useState<"deposit" | "balance" | null>(null);
  const [copiedCopyTargets, setCopiedCopyTargets] = useState<string[]>([]);
  const [discountMode, setDiscountMode] = useState<"all" | "selected">("all");
  const [selectedDiscountLineIds, setSelectedDiscountLineIds] = useState<string[]>([]);
  const [quoteNoteDraft, setQuoteNoteDraft] = useState("");

  const syncQuoteTotal = async (options: { allowZero?: boolean } = {}) => {
    if (!activeQuoteId) return;

    const { data: latestLineItems, error: lineItemsError } = await (supabase as any)
      .from("sales_quote_line_items")
      .select("id, quantity")
      .eq("quote_id", activeQuoteId);
    if (lineItemsError) throw lineItemsError;

    const latestLineItemIds = (latestLineItems ?? []).map((item: SalesQuoteLineItem) => item.id);
    let latestDesigns: Pick<SalesQuoteDesign, "line_item_id" | "unit_price">[] = [];

    if (latestLineItemIds.length > 0) {
      const { data: designRows, error: designsError } = await (supabase as any)
        .from("sales_quote_designs")
        .select("line_item_id, unit_price")
        .in("line_item_id", latestLineItemIds);
      if (designsError) throw designsError;
      latestDesigns = designRows ?? [];
    }

    const total = calculateQuoteDesignSubtotal(latestLineItems ?? [], latestDesigns);
    if (!shouldPersistQuoteDesignSubtotal(latestDesigns, options)) return;

    const { error: quoteError } = await (supabase as any)
      .from("sales_quotes")
      .update({ total_amount: total })
      .eq("id", activeQuoteId);
    if (quoteError) throw quoteError;
  };

  // Fetch active quote
  const { data: quote } = useQuery({
    queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
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
    if (quote) setQuoteNoteDraft(getQuoteBuilderNote(quote));
  }, [quote]);

  // Fetch line items
  const { data: lineItems = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .eq("quote_id", activeQuoteId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as SalesQuoteLineItem[];
    },
    enabled: !!activeQuoteId,
  });

  // Fetch all designs for this quote's line items
  const lineItemIds = lineItems.map((i) => i.id);
  const designsQueryKey = [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "designs"];
  const quoteDesignMutationKey = ["sales-quote-designs", activeQuoteId || ""];
  const isActiveQuotePriceLocked = isQuotePriceLocked(quote);
  const { data: designs = [] } = useQuery({
    queryKey: designsQueryKey,
    queryFn: async () => {
      if (lineItemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("sales_quote_designs")
        .select("*")
        .in("line_item_id", lineItemIds);
      if (error) throw error;
      return (data || []) as SalesQuoteDesign[];
    },
    enabled: lineItemIds.length > 0,
  });

  // Update customer info
  const updateQuote = useMutation({
    mutationFn: async (updates: Partial<SalesQuote>) => {
      const { error } = await (supabase as any)
        .from("sales_quotes")
        .update(updates)
        .eq("id", activeQuoteId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
    },
  });

  const saveQuoteBuilderNote = () => {
    if (!quote) return;
    const currentNote = getQuoteBuilderNote(quote);
    if (quoteNoteDraft === currentNote) return;

    updateQuote.mutate({
      installer_notes: buildQuoteInstallerNotesMeta(quote, {
        __quoteBuilderNote: quoteNoteDraft,
      }),
    });
  };

  // Add line item (no measurements required initially)
  const addLineItem = useMutation({
    mutationFn: async (item: {
      room_name: string;
      product_type: string;
      width_whole?: number;
      width_fraction?: string;
      height_whole?: number;
      height_fraction?: string;
    }) => {
      const { error } = await (supabase as any).from("sales_quote_line_items").insert({
        quote_id: activeQuoteId!,
        room_name: item.room_name,
        product_type: item.product_type,
        width_whole: item.width_whole ?? 0,
        width_fraction: item.width_fraction ?? "0",
        height_whole: item.height_whole ?? 0,
        height_fraction: item.height_fraction ?? "0",
        sort_order: lineItems.length,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await syncQuoteTotal({ allowZero: true });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
    },
  });

  // Update line item measurements
  const updateLineItem = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<SalesQuoteLineItem>) => {
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
    },
  });

  const changeLineItemProductType = useMutation({
    mutationFn: async ({ id, productType }: { id: string; productType: string }) => {
      const { error: updateError } = await (supabase as any)
        .from("sales_quote_line_items")
        .update({ product_type: productType })
        .eq("id", id);
      if (updateError) throw updateError;

      const { error: deleteDesignsError } = await (supabase as any)
        .from("sales_quote_designs")
        .delete()
        .eq("line_item_id", id);
      if (deleteDesignsError) throw deleteDesignsError;
    },
    onSuccess: async () => {
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "designs"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
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
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
    },
  });

  // Copy line item
  const copyLineItem = useMutation({
    mutationFn: async (id: string) => {
      const source = lineItems.find((i) => i.id === id);
      if (!source) return;
      const { error } = await (supabase as any).from("sales_quote_line_items").insert({
        quote_id: activeQuoteId!,
        room_name: source.room_name,
        product_type: source.product_type,
        width_whole: source.width_whole,
        width_fraction: source.width_fraction,
        height_whole: source.height_whole,
        height_fraction: source.height_fraction,
        quantity: source.quantity,
        sort_order: lineItems.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      toast.success("Line item copied");
    },
  });

  // Fresh start - clear all line items
  const freshStart = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .delete()
        .eq("quote_id", activeQuoteId!);
      if (error) throw error;
    },
    onSuccess: async () => {
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      selectProduct(null);
      toast.success("All line items cleared");
    },
  });

  // Upsert design
  const upsertDesign = useMutation({
    mutationKey: quoteDesignMutationKey,
    mutationFn: async (
      design: Partial<SalesQuoteDesign> & { line_item_id: string; variant: string }
    ) => {
      const { error } = await (supabase as any).from("sales_quote_designs").upsert(design, {
        onConflict: "line_item_id,variant",
      });
      if (error) throw error;
    },
    onMutate: async (design) => {
      await queryClient.cancelQueries({ queryKey: designsQueryKey });
      const previousDesigns = queryClient.getQueryData<SalesQuoteDesign[]>(designsQueryKey);

      queryClient.setQueryData<SalesQuoteDesign[]>(designsQueryKey, (current = []) => {
        const index = current.findIndex(
          (row) => row.line_item_id === design.line_item_id && row.variant === design.variant
        );

        if (index === -1) return [...current, design as SalesQuoteDesign];

        const next = [...current];
        next[index] = { ...next[index], ...design };
        return next;
      });

      return { previousDesigns };
    },
    onError: (_error, _design, context) => {
      if (context?.previousDesigns) {
        queryClient.setQueryData(designsQueryKey, context.previousDesigns);
      }
    },
    onSuccess: async () => {
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
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

      const targets =
        mode === "all"
          ? lineItems.filter((i) => i.id !== sourceItemId).map((i) => i.id)
          : targetIds.filter((targetId) => targetId !== sourceItemId);

      if (targets.length === 0) throw new Error("No matching line items selected to copy to.");

      const sourceVariants = sourceDesigns.map((sd) => sd.variant);
      const sourceVariantFilter = `(${sourceVariants.map((variant) => `"${variant}"`).join(",")})`;

      for (const targetId of targets) {
        const { error: lineItemError } = await (supabase as any)
          .from("sales_quote_line_items")
          .update(buildCopiedLineItemPatch(sourceItem))
          .eq("id", targetId);
        if (lineItemError) throw lineItemError;

        const clonedDesigns = buildCopiedDesignRows(sourceDesigns, targetId);

        const { error } = await (supabase as any)
          .from("sales_quote_designs")
          .upsert(clonedDesigns, { onConflict: "line_item_id,variant" });
        if (error) throw error;

        const { error: staleVariantError } = await (supabase as any)
          .from("sales_quote_designs")
          .delete()
          .eq("line_item_id", targetId)
          .not("variant", "in", sourceVariantFilter);
        if (staleVariantError) throw staleVariantError;
      }

      return targets.length;
    },
    onSuccess: async (targetCount, variables) => {
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "line-items"],
      });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "designs"],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      if (variables.mode === "all") {
        clearCopyTargets();
        setCopiedCopyTargets([]);
      } else {
        setCopiedCopyTargets((current) =>
          Array.from(new Set([...current, ...(variables.targetIds ?? [])]))
        );
      }
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

      const { error } = await (supabase as any).from("sales_quote_designs").upsert(discountedRows, {
        onConflict: "line_item_id,variant",
      });
      if (error) throw error;

      return {
        count: targetDesigns.length,
        rows: discountedRows,
        removedCount: discountedRows.filter((row) => !row.options_json.discount_percent).length,
      };
    },
    onMutate: async ({ percent, lineItemIds: targetLineItemIds }) => {
      await queryClient.cancelQueries({ queryKey: designsQueryKey });
      const previousDesigns = queryClient.getQueryData<SalesQuoteDesign[]>(designsQueryKey);
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
      await syncQuoteTotal();
      queryClient.invalidateQueries({
        queryKey: designsQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      const action = result.removedCount === result.count ? "removed from" : "applied to";
      toast.success(
        `${variables.percent}% discount ${action} ${result.count} design${
          result.count === 1 ? "" : "s"
        }`
      );
    },
  });

  // Handle room selection — immediately add line item
  const handleRoomSelect = (room: string) => {
    if (!selectedProductType) {
      toast.error("Select a product type first");
      return;
    }
    addLineItem.mutate({
      room_name: room,
      product_type: selectedProductType,
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

  const handleCopyAll = (sourceId: string) => {
    setCopySource(sourceId);
    setCopyMode("all");
    setCopiedCopyTargets([]);
    copyDesigns.mutate({ sourceItemId: sourceId, mode: "all" });
  };

  const handleCopySome = (sourceId: string) => {
    setCopySource(sourceId);
    setCopyMode("some");
    setCopiedCopyTargets([]);
    toast.info("Click each target checkbox to copy this design to that line.");
  };

  const handleCopySomeTarget = (targetId: string) => {
    if (!copySourceItemId) return;
    if (targetId === copySourceItemId) return;
    copyDesigns.mutate({
      sourceItemId: copySourceItemId,
      mode: "some",
      targetIds: [targetId],
    });
  };

  const toggleDiscountTarget = (lineItemId: string) => {
    setSelectedDiscountLineIds((current) =>
      current.includes(lineItemId)
        ? current.filter((id) => id !== lineItemId)
        : [...current, lineItemId]
    );
  };

  const handleApplyDiscount = (percent: QuoteDiscountPercent) => {
    const targetLineItemIds =
      discountMode === "all" ? lineItems.map((item) => item.id) : selectedDiscountLineIds;

    if (targetLineItemIds.length === 0) {
      toast.error("Select at least one line item for the discount.");
      return;
    }

    applyDiscount.mutate({ percent, lineItemIds: targetLineItemIds });
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

  // Expand quantity items into individual design entries
  const expandedItems: { item: SalesQuoteLineItem; instanceIndex: number }[] = [];
  lineItems.forEach((item) => {
    for (let i = 0; i < item.quantity; i++) {
      expandedItems.push({ item, instanceIndex: i });
    }
  });

  if (!activeQuoteId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Select or create a quote from the Dashboard to start building.
      </div>
    );
  }

  const quoteLetterColor = quote?.quote_letter ? getQuoteColor(quote.quote_letter) : null;

  return (
    <div className="min-h-screen bg-[#f4f4f2] p-4 text-[#1c1c1a]">
      {/* Quote group tabs relocated below the command bar */}

      <div className="quote-builder-sticky-shell sticky top-0 z-40 -mx-4 -mt-4 mb-3">
        {/* Slim full-screen command bar (replaces the CRM chrome + tall header card) */}
        <div className="quote-builder-command-bar border-b border-[#d8d8d2] bg-white/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-white/85">
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
                  onClick={() => setShowSendDialog(true)}
                  className="rounded-xl bg-gradient-to-br from-[#67645e] to-[#343330] text-white shadow-[0_14px_26px_rgba(47,131,189,0.24)] hover:from-[#4c4b46] hover:to-[#1d1d1b]"
                  title="Email or text the quote link to the customer"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Quote
                </Button>
              )}
              {quote && (quote.status === "sold" || quote.status === "ordered") && (
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
              {quote && quote.status === "received" && (
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
              {quote && (
                <QuoteStatusPill status={quote.status} quoteId={quote.id} showAdvance size="md" />
              )}
            </div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    defaultValue={quote?.customer_name || ""}
                    placeholder="Customer Name"
                    className="w-48"
                    autoFocus
                    onBlur={(e) => {
                      updateQuote.mutate({ customer_name: e.target.value });
                      setEditingName(false);
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
                  <AddressAutocomplete
                    inputAs={Input}
                    defaultValue={quote?.customer_address || ""}
                    placeholder="City / Address"
                    className="w-48"
                    onBlur={(e) => updateQuote.mutate({ customer_address: e.target.value })}
                    onResolved={(address) =>
                      updateQuote.mutate({ customer_address: address.fullAddress })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateQuote.mutate({
                          customer_address: (e.target as HTMLInputElement).value,
                        });
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-lg font-bold shadow-sm transition hover:border-[#67645e] hover:text-[#343330]"
                  onClick={() => setEditingName(true)}
                >
                  {quote?.customer_name || "Add Customer"}{" "}
                  {quote?.customer_address && (
                    <span className="text-muted-foreground text-sm">· {quote.customer_address}</span>
                  )}
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              {/* Builder / Contract toggle */}
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
        </div>

        <div className="quote-add-controls" aria-label="Add quote line item">
          <ProductTypeButtons selected={selectedProductType} onSelect={(type) => selectProduct(type)} />
          <RoomPresetButtons onSelect={handleRoomSelect} disabled={!selectedProductType || addLineItem.isPending} />
        </div>
      </div>

      <div className="quote-builder-scroll-flow space-y-3">
        <QuoteGroupTabs />

        {/* Discount Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-emerald-800">
            <Percent className="h-4 w-4" />
            Discount
          </span>
          <Button
            type="button"
            size="sm"
            variant={discountMode === "all" ? "default" : "outline"}
            onClick={() => setDiscountMode("all")}
            className="rounded-xl"
          >
            All lines
          </Button>
          <Button
            type="button"
            size="sm"
            variant={discountMode === "selected" ? "default" : "outline"}
            onClick={() => setDiscountMode("selected")}
            className="rounded-xl"
          >
            Select lines
          </Button>
          {discountMode === "selected" && (
            <span className="text-sm font-medium text-muted-foreground">
              {selectedDiscountLineIds.length} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {QUOTE_DISCOUNT_PERCENTS.map((percent) => (
            <Button
              key={percent}
              type="button"
              onClick={() => handleApplyDiscount(percent)}
              disabled={applyDiscount.isPending}
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {percent}% off
            </Button>
          ))}
        </div>
        </div>

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

        {quote && (
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor="quote-builder-note"
              className="text-xs font-black uppercase tracking-[0.18em] text-slate-600"
            >
              Quote Note
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
            placeholder="Add quote-level notes..."
            className="min-h-20 resize-y border-slate-200 bg-white text-sm"
          />
          </div>
        )}

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
        {expandedItems.length === 0 ? (
          <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground text-sm">
            Select a product type and room to add line items.
          </div>
        ) : (
          <div className="space-y-4">
            {expandedItems.map(({ item, instanceIndex }) => (
              <DesignCard
                key={`${item.id}-${instanceIndex}`}
                lineItem={item}
                instanceIndex={instanceIndex}
                designs={designs.filter((d) => d.line_item_id === item.id)}
                onUpdateDesign={(design) => upsertDesign.mutate(design)}
                onCopyAll={() => handleCopyAll(item.id)}
                onCopySome={() => handleCopySome(item.id)}
                copyMode={copyMode}
                isCopyTarget={copyMode === "some" && copySourceItemId !== item.id}
                isSelectedTarget={copiedCopyTargets.includes(item.id)}
                onToggleCopyTarget={() => handleCopySomeTarget(item.id)}
                isDiscountTarget={discountMode === "selected"}
                isDiscountSelected={selectedDiscountLineIds.includes(item.id)}
                onToggleDiscountTarget={() => toggleDiscountTarget(item.id)}
                isPriceLocked={isActiveQuotePriceLocked}
                onOpenMeasurement={() => handleOpenMeasurement(item.id)}
                onDelete={() => deleteLineItem.mutate(item.id)}
                onCopyItem={() => copyLineItem.mutate(item.id)}
                onChangeProductType={(productType) =>
                  changeLineItemProductType.mutate({ id: item.id, productType })
                }
              />
            ))}
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
        />
      )}
    </div>
  );
}

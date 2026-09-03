/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useIsMutating, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { Card, CardContent, CardHeader, CardTitle } from "@mts/components/ui/card";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { Label } from "@mts/components/ui/label";
import { Switch } from "@mts/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@mts/components/ui/accordion";
import { SignaturePad } from "@mts/components/crm/SignaturePad";
import {
  FileText,
  CreditCard,
  Zap,
  Banknote,
  CheckCircle2,
  Link as LinkIcon,
  Pencil,
  User,
  Mail,
  Phone,
  MapPin,
  Eye,
  DollarSign,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@mts/lib/utils";
import { toast } from "sonner";
import { formatDimensionsOrNull } from "@mts/types/quote";
import { formatCurrency, getQuoteDesignDetails } from "@mts/lib/quoteDesignDetails";
import { quoteProductDetails } from "@/lib/crm/customer-quote-details";
import { customerQuoteProductName, customerQuoteText } from "@/lib/crm/customer-quote-branding";
import {
  calculateLineItemDesignTotal,
  calculateQuoteDesignSubtotal,
  calculateQuoteTotalBreakdown,
  buildQuoteInstallerNotesMeta,
  getQuoteEmailNote,
  parseQuoteAdminControls,
  selectedQuoteTotalDesigns,
  shouldPersistQuoteDesignSubtotal,
  type QuoteAdminControls,
  type QuoteExtraFee,
} from "@mts/lib/quoteTotals";
import {
  hasCompletePersistedDesignSelections,
  projectPersistedDesignSelections,
} from "@/lib/quote-v2/selected-design";
import { getAccountName, ACCOUNT_IDS } from "@mts/lib/accounts";
import { PAYMENT_METHODS, getQuoteColor } from "@mts/lib/quoteConstants";
import { getCustomerLineItemProductImage } from "@mts/lib/quoteProductImages";
import { QuoteGroupTabs } from "./QuoteGroupTabs";
import { SendQuoteDialog } from "./SendQuoteDialog";
import type { SalesQuote, SalesQuoteLineItem, SalesQuoteDesign } from "@mts/types/quote";
import type { TechnicalMeasureDecision } from "@/lib/crm/measure-needed-state";
import {
  historicalUnitPrice,
  shouldUseHistoricalQuotePriceLock,
  type HistoricalQuotePriceLock,
} from "@/lib/crm/historical-quote-price-lock";

const paymentIcons: Record<string, typeof FileText> = {
  check: FileText,
  card_ach: CreditCard,
  zelle: Zap,
  cash: Banknote,
};

function hasOnyxShutterProducts(
  lineItems: SalesQuoteLineItem[],
  designs: SalesQuoteDesign[]
): boolean {
  return designs.some((design) => {
    const lineItem = lineItems.find((item) => item.id === design.line_item_id);
    const supplier = design.supplier?.trim().toLowerCase();
    const productType = (design.product_type || lineItem?.product_type || "").trim().toLowerCase();

    return supplier === "onyx" && productType === "shutters";
  });
}

function effectiveContractDesigns(
  lineItems: SalesQuoteLineItem[],
  designs: SalesQuoteDesign[],
): { designs: SalesQuoteDesign[]; selectionAware: boolean } {
  if (!hasCompletePersistedDesignSelections(lineItems, designs)) {
    return { designs, selectionAware: false };
  }
  const projected = projectPersistedDesignSelections(designs, lineItems);
  return {
    designs: selectedQuoteTotalDesigns(projected),
    selectionAware: true,
  };
}

export function projectHistoricalContractDesigns(input: {
  quote: Pick<SalesQuote, "id" | "quote_v2_backend" | "quote_v2_status"> | null | undefined;
  activeQuoteId: string | null | undefined;
  lineItems: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  historicalPriceLock?: HistoricalQuotePriceLock | null;
}): SalesQuoteDesign[] {
  const { quote, activeQuoteId, lineItems, designs, historicalPriceLock } = input;
  if (
    !quote ||
    quote.id !== activeQuoteId ||
    !shouldUseHistoricalQuotePriceLock({
      quoteV2Backend: quote.quote_v2_backend === true,
      quoteV2Status: quote.quote_v2_status,
      priceLock: historicalPriceLock,
    }) ||
    !historicalPriceLock
  ) {
    return designs;
  }

  const activeLineIds = new Set(
    lineItems
      .filter((lineItem) => lineItem.quote_id === activeQuoteId)
      .map((lineItem) => lineItem.id),
  );
  return designs.map((design) => {
    if (!design.line_item_id || !activeLineIds.has(design.line_item_id)) return design;
    const lockedUnitPrice =
      historicalPriceLock.designUnitPrices[design.id] ??
      historicalPriceLock.lineUnitPrices[design.line_item_id];
    const projected = historicalUnitPrice(design.unit_price, lockedUnitPrice);
    return projected.fromHistoricalLock
      ? { ...design, unit_price: projected.amount }
      : design;
  });
}

// Account-specific contract header branding
const CONTRACT_HEADERS: Record<
  string,
  {
    title: string;
    phone: string;
    website: string;
    email: string;
    logoUrl: string;
    logoAlt: string;
    logoPanelClass: string;
  }
> = {
  [ACCOUNT_IDS.SHUTTERS_805]: {
    title: "805 SHUTTERS",
    phone: "(805) 806-9344",
    website: "805shutters.com",
    email: "805@805shutters.com",
    logoUrl: "/brand/805-shutters-logo-header.png",
    logoAlt: "805 Shutters logo",
    logoPanelClass: "bg-white",
  },
};

export function QuoteContract({
  historicalPriceLock,
}: {
  historicalPriceLock?: HistoricalQuotePriceLock | null;
} = {}) {
  const { activeQuoteId, setActiveTab } = useQuoteBuilderStore();
  const queryClient = useQueryClient();
  const quoteDesignMutationKey = ["sales-quote-designs", activeQuoteId || ""];
  const pendingQuoteDesignWrites = useIsMutating({ mutationKey: quoteDesignMutationKey });
  const designWritesPending = pendingQuoteDesignWrites > 0;
  const [editingInfo, setEditingInfo] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [measureDecision, setMeasureDecision] = useState<TechnicalMeasureDecision | "">("");
  const [adminControls, setAdminControls] = useState<QuoteAdminControls>({
    showExtras: false,
    showDiscount: false,
    showTax: false,
    extraFees: [],
    discountPercent: 0,
    taxPercent: 0,
    depositPercent: 50,
    progressPercent: 0,
  });

  // Fetch quote
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

  // Fetch designs
  const lineItemIds = lineItems.map((i) => i.id);
  const { data: designs = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.detail(activeQuoteId || ""), "designs"],
    queryFn: async () => {
      if (lineItemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("sales_quote_designs")
        .select("*")
        .in("line_item_id", lineItemIds);
      if (error) throw error;
      return (data || []) as SalesQuoteDesign[];
    },
    enabled: lineItemIds.length > 0 && !designWritesPending,
  });

  // Fetch all quotes in the same group for multi-quote display
  const groupId = quote?.quote_group_id;
  const { data: groupQuotes = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.all, "group", groupId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .select("*")
        .eq("quote_group_id", groupId!)
        .order("quote_letter");
      if (error) throw error;
      return (data || []) as SalesQuote[];
    },
    enabled: !!groupId,
  });

  // Fetch line items + designs for all sibling quotes (for contract display)
  const siblingQuoteIds = groupQuotes.map((q) => q.id);
  const { data: allGroupLineItems = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.all, "group-line-items", groupId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .in("quote_id", siblingQuoteIds)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as SalesQuoteLineItem[];
    },
    enabled: siblingQuoteIds.length > 0,
  });

  const allGroupLineItemIds = allGroupLineItems.map((i) => i.id);
  const { data: allGroupDesigns = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.all, "group-designs", groupId],
    queryFn: async () => {
      if (allGroupLineItemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("sales_quote_designs")
        .select("*")
        .in("line_item_id", allGroupLineItemIds);
      if (error) throw error;
      return (data || []) as SalesQuoteDesign[];
    },
    enabled: allGroupLineItemIds.length > 0 && !designWritesPending,
  });

  const hasMultipleQuotes = groupQuotes.length > 1;
  const displayDesigns = projectHistoricalContractDesigns({
    quote,
    activeQuoteId,
    lineItems,
    designs,
    historicalPriceLock,
  });
  const displayGroupDesigns = projectHistoricalContractDesigns({
    quote,
    activeQuoteId,
    lineItems: allGroupLineItems,
    designs: allGroupDesigns,
    historicalPriceLock,
  });

  // Load admin controls from quote
  useEffect(() => {
    if (quote) {
      setAdminControls(parseQuoteAdminControls(quote));
    }
  }, [quote]);

  // Update quote
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

  // Mark as sold
  const markAsSold = useMutation({
    mutationFn: async () => {
      if (!measureDecision) throw new Error("Choose whether a technical measure is needed.");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your CRM session expired. Sign in again and retry.");
      const response = await fetch(
        `/api/crm/sales-quotes/${encodeURIComponent(activeQuoteId!)}/sold`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ measureDecision }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.message || result.error || "The contract could not be marked sold.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      toast.success("Quote marked sold and handed off to the CRM workflow.");
      setActiveTab("dashboard");
    },
    onError: (error: Error) => {
      toast.error(error.message || "The contract could not be marked sold.");
    },
  });

  const calculateControlledTotal = (
    items: SalesQuoteLineItem[],
    quoteDesigns: SalesQuoteDesign[],
    controls: QuoteAdminControls
  ) => {
    const effective = effectiveContractDesigns(items, quoteDesigns);
    const controlledSubtotal = calculateQuoteDesignSubtotal(items, effective.designs, {
      mode: effective.selectionAware ? "authoritative_v2" : "legacy",
    });
    return calculateQuoteTotalBreakdown(controlledSubtotal, controls).total;
  };

  // Admin controls functions
  const saveAdminControls = async (controls: QuoteAdminControls) => {
    const updates: Partial<SalesQuote> = {
      installer_notes: buildQuoteInstallerNotesMeta(quote ?? { installer_notes: null }, {
        __adminControls: controls,
      }),
    };

    const effective = effectiveContractDesigns(lineItems, designs);
    if (
      shouldPersistQuoteDesignSubtotal(effective.designs, {
        mode: effective.selectionAware ? "authoritative_v2" : "legacy",
      })
    ) {
      updates.total_amount = calculateControlledTotal(lineItems, designs, controls);
    }

    await updateQuote.mutateAsync(updates);
    setAdminControls(controls);
  };

  const updateAdminControl = <K extends keyof QuoteAdminControls>(
    key: K,
    value: QuoteAdminControls[K]
  ) => {
    const updated = { ...adminControls, [key]: value };
    setAdminControls(updated);
    saveAdminControls(updated);
  };

  const applyDiscount = (percent: number) => {
    const updated = {
      ...adminControls,
      showDiscount: percent > 0,
      discountPercent: percent,
    };
    setAdminControls(updated);
    saveAdminControls(updated);
  };

  const addExtraFee = () => {
    const newFee: QuoteExtraFee = {
      id: Math.random().toString(36).substring(7),
      name: "Extra Fee",
      amount: 0,
    };
    const updated = { ...adminControls, extraFees: [...adminControls.extraFees, newFee] };
    setAdminControls(updated);
    saveAdminControls(updated);
  };

  const removeExtraFee = (id: string) => {
    const updated = {
      ...adminControls,
      extraFees: adminControls.extraFees.filter((f) => f.id !== id),
    };
    setAdminControls(updated);
    saveAdminControls(updated);
  };

  const updateDesignPrice = useMutation({
    mutationKey: quoteDesignMutationKey,
    mutationFn: async ({
      quoteId,
      designId,
      unitPrice,
      optionsJson,
    }: {
      quoteId: string;
      designId: string;
      unitPrice: number;
      optionsJson: Record<string, unknown>;
    }) => {
      const roundedPrice = Math.round(unitPrice * 100) / 100;
      const { error } = await (supabase as any)
        .from("sales_quote_designs")
        .update({
          unit_price: roundedPrice,
          options_json: { ...optionsJson, manual_price_override: true },
        })
        .eq("id", designId);
      if (error) throw error;

      const quoteLineItems = (hasMultipleQuotes ? allGroupLineItems : lineItems).filter(
        (item) => item.quote_id === quoteId
      );
      const quoteDesigns = (hasMultipleQuotes ? allGroupDesigns : designs)
        .filter((design) => quoteLineItems.some((item) => item.id === design.line_item_id))
        .map((design) =>
          design.id === designId
            ? {
                ...design,
                unit_price: roundedPrice,
                options_json: { ...optionsJson, manual_price_override: true },
              }
            : design
        );

      const nextTotal = calculateControlledTotal(quoteLineItems, quoteDesigns, adminControls);
      const { error: quoteError } = await (supabase as any)
        .from("sales_quotes")
        .update({ total_amount: nextTotal })
        .eq("id", quoteId);
      if (quoteError) throw quoteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      toast.success("Line item price updated");
    },
  });

  const deleteContractLineItem = useMutation({
    mutationFn: async ({ quoteId, lineItemId }: { quoteId: string; lineItemId: string }) => {
      const { error } = await (supabase as any)
        .from("sales_quote_line_items")
        .delete()
        .eq("id", lineItemId);
      if (error) throw error;

      const sourceLineItems = hasMultipleQuotes ? allGroupLineItems : lineItems;
      const sourceDesigns = hasMultipleQuotes ? allGroupDesigns : designs;
      const remainingLineItems = sourceLineItems.filter(
        (item) => item.quote_id === quoteId && item.id !== lineItemId
      );
      const remainingDesigns = sourceDesigns.filter((design) =>
        remainingLineItems.some((item) => item.id === design.line_item_id)
      );
      const nextTotal = calculateControlledTotal(
        remainingLineItems,
        remainingDesigns,
        adminControls
      );
      const { error: quoteError } = await (supabase as any)
        .from("sales_quotes")
        .update({ total_amount: nextTotal })
        .eq("id", quoteId);
      if (quoteError) throw quoteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      toast.success("Line item deleted");
    },
  });

  const deleteContractDesign = useMutation({
    mutationFn: async ({ quoteId, designId }: { quoteId: string; designId: string }) => {
      const { error } = await (supabase as any)
        .from("sales_quote_designs")
        .delete()
        .eq("id", designId);
      if (error) throw error;

      const quoteLineItems = (hasMultipleQuotes ? allGroupLineItems : lineItems).filter(
        (item) => item.quote_id === quoteId
      );
      const remainingDesigns = (hasMultipleQuotes ? allGroupDesigns : designs).filter(
        (design) =>
          design.id !== designId && quoteLineItems.some((item) => item.id === design.line_item_id)
      );
      const nextTotal = calculateControlledTotal(quoteLineItems, remainingDesigns, adminControls);
      const { error: quoteError } = await (supabase as any)
        .from("sales_quotes")
        .update({ total_amount: nextTotal })
        .eq("id", quoteId);
      if (quoteError) throw quoteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.salesQuotes.detail(activeQuoteId || ""),
      });
      toast.success("Option deleted");
    },
  });

  // Calculate totals with admin controls
  const effectiveActiveDesigns = effectiveContractDesigns(lineItems, displayDesigns);
  const subtotal = calculateQuoteDesignSubtotal(lineItems, effectiveActiveDesigns.designs, {
    mode: effectiveActiveDesigns.selectionAware ? "authoritative_v2" : "legacy",
  });
  const totals = calculateQuoteTotalBreakdown(subtotal, adminControls);
  const totalAmount = totals.total;

  // Payment schedule
  const depositPercent = 50;
  const balancePercent = 50;
  const depositAmount = totalAmount * 0.5;
  const balanceAmount = totalAmount - depositAmount;
  const customerEmailNote = quote ? getQuoteEmailNote(quote) : "";

  const companyName = quote ? getAccountName(quote.account_id) : "805 Shutters";
  const headerInfo = quote ? CONTRACT_HEADERS[quote.account_id] : undefined;
  const contractLineItems = hasMultipleQuotes ? allGroupLineItems : lineItems;
  const contractDesigns = hasMultipleQuotes
    ? displayGroupDesigns
    : effectiveActiveDesigns.designs;
  const includesOnyxShutters = hasOnyxShutterProducts(contractLineItems, contractDesigns);
  const workmanshipWarrantyNumber = includesOnyxShutters ? 3 : 2;
  const serviceFeesNumber = workmanshipWarrantyNumber + 1;
  const claimsNumber = serviceFeesNumber + 1;
  const exclusionsNumber = claimsNumber + 1;

  if (!activeQuoteId || !quote) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Select or create a quote from the Dashboard.
      </div>
    );
  }

  if (designWritesPending) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Saving quote changes before loading contract...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto relative">
      {/* Admin Panel Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAdminPanelOpen(!adminPanelOpen)}
        className="sticky top-16 z-30 ml-auto flex shadow-lg"
      >
        <Eye className="h-4 w-4 mr-2" />
        Admin Controls
      </Button>

      {/* Admin Panel Sidebar */}
      {adminPanelOpen && (
        <div className="rounded-2xl border bg-background p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Admin Controls
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setAdminPanelOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Extra Fees */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Show Extra Fees</Label>
              <Switch
                checked={adminControls.showExtras}
                onCheckedChange={(v) => updateAdminControl("showExtras", v)}
              />
            </div>
            {adminControls.showExtras && (
              <div className="space-y-2">
                {adminControls.extraFees.map((fee) => (
                  <div key={fee.id} className="flex items-center gap-2">
                    <Input
                      placeholder="Fee name"
                      value={fee.name}
                      onChange={(e) => {
                        const updated = {
                          ...adminControls,
                          extraFees: adminControls.extraFees.map((f) =>
                            f.id === fee.id ? { ...f, name: e.target.value } : f
                          ),
                        };
                        setAdminControls(updated);
                        saveAdminControls(updated);
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={fee.amount}
                      onChange={(e) => {
                        const updated = {
                          ...adminControls,
                          extraFees: adminControls.extraFees.map((f) =>
                            f.id === fee.id ? { ...f, amount: parseFloat(e.target.value) || 0 } : f
                          ),
                        };
                        setAdminControls(updated);
                        saveAdminControls(updated);
                      }}
                      className="w-24"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeExtraFee(fee.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addExtraFee} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Fee
                </Button>
              </div>
            )}
          </div>

          {/* Discount */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Show Discount</Label>
              <Switch
                checked={adminControls.showDiscount}
                onCheckedChange={(v) => updateAdminControl("showDiscount", v)}
              />
            </div>
            {adminControls.showDiscount && (
              <div className="space-y-2">
                <Label>Discount %</Label>
                <Input
                  type="number"
                  value={adminControls.discountPercent}
                  onChange={(e) =>
                    updateAdminControl("discountPercent", parseFloat(e.target.value) || 0)
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={adminControls.discountPercent === 10 ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyDiscount(10)}
                  >
                    10% Off
                  </Button>
                  <Button
                    type="button"
                    variant={adminControls.discountPercent === 20 ? "default" : "outline"}
                    size="sm"
                    onClick={() => applyDiscount(20)}
                  >
                    20% Off
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyDiscount(0)}>
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Tax */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Show Tax</Label>
              <Switch
                checked={adminControls.showTax}
                onCheckedChange={(v) => updateAdminControl("showTax", v)}
              />
            </div>
            {adminControls.showTax && (
              <div className="space-y-1">
                <Label>Tax %</Label>
                <Input
                  type="number"
                  value={adminControls.taxPercent}
                  onChange={(e) =>
                    updateAdminControl("taxPercent", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            )}
          </div>

          {/* Payment Schedule */}
          <div className="space-y-3 border-t pt-3">
            <h4 className="font-medium">Payment Schedule</h4>
            <div className="text-sm text-muted-foreground">
              Fixed customer schedule: 50% deposit and 50% balance.
            </div>
          </div>
        </div>
      )}

      {/* Contract Header */}
      {headerInfo && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="grid gap-0 md:grid-cols-[240px_1fr]">
            <div className={cn("flex items-center justify-center p-6", headerInfo.logoPanelClass)}>
              <img
                src={headerInfo.logoUrl}
                alt={headerInfo.logoAlt}
                className="max-h-20 w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex flex-col justify-center border-t border-slate-200 p-6 md:border-l md:border-t-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Customer contract
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-wide uppercase text-gray-900">
                {headerInfo.title}
              </h1>
              <div className="mt-3 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:gap-4">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {headerInfo.phone}
                </span>
                <span className="hidden text-gray-300 sm:inline">|</span>
                <span className="flex items-center gap-1.5">
                  <LinkIcon className="h-3.5 w-3.5" />
                  {headerInfo.website}
                </span>
                <span className="hidden text-gray-300 sm:inline">|</span>
                <span className="flex items-center gap-1.5">{headerInfo.email}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Information */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Customer Information
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditingInfo(!editingInfo)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          {editingInfo ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  defaultValue={quote.customer_name}
                  onBlur={(e) => updateQuote.mutate({ customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  defaultValue={quote.customer_email || ""}
                  onBlur={(e) => updateQuote.mutate({ customer_email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  defaultValue={quote.customer_phone || ""}
                  onBlur={(e) => updateQuote.mutate({ customer_phone: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <AddressAutocomplete
                  inputAs={Input}
                  defaultValue={quote.customer_address || ""}
                  onBlur={(e) => updateQuote.mutate({ customer_address: e.target.value })}
                  onResolved={(address) =>
                    updateQuote.mutate({ customer_address: address.fullAddress })
                  }
                />
              </div>
              <div className="col-span-full space-y-1">
                <Label>Installer Notes</Label>
                <Input
                  defaultValue={quote.installer_notes || ""}
                  onBlur={(e) => updateQuote.mutate({ installer_notes: e.target.value })}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="font-medium">{quote.customer_name || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{quote.customer_email || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{quote.customer_phone || "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-medium">{quote.customer_address || "—"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quote Group Tabs */}
      {hasMultipleQuotes && (
        <div className="flex justify-center">
          <QuoteGroupTabs />
        </div>
      )}

      {/* Quote Summary — show each grouped quote */}
      {(hasMultipleQuotes ? groupQuotes : [quote]).map((gq) => {
        const color = getQuoteColor(gq.quote_letter || "A");
        const gqLineItems = hasMultipleQuotes
          ? allGroupLineItems.filter((li) => li.quote_id === gq.id)
          : lineItems;
        const rawGqDesigns = hasMultipleQuotes
          ? displayGroupDesigns.filter((d) => gqLineItems.some((li) => li.id === d.line_item_id))
          : displayDesigns;
        const effectiveGqDesigns = effectiveContractDesigns(gqLineItems, rawGqDesigns);
        const gqDesigns = effectiveGqDesigns.designs;
        const gqSubtotal = calculateQuoteDesignSubtotal(gqLineItems, gqDesigns, {
          mode: effectiveGqDesigns.selectionAware ? "authoritative_v2" : "legacy",
        });
        const gqTotals = calculateQuoteTotalBreakdown(gqSubtotal, adminControls);
        const gqDiscountAmt = gqTotals.discountAmount;
        const gqTaxAmt = gqTotals.taxAmount;
        const gqTotal = gqTotals.total;

        return (
          <Card
            key={gq.id}
            className={cn(hasMultipleQuotes && `border-l-4`)}
            style={hasMultipleQuotes ? { borderLeftColor: color.hex } : undefined}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {hasMultipleQuotes && (
                  <span
                    className={`w-7 h-7 rounded-full ${color.bg} text-white flex items-center justify-center text-xs font-black`}
                  >
                    {gq.quote_letter}
                  </span>
                )}
                <FileText className="h-5 w-5" />
                {hasMultipleQuotes ? `Quote ${gq.quote_letter}` : "Quote Summary"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gqLineItems.map((item) => {
                const itemDesigns = gqDesigns.filter((d) => d.line_item_id === item.id);
                const itemTotal = calculateLineItemDesignTotal(item, itemDesigns, {
                  mode: effectiveGqDesigns.selectionAware ? "authoritative_v2" : "legacy",
                });
                const productImage = getCustomerLineItemProductImage(item);
                const itemDimensions = formatDimensionsOrNull(item);
                return (
                  <div key={item.id} className="p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-4">
                        {productImage && (
                          <div className="hidden h-24 w-28 shrink-0 overflow-hidden rounded-xl border bg-white shadow-sm sm:block">
                            <img
                              src={productImage.imageUrl}
                              alt={productImage.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold">{item.room_name}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
                              {customerQuoteProductName(item.product_type)}
                            </span>
                            {itemDimensions ? (
                              <span className="font-mono">{itemDimensions}</span>
                            ) : (
                              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Size missing - add in Builder
                              </span>
                            )}
                            {item.quantity > 1 && <span>x{item.quantity}</span>}
                          </div>
                          {productImage && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Product image: {productImage.title}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-lg font-bold">
                          ${itemTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          title="Delete line item"
                          disabled={deleteContractLineItem.isPending}
                          onClick={() => {
                            if (!window.confirm(`Delete ${item.room_name || "this line item"}?`)) {
                              return;
                            }
                            deleteContractLineItem.mutate({ quoteId: gq.id, lineItemId: item.id });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {itemDesigns.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {itemDesigns.map((design) => {
                          const details = quoteProductDetails("", getQuoteDesignDetails(design).map(
                            (detail) => `${detail.label}: ${detail.value}`,
                          ));
                          return (
                            <div key={design.id} className="rounded-lg border bg-background p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Option {customerQuoteText(design.variant) || "A"}
                                </p>
                                <div className="flex items-center gap-1">
                                  <EditableContractPrice
                                    value={design.unit_price}
                                    disabled={
                                      updateDesignPrice.isPending || deleteContractDesign.isPending
                                    }
                                    onSave={(unitPrice) =>
                                      updateDesignPrice.mutate({
                                        quoteId: gq.id,
                                        designId: design.id,
                                        unitPrice,
                                        optionsJson: design.options_json || {},
                                      })
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    title={`Delete option ${design.variant || "A"}`}
                                    aria-label={`Delete option ${design.variant || "A"}`}
                                    disabled={deleteContractDesign.isPending}
                                    onClick={() => {
                                      const label = `Option ${design.variant || "A"}`;
                                      if (!window.confirm(`Delete ${label} from this contract?`)) {
                                        return;
                                      }
                                      deleteContractDesign.mutate({
                                        quoteId: gq.id,
                                        designId: design.id,
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              {details.length > 0 && (
                                <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2">
                                  {details.map((detail) => (
                                    <div key={`${design.id}-${detail.label}`} className="min-w-0">
                                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {detail.label}
                                      </dt>
                                      <dd className="text-xs break-words">{detail.value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {gqLineItems.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4">
                  No items in this quote yet.
                </div>
              )}

              {/* Pricing Breakdown */}
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">
                    ${gqSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {adminControls.showExtras &&
                  adminControls.extraFees.map((fee) => (
                    <div key={fee.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{customerQuoteText(fee.name) || "Additional fee"}</span>
                      <span className="font-medium">
                        ${fee.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}

                {adminControls.showDiscount && (
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Discount ({adminControls.discountPercent}%)</span>
                    <span className="font-medium">
                      -${gqDiscountAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {adminControls.showTax && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax ({adminControls.taxPercent}%)</span>
                    <span className="font-medium">
                      ${gqTaxAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                <div
                  className="flex justify-between text-lg font-bold border-t pt-2"
                  style={hasMultipleQuotes ? { color: color.hex } : undefined}
                >
                  <span>{hasMultipleQuotes ? `Quote ${gq.quote_letter} Total` : "Total"}</span>
                  <span>${gqTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Payment */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="text-muted-foreground">Remaining</span>
          </div>
          <div className="flex justify-between items-center px-3">
            <span className="text-2xl font-bold text-emerald-600">
              $
              {(quote.deposit_paid + quote.balance_paid).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </span>
            <span className="text-2xl font-bold text-orange-600">
              $
              {Math.max(0, totalAmount - quote.deposit_paid - quote.balance_paid).toLocaleString(
                "en-US",
                { minimumFractionDigits: 2 }
              )}
            </span>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex justify-between">
            <span>{depositPercent}% Deposit:</span>
            <span className="font-bold">
              ${depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Payment Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">{depositPercent}% Deposit</p>
                <p className="text-lg font-bold">
                  ${depositAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3 border rounded-lg">
                <p className="text-sm font-medium">{balancePercent}% Balance</p>
                <p className="text-lg font-bold">
                  ${balanceAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-3">Payment Method</p>
            <div className="grid grid-cols-5 gap-2">
              {PAYMENT_METHODS.map((method) => {
                const Icon = paymentIcons[method.id] || FileText;
                return (
                  <button
                    key={method.id}
                    onClick={() => updateQuote.mutate({ payment_method: method.id })}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border text-sm transition-all",
                      quote.payment_method === method.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs">{method.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warranty */}
      <Card>
        <CardHeader>
          <CardTitle>Warranty, Service & Lifetime Service Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="manufacturer">
              <AccordionTrigger>1. Manufacturer Product Warranty</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  All products sold by {companyName} are covered by the manufacturer's warranty,
                  which may include a lifetime or limited warranty against defects in materials and
                  workmanship, as defined by the manufacturer.
                </p>
              </AccordionContent>
            </AccordionItem>
            {includesOnyxShutters && (
              <AccordionItem value="onyx-shutters">
                <AccordionTrigger>2. Shutter Manufacturer Warranty</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Your shutters include manufacturer warranty coverage for the
                    original purchaser when the shutters are properly installed, properly operated,
                    and properly maintained.
                  </p>
                  <div>
                    <p className="font-semibold text-foreground">Manufacturer warranty coverage:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Limited lifetime warranty on shutter mechanisms.</li>
                      <li>7-year warranty on paint color fastness.</li>
                      <li>7-year warranty against warping and cracking.</li>
                      <li>2-year warranty on color fastness for stained wood shutters.</li>
                    </ul>
                  </div>
                  <p>
                    Warranty coverage begins from the original date of purchase and applies to the
                    original purchaser.
                  </p>
                  <div>
                    <p className="font-semibold text-foreground">Manufacturer exclusions:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Improper installation, operation, or maintenance.</li>
                      <li>Abuse, misuse, customer-performed repairs, accidents, or alterations.</li>
                      <li>Acts of God and normal wear and tear.</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Color matching:</p>
                    <p className="mt-2">
                      Custom color matches and color matches between separate orders are not
                      guaranteed due to material, finish, dye lot, and production variations. Once a
                      custom color sample has been approved, resulting color variation is not covered
                      by the manufacturer warranty.
                    </p>
                  </div>
                  <p>
                    If a warranty concern arises, please contact {companyName}. We will review the
                    concern, request photos if needed, and help coordinate the claim process with
                    the manufacturer. Manufacturer warranty approval, repair, replacement, or remake
                    decisions are subject to the manufacturer's review and warranty terms.
                  </p>
                </AccordionContent>
              </AccordionItem>
            )}
            <AccordionItem value="workmanship">
              <AccordionTrigger>
                {workmanshipWarrantyNumber}. {companyName} Installation Workmanship Warranty (First
                12 Months)
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <p>
                  {companyName} warrants all installation workmanship for 12 months from the date of
                  installation. During this period, we will address any issues related to our
                  installation at no additional cost.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="service-fees">
              <AccordionTrigger>
                {serviceFeesNumber}. Service & Labor Fees (After 12 Months)
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <p>
                  After the 12-month workmanship warranty period, service calls and labor for
                  repairs, adjustments, or reinstallation will be subject to standard service fees.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="claims">
              <AccordionTrigger>{claimsNumber}. Warranty Claim & Service Process</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <p>
                  To initiate a warranty claim or service request, please contact {companyName}. We
                  will coordinate with the manufacturer as needed to resolve your issue.
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="exclusions">
              <AccordionTrigger>{exclusionsNumber}. Exclusions & Limitations</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                <p>
                  Warranties do not cover damage caused by normal wear and tear, misuse, abuse,
                  accidents, alterations, improper maintenance, or environmental exposure.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <p className="text-xs text-muted-foreground italic mt-4">
            By proceeding with this contract, you acknowledge that you have read and agree to the
            warranty and service terms outlined above.
          </p>
        </CardContent>
      </Card>

      {/* Customer Email Note */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Email Note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="customer-email-note">Message shown in the quote email</Label>
          <textarea
            id="customer-email-note"
            defaultValue={customerEmailNote}
            onBlur={(e) =>
              updateQuote.mutate({
                installer_notes: buildQuoteInstallerNotesMeta(quote, {
                  __customerEmailNote: e.target.value.trim(),
                }),
              })
            }
            placeholder="Example: Hi Sarah, I included the Honeycomb option we discussed for the office. Let me know if you want to compare blackout fabric."
            className="min-h-[96px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            This note is customer-facing and appears near the top of the email.
          </p>
        </CardContent>
      </Card>

      {/* Customer Signature */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Signed By</Label>
            <Input
              defaultValue={quote.customer_printed_name || quote.customer_name || ""}
              onBlur={(e) => updateQuote.mutate({ customer_printed_name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            3 business days cancellation period per California law
          </p>
          <div className="p-3 bg-muted/30 rounded-lg text-sm">
            By signing below, you confirm that the contact information shown above is accurate and
            authorize {companyName} to contact you at these email/phone numbers regarding your
            order.
          </div>
          <SignaturePad
            label="Sign here"
            onSignatureChange={(dataUrl) => updateQuote.mutate({ customer_signature: dataUrl })}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSendDialog(true)}>
            <Send className="h-4 w-4 mr-2" />
            Send Quote
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const link = `${window.location.origin}/quote/${quote.share_token}`;
              navigator.clipboard.writeText(link);
              toast.success("Shareable link copied to clipboard");
            }}
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            Copy Share Link
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="technical-measure-decision" className="sr-only">
            Technical measure decision
          </Label>
          <select
            id="technical-measure-decision"
            value={measureDecision}
            onChange={(event) => setMeasureDecision(event.target.value as TechnicalMeasureDecision | "")}
            disabled={markAsSold.isPending}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Technical measure?</option>
            <option value="needed">Measure needed</option>
            <option value="not_needed">No measure needed</option>
          </select>
          <Button
            size="lg"
            onClick={() => markAsSold.mutate()}
            disabled={markAsSold.isPending || !measureDecision}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            {quote.status === "sold" ? "Retry Sold Handoff" : "Mark as Sold"}
          </Button>
        </div>
      </div>

      <SendQuoteDialog
        open={showSendDialog}
        onClose={() => setShowSendDialog(false)}
        quote={quote}
      />
    </div>
  );
}

function EditableContractPrice({
  value,
  disabled,
  onSave,
}: {
  value: number;
  disabled?: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || 0));

  useEffect(() => {
    if (!editing) setDraft(String(value || 0));
  }, [editing, value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditing(false);
      setDraft(String(value || 0));
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    if (rounded !== value) onSave(rounded);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={draft}
          autoFocus
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === "Escape") {
              setEditing(false);
              setDraft(String(value || 0));
            }
          }}
          className="h-8 w-28 text-right text-sm font-bold tabular-nums"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setEditing(true)}
      className="rounded-md px-2 py-1 text-sm font-bold tabular-nums hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      title="Click to edit line item price"
    >
      {formatCurrency(value)}
    </button>
  );
}

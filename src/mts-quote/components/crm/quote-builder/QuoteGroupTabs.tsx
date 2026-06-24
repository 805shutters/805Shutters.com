/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { useQuoteBuilderStore } from "@mts/stores/quoteBuilderStore";
import { getQuoteColor, QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import { Button } from "@mts/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@mts/components/ui/dropdown-menu";
import { Plus, Copy, FilePlus, Trash2 } from "lucide-react";
import { cn } from "@mts/lib/utils";
import { toast } from "sonner";
import type { SalesQuote } from "@mts/types/quote";

export function QuoteGroupTabs() {
  const { activeQuoteId, setActiveQuote } = useQuoteBuilderStore();
  const queryClient = useQueryClient();

  // Fetch the active quote to get its group
  const { data: activeQuote } = useQuery({
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

  // Fetch all quotes in the same group
  const groupId = activeQuote?.quote_group_id;
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

  // Add a new blank quote to the group
  const addBlankQuote = useMutation({
    mutationFn: async () => {
      if (!activeQuote) throw new Error("No active quote");
      const nextLetter = String.fromCharCode(65 + groupQuotes.length); // A=65
      const account =
        QUOTE_ACCOUNTS.find((a) => a.id === activeQuote.account_id) || QUOTE_ACCOUNTS[0];

      const { data: quoteNumber, error: numError } = await (supabase as any).rpc(
        "next_quote_number",
        { account_prefix: account.prefix }
      );
      if (numError) throw numError;

      const { data: session } = await supabase.auth.getSession();

      const { data, error } = await (supabase as any)
        .from("sales_quotes")
        .insert({
          quote_number: quoteNumber,
          account_id: activeQuote.account_id,
          customer_name: activeQuote.customer_name,
          customer_email: activeQuote.customer_email,
          customer_phone: activeQuote.customer_phone,
          customer_address: activeQuote.customer_address,
          appointment_date: activeQuote.appointment_date,
          quote_group_id: groupId,
          quote_letter: nextLetter,
          created_by: session?.session?.user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as SalesQuote;
    },
    onSuccess: (newQuote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.all, "group", groupId],
      });
      setActiveQuote(newQuote.id);
      toast.success(`Quote ${newQuote.quote_letter} added`);
    },
  });

  // Copy current quote (with all line items + designs) into the group
  const copyToGroup = useMutation({
    mutationFn: async () => {
      if (!activeQuote) throw new Error("No active quote");
      const nextLetter = String.fromCharCode(65 + groupQuotes.length);
      const account =
        QUOTE_ACCOUNTS.find((a) => a.id === activeQuote.account_id) || QUOTE_ACCOUNTS[0];

      const { data: quoteNumber, error: numError } = await (supabase as any).rpc(
        "next_quote_number",
        { account_prefix: account.prefix }
      );
      if (numError) throw numError;

      const { data: session } = await supabase.auth.getSession();

      // Create the new quote
      const { data: newQuote, error: insertErr } = await (supabase as any)
        .from("sales_quotes")
        .insert({
          quote_number: quoteNumber,
          account_id: activeQuote.account_id,
          customer_name: activeQuote.customer_name,
          customer_email: activeQuote.customer_email,
          customer_phone: activeQuote.customer_phone,
          customer_address: activeQuote.customer_address,
          appointment_date: activeQuote.appointment_date,
          installer_notes: activeQuote.installer_notes,
          quote_group_id: groupId,
          quote_letter: nextLetter,
          created_by: session?.session?.user?.id || null,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      // Copy line items
      const { data: lineItems } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .eq("quote_id", activeQuote.id)
        .order("sort_order");

      if (lineItems && lineItems.length > 0) {
        const newItems = lineItems.map((item: any) => ({
          quote_id: newQuote.id,
          room_name: item.room_name,
          product_type: item.product_type,
          width_whole: item.width_whole,
          width_fraction: item.width_fraction,
          height_whole: item.height_whole,
          height_fraction: item.height_fraction,
          quantity: item.quantity,
          sort_order: item.sort_order,
        }));

        const { data: insertedItems } = await (supabase as any)
          .from("sales_quote_line_items")
          .insert(newItems)
          .select();

        // Copy designs for each line item
        if (insertedItems) {
          for (let i = 0; i < lineItems.length; i++) {
            const { data: designs } = await (supabase as any)
              .from("sales_quote_designs")
              .select("*")
              .eq("line_item_id", lineItems[i].id);

            if (designs && designs.length > 0) {
              const newDesigns = designs.map((d: any) => ({
                line_item_id: insertedItems[i].id,
                variant: d.variant,
                product_type: d.product_type,
                supplier: d.supplier,
                material: d.material,
                louver_size: d.louver_size,
                tilt_type: d.tilt_type,
                hinge_color: d.hinge_color,
                panel_config: d.panel_config,
                mount_type: d.mount_type,
                shade_type: d.shade_type,
                lift_system: d.lift_system,
                valance: d.valance,
                fabric: d.fabric,
                motor_type: d.motor_type,
                remote_type: d.remote_type,
                hard_surface_install: d.hard_surface_install,
                ladder_over_15ft: d.ladder_over_15ft,
                requires_takedown: d.requires_takedown,
                unit_price: d.unit_price,
                notes: d.notes,
                options_json: d.options_json,
              }));
              await (supabase as any).from("sales_quote_designs").insert(newDesigns);
            }
          }
        }
      }

      return newQuote as SalesQuote;
    },
    onSuccess: (newQuote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.all, "group", groupId],
      });
      setActiveQuote(newQuote.id);
      toast.success(
        `Quote ${newQuote.quote_letter} created (copied from ${activeQuote?.quote_letter})`
      );
    },
  });

  // Delete a quote from the group
  const deleteFromGroup = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await (supabase as any).from("sales_quotes").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.salesQuotes.all, "group", groupId],
      });
      // Switch to first remaining quote
      const remaining = groupQuotes.filter((q) => q.id !== activeQuoteId);
      if (remaining.length > 0) {
        setActiveQuote(remaining[0].id);
      }
      toast.success("Quote option removed");
    },
  });

  if (!activeQuoteId || !activeQuote) return null;

  // Only show if there's a group (always true with new migration)
  const showTabs = groupQuotes.length > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showTabs &&
        groupQuotes.map((q) => {
          const color = getQuoteColor(q.quote_letter || "A");
          const isActive = q.id === activeQuoteId;

          return (
            <div key={q.id} className="relative group">
              <button
                onClick={() => setActiveQuote(q.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border-2",
                  isActive
                    ? `${color.bg} text-white ${color.border} shadow-lg ring-2 ${color.ring}`
                    : `bg-white ${color.border} ${color.text} hover:shadow-md`
                )}
              >
                <span
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-black",
                    isActive ? "bg-white/30 text-white" : `${color.light} ${color.text}`
                  )}
                >
                  {q.quote_letter || "A"}
                </span>
                Quote {q.quote_letter || "A"}
              </button>
              {/* Delete button for non-first quotes */}
              {groupQuotes.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFromGroup.mutate(q.id);
                  }}
                  className="absolute -top-1.5 -right-1.5 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-red-500 text-white text-xs shadow-md hover:bg-red-600"
                  title={`Remove Quote ${q.quote_letter}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

      {/* Add new quote dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-dashed border-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Quote
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => addBlankQuote.mutate()}>
            <FilePlus className="h-4 w-4 mr-2" />
            New Blank Quote
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyToGroup.mutate()}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Current Quote
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

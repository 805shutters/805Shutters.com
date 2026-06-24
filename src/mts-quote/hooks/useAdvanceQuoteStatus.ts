/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { toast } from "sonner";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import { getNextStatus, getStatusLabel, STATUS_TIMESTAMP_COLUMN } from "@mts/lib/quoteStatus";
import { getCurrentQuoteSalesOwnerPatch } from "@mts/lib/quoteSalesOwnerSupabase";
import { send805SoldQuoteNotification } from "@mts/lib/quoteSoldNotification";
import type { QuoteStatus } from "@mts/types/quote";

interface AdvanceArgs {
  quoteId: string;
  /**
   * Current status — used to compute the next state. If omitted we'll look
   * it up from the DB first.
   */
  fromStatus?: QuoteStatus;
  /**
   * Skip to a specific status instead of the next one. Used by integration
   * events (manufacturer email → ordered, COD collected → installed).
   */
  toStatus?: QuoteStatus;
  /**
   * Silence the success toast. Used when advancing is a side-effect of
   * another action (e.g. email send).
   */
  silent?: boolean;
}

/**
 * Shared mutation for moving a quote forward in its lifecycle.
 *
 * Always writes both `status` and the matching timestamp column
 * (`sent_at`, `ordered_at`, etc.) in a single update so the dashboard
 * can show "when did this move to X".
 */
export function useAdvanceQuoteStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ quoteId, fromStatus, toStatus, silent: _silent }: AdvanceArgs) => {
      // Resolve the target status
      let target = toStatus;
      let currentQuote: {
        status: QuoteStatus;
        account_id: string | null;
        sales_owner: string | null;
      } | null = null;

      const needsCurrentQuote = !target || target === "sold";
      if (needsCurrentQuote) {
        const { data, error } = await (supabase as any)
          .from("sales_quotes")
          .select("status, account_id, sales_owner")
          .eq("id", quoteId)
          .single();
        if (error) throw error;
        currentQuote = data as {
          status: QuoteStatus;
          account_id: string | null;
          sales_owner: string | null;
        };
      }

      if (!target) {
        const current = fromStatus || currentQuote?.status;
        if (!current) throw new Error("Unable to resolve current quote status");
        const next = getNextStatus(current);
        if (!next) {
          throw new Error(`Cannot advance from "${current}" — terminal state`);
        }
        target = next;
      }

      // Build the patch: status + its timestamp column (if any)
      const patch: Record<string, unknown> = { status: target };
      const tsColumn = STATUS_TIMESTAMP_COLUMN[target];
      if (tsColumn) {
        patch[tsColumn] = new Date().toISOString();
      }
      if (
        target === "sold" &&
        currentQuote?.account_id === ACCOUNT_IDS.SHUTTERS_805 &&
        !currentQuote.sales_owner
      ) {
        Object.assign(patch, (await getCurrentQuoteSalesOwnerPatch()) || {});
      }

      const { error } = await (supabase as any)
        .from("sales_quotes")
        .update(patch)
        .eq("id", quoteId);
      if (error) throw error;

      return { quoteId, status: target };
    },
    onSuccess: ({ quoteId, status }, { silent }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      if (status === "sold") {
        void send805SoldQuoteNotification({ supabaseClient: supabase as any, quoteId }).catch(
          (error: Error) => {
            toast.error(error.message || "Sold status saved, but sold SMS failed");
          }
        );
      }
      if (!silent) {
        toast.success(`Moved to ${getStatusLabel(status)}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });
}

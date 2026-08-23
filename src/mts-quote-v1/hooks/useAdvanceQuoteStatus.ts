/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts-v1/integrations/supabase/client";
import { queryKeys } from "@mts-v1/lib/queryKeys";
import { toast } from "sonner";
import { getNextStatus, getStatusLabel, STATUS_TIMESTAMP_COLUMN } from "@mts-v1/lib/quoteStatus";
import type { QuoteStatus } from "@mts-v1/types/quote";

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
      } | null = null;

      const needsCurrentQuote = !target;
      if (needsCurrentQuote) {
        const { data, error } = await (supabase as any)
          .from("sales_quotes")
          .select("status")
          .eq("id", quoteId)
          .single();
        if (error) throw error;
        currentQuote = data as {
          status: QuoteStatus;
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

      if (target === "sold") {
        throw new Error(
          "Use the contract Mark as Sold workflow so the installer handoff and technical-measure decision cannot be skipped.",
        );
      }

      // Build the patch: status + its timestamp column (if any)
      const patch: Record<string, unknown> = { status: target };
      const tsColumn = STATUS_TIMESTAMP_COLUMN[target];
      if (tsColumn) {
        patch[tsColumn] = new Date().toISOString();
      }
      const { error } = await (supabase as any)
        .from("sales_quotes")
        .update(patch)
        .eq("id", quoteId);
      if (error) throw error;

      return { quoteId, status: target };
    },
    onSuccess: ({ status }, { silent }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      if (!silent) {
        toast.success(`Moved to ${getStatusLabel(status)}`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update status");
    },
  });
}

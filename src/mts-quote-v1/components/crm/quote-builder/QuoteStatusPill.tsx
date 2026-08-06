import { cn } from "@mts-v1/lib/utils";
import { Button } from "@mts-v1/components/ui/button";
import { ChevronRight } from "lucide-react";
import { getStatusColor, getStatusLabel, getNextStatus, getAdvanceLabel } from "@mts-v1/lib/quoteStatus";
import { useAdvanceQuoteStatus } from "@mts-v1/hooks/useAdvanceQuoteStatus";
import type { QuoteStatus } from "@mts-v1/types/quote";

interface QuoteStatusPillProps {
  status: QuoteStatus;
  quoteId: string;
  /**
   * When true, show the "Advance to next stage" button beside the pill.
   * Off by default to keep table rows compact — turn on from the row hover
   * or a full-size quote view.
   */
  showAdvance?: boolean;
  /**
   * Compact sizing for table rows.
   */
  size?: "sm" | "md";
  className?: string;
}

export function QuoteStatusPill({
  status,
  quoteId,
  showAdvance = false,
  size = "sm",
  className,
}: QuoteStatusPillProps) {
  const advance = useAdvanceQuoteStatus();
  const nextStatus = getNextStatus(status);
  const advanceLabel = getAdvanceLabel(status);

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-medium capitalize",
          size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
          getStatusColor(status)
        )}
      >
        {getStatusLabel(status)}
      </span>

      {showAdvance && nextStatus && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            advance.mutate({ quoteId, fromStatus: status });
          }}
          disabled={advance.isPending}
          title={advanceLabel}
        >
          {advanceLabel}
          <ChevronRight className="h-3 w-3 ml-0.5" />
        </Button>
      )}
    </div>
  );
}

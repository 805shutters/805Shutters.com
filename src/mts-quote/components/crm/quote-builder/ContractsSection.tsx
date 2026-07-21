import { useState } from "react";
import { ChevronDown, ChevronUp, FileSignature, Eye, MessageSquareText } from "lucide-react";
import { Badge } from "@mts/components/ui/badge";
import { Button } from "@mts/components/ui/button";
import { cn } from "@mts/lib/utils";
import { format } from "date-fns";
import { getQuoteStatsStatus } from "@mts/lib/quoteDashboardFilters";
import { getStatusColor, getStatusLabel } from "@mts/lib/quoteStatus";
import type { QuoteTableRow } from "./QuotesTable";

interface ContractsSectionProps {
  quotes: QuoteTableRow[];
  onOpenContract: (quote: QuoteTableRow) => void;
}

export function ContractsSection({ quotes, onOpenContract }: ContractsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const unsoldContracts = quotes.filter((q) => {
    const status = getQuoteStatsStatus(q);
    return status === "draft" || status === "sent";
  });

  const soldContracts = quotes.filter((q) => {
    const status = getQuoteStatsStatus(q);
    return status === "sold" || status === "ordered" || status === "received" || status === "installed";
  });

  const totalContracts = unsoldContracts.length + soldContracts.length;

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      {/* Header — clickable to expand/collapse */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileSignature className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Contracts</h2>
          <Badge variant="secondary" className="text-xs">
            {totalContracts}
          </Badge>
        </div>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="border-t">
          {/* Unsold Contracts */}
          <div className="p-4 border-b">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Unsold Contracts ({unsoldContracts.length})
            </h3>
            {unsoldContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No unsold contracts</p>
            ) : (
              <div className="space-y-2">
                {unsoldContracts.map((quote) => (
                  <ContractRow
                    key={quote.id}
                    quote={quote}
                    onOpen={() => onOpenContract(quote)}
                    variant="unsold"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sold Contracts */}
          <div className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Sold Contracts ({soldContracts.length})
            </h3>
            {soldContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No sold contracts yet</p>
            ) : (
              <div className="space-y-2">
                {soldContracts.map((quote) => (
                  <ContractRow
                    key={quote.id}
                    quote={quote}
                    onOpen={() => onOpenContract(quote)}
                    variant="sold"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractRow({
  quote,
  onOpen,
  variant,
}: {
  quote: QuoteTableRow;
  onOpen: () => void;
  variant: "unsold" | "sold";
}) {
  const status = getQuoteStatsStatus(quote);
  const totalAmount = Number(quote.total_amount) || 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50",
        variant === "sold" ? "border-emerald-200 dark:border-emerald-800/50" : "border-border"
      )}
      onClick={onOpen}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-mono text-muted-foreground">{quote.quote_number}</span>
        <div>
          <p className="font-medium text-sm">{quote.customer_name || "—"}</p>
          {quote.customer_address && (
            <p className="text-xs text-muted-foreground">{quote.customer_address}</p>
          )}
          {quote.generalJobNote && (
            <p className="mt-1 flex max-w-lg items-start gap-1.5 text-xs text-amber-800">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{quote.generalJobNote}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {quote.appointment_date && (
          <span className="text-xs text-muted-foreground">
            {format(new Date(quote.appointment_date + "T00:00:00"), "MMM d, yyyy")}
          </span>
        )}
        <span className="text-sm font-semibold">
          {totalAmount > 0
            ? `$${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
            : "—"}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            getStatusColor(status)
          )}
        >
          {getStatusLabel(status)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
          View
        </Button>
      </div>
    </div>
  );
}

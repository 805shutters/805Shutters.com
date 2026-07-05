import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mts/components/ui/table";
import { Button } from "@mts/components/ui/button";
import { Copy, ExternalLink, Images, Trash2 } from "lucide-react";
import type { SalesQuote } from "@mts/types/quote";
import { format } from "date-fns";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { getQuoteStatsStatus, type QuoteStatsSource } from "@mts/lib/quoteDashboardFilters";

export type QuoteTableRow = QuoteStatsSource & {
  quote_number?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  source?: "sales" | "crm";
  sourceQuoteId?: string | null;
  salesQuote?: SalesQuote;
};

interface QuotesTableProps {
  quotes: QuoteTableRow[];
  isLoading: boolean;
  onOpen: (quote: QuoteTableRow) => void;
  onPortfolio: (quote: QuoteTableRow) => void;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  title?: string;
}

export function QuotesTable({
  quotes,
  isLoading,
  onOpen,
  onPortfolio,
  onCopy,
  onDelete,
  title = "Quotes",
}: QuotesTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">
        Loading quotes...
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">
        No quotes in this view.
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {quotes.length} quote{quotes.length === 1 ? "" : "s"}
        </span>
      </div>
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead>Quote #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((quote) => {
            const isHovered = hoveredId === quote.id;
            const isCrmQuote = quote.source === "crm";
            const salesQuoteId = quote.sourceQuoteId || quote.id;
            const totalAmount = Number(quote.total_amount) || 0;
            const status = getQuoteStatsStatus(quote);
            return (
              <TableRow
                key={quote.id}
                className="cursor-pointer hover:bg-muted/50"
                onMouseEnter={() => setHoveredId(quote.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onOpen(quote)}
              >
                <TableCell className="font-mono text-sm">{quote.quote_number}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{quote.customer_name || "—"}</p>
                    {quote.customer_address && (
                      <p className="text-xs text-muted-foreground">{quote.customer_address}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {quote.appointment_date
                    ? format(new Date(quote.appointment_date + "T00:00:00"), "MMM d")
                    : "—"}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {totalAmount > 0
                    ? `$${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <QuoteStatusPill
                    status={status}
                    quoteId={salesQuoteId}
                    showAdvance={!isCrmQuote && isHovered}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isCrmQuote ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(quote);
                        }}
                        title="Open quote"
                      >
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        Open
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPortfolio(quote);
                          }}
                          title="Open portfolio"
                        >
                          <Images className="mr-1.5 h-4 w-4" />
                          Portfolio
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopy(salesQuoteId);
                          }}
                          title="Copy quote"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            const label = quote.quote_number || quote.customer_name || "this quote";
                            if (!window.confirm(`Delete quote ${label}? This cannot be undone.`)) {
                              return;
                            }
                            onDelete(salesQuoteId);
                          }}
                          title="Delete quote"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

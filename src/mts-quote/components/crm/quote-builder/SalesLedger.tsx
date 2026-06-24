import { useMemo, useState } from "react";
import { cn } from "@mts/lib/utils";
import { Button } from "@mts/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@mts/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mts/components/ui/select";
import { Download, Crown, Package } from "lucide-react";
import { format } from "date-fns";
import { buildLedger, formatMoney, sumLedger, type LedgerRow } from "@mts/lib/salesLedger";
import { STATUS_COLORS } from "@mts/lib/quoteStatus";
import type { SalesQuote, QuoteStatus } from "@mts/types/quote";

type LedgerStatusFilter = "all" | "open" | QuoteStatus;

interface SalesLedgerProps {
  quotes: SalesQuote[];
  /**
   * When true, disables the link-to-quote interaction (e.g. embedded in a
   * read-only view).
   */
  onOpenQuote?: (quote: SalesQuote) => void;
}

export function SalesLedger({ quotes, onOpenQuote }: SalesLedgerProps) {
  const [statusFilter, setStatusFilter] = useState<LedgerStatusFilter>("all");

  const quotesById = useMemo(() => {
    const map = new Map<string, SalesQuote>();
    quotes.forEach((q) => map.set(q.id, q));
    return map;
  }, [quotes]);

  // Build base ledger (sold → installed range), then apply status filter
  const allRows = useMemo(() => buildLedger(quotes), [quotes]);

  const rows = useMemo(() => {
    if (statusFilter === "all") return allRows;
    if (statusFilter === "open") {
      return allRows.filter((r) => r.status !== "installed");
    }
    return allRows.filter((r) => r.status === statusFilter);
  }, [allRows, statusFilter]);

  const totals = useMemo(() => sumLedger(rows), [rows]);

  function handleExportCsv() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="bg-card border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-gradient-to-br from-slate-50 to-white">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-[#0b0b0b]" />
            Sales Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every sold quote — gross, COGS, commission, profit, status
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as LedgerStatusFilter)}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open (not complete)</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
              <SelectItem value="ordered">Ordered</SelectItem>
              <SelectItem value="received">Install</SelectItem>
              <SelectItem value="installed">Complete</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          No ledger rows in this view. Once a customer signs a quote, it will appear here.
        </div>
      ) : (
        <>
          <div className="grid gap-3 p-3 xl:hidden">
            {rows.map((row) => (
              <LedgerRowCard
                key={row.id}
                row={row}
                onOpen={
                  onOpenQuote
                    ? () => {
                        const q = quotesById.get(row.id);
                        if (q) onOpenQuote(q);
                      }
                    : undefined
                }
              />
            ))}
            <LedgerTotalsCard totals={totals} />
          </div>
          <div className="hidden xl:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 text-slate-700">
                  <TableHead className="min-w-[160px]">Customer</TableHead>
                  <TableHead className="whitespace-nowrap">Date Sold</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Gross Sale</TableHead>
                  <TableHead className="text-right whitespace-nowrap">COGS</TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <Crown className="h-3 w-3 text-amber-500" /> Owner 10%
                    </span>
                  </TableHead>
                  <TableHead className="text-right whitespace-nowrap">Deposit</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Balance</TableHead>
                  <TableHead className="whitespace-nowrap">Pay Method</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Net Profit</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <LedgerRowCells
                    key={row.id}
                    row={row}
                    onOpen={
                      onOpenQuote
                        ? () => {
                            const q = quotesById.get(row.id);
                            if (q) onOpenQuote(q);
                          }
                        : undefined
                    }
                  />
                ))}
              </TableBody>

              {/* Totals footer */}
              <TableFooter>
                <TableRow className="bg-slate-100 font-bold text-slate-900">
                  <TableCell colSpan={2} className="tabular-nums">
                    {totals.rows} row{totals.rows === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totals.grossSale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totals.costOfGoods)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">
                    {formatMoney(totals.ownerCommission)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totals.depositPaid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(totals.balance)}
                  </TableCell>
                  <TableCell />
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      totals.netProfit > 0 ? "text-emerald-700" : "text-rose-700"
                    )}
                  >
                    {formatMoney(totals.netProfit)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}

// ---------- Row ----------

function LedgerRowCells({ row, onOpen }: { row: LedgerRow; onOpen?: () => void }) {
  const dateSold = row.dateSold ? format(new Date(row.dateSold), "MMM d, yyyy") : "—";
  const hasCogs = row.costOfGoods > 0;
  const profitColor =
    row.netProfit > 0 ? "text-emerald-700" : row.netProfit < 0 ? "text-rose-700" : "";

  return (
    <TableRow className={cn("hover:bg-muted/40", onOpen && "cursor-pointer")} onClick={onOpen}>
      <TableCell>
        <div className="font-medium text-slate-900">{row.customerName}</div>
        <div className="text-xs text-muted-foreground font-mono">{row.quoteNumber}</div>
      </TableCell>
      <TableCell className="tabular-nums text-sm">{dateSold}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {formatMoney(row.grossSale)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {hasCogs ? (
          <span
            title={
              row.manufacturerName
                ? `${row.manufacturerName} ${row.manufacturerOrderRef ?? ""}`.trim()
                : undefined
            }
          >
            {formatMoney(row.costOfGoods)}
          </span>
        ) : (
          <span className="text-muted-foreground italic text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums text-amber-700">
        {formatMoney(row.ownerCommission)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(row.depositPaid)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(row.balance)}</TableCell>
      <TableCell>
        {row.paymentMethod ? (
          <span className="text-sm text-slate-700">{row.paymentMethod}</span>
        ) : (
          <span className="text-muted-foreground italic text-xs">—</span>
        )}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums font-semibold", profitColor)}>
        {hasCogs ? (
          formatMoney(row.netProfit)
        ) : (
          <span className="text-muted-foreground italic text-xs">pending</span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            STATUS_COLORS[row.status]
          )}
        >
          {row.statusLabel}
        </span>
      </TableCell>
    </TableRow>
  );
}

function LedgerRowCard({ row, onOpen }: { row: LedgerRow; onOpen?: () => void }) {
  const dateSold = row.dateSold ? format(new Date(row.dateSold), "MMM d, yyyy") : "—";
  const hasCogs = row.costOfGoods > 0;
  const profitColor =
    row.netProfit > 0 ? "text-emerald-700" : row.netProfit < 0 ? "text-rose-700" : "";

  return (
    <article
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!onOpen) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        onOpen && "cursor-pointer transition-colors hover:bg-slate-50"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-black text-slate-950">{row.customerName}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{row.quoteNumber}</div>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
            STATUS_COLORS[row.status]
          )}
        >
          {row.statusLabel}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <LedgerCardMetric label="Date Sold" value={dateSold} />
        <LedgerCardMetric label="Gross Sale" value={formatMoney(row.grossSale)} />
        <LedgerCardMetric
          label="COGS"
          value={hasCogs ? formatMoney(row.costOfGoods) : "—"}
          muted={!hasCogs}
        />
        <LedgerCardMetric
          label="Owner 10%"
          value={formatMoney(row.ownerCommission)}
          className="text-amber-700"
        />
        <LedgerCardMetric label="Deposit" value={formatMoney(row.depositPaid)} />
        <LedgerCardMetric label="Balance" value={formatMoney(row.balance)} />
        <LedgerCardMetric
          label="Pay Method"
          value={row.paymentMethod || "—"}
          muted={!row.paymentMethod}
        />
        <LedgerCardMetric
          label="Net Profit"
          value={hasCogs ? formatMoney(row.netProfit) : "pending"}
          className={hasCogs ? profitColor : "text-muted-foreground"}
        />
      </div>
    </article>
  );
}

function LedgerTotalsCard({ totals }: { totals: ReturnType<typeof sumLedger> }) {
  return (
    <article className="rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-sm">
      <div className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700">
        Ledger Totals
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <LedgerCardMetric label="Rows" value={String(totals.rows)} />
        <LedgerCardMetric label="Gross Sale" value={formatMoney(totals.grossSale)} />
        <LedgerCardMetric label="COGS" value={formatMoney(totals.costOfGoods)} />
        <LedgerCardMetric
          label="Owner 10%"
          value={formatMoney(totals.ownerCommission)}
          className="text-amber-700"
        />
        <LedgerCardMetric label="Deposit" value={formatMoney(totals.depositPaid)} />
        <LedgerCardMetric label="Balance" value={formatMoney(totals.balance)} />
        <LedgerCardMetric
          label="Net Profit"
          value={formatMoney(totals.netProfit)}
          className={totals.netProfit > 0 ? "text-emerald-700" : "text-rose-700"}
        />
      </div>
    </article>
  );
}

function LedgerCardMetric({
  label,
  value,
  className,
  muted = false,
}: {
  label: string;
  value: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm font-bold tabular-nums text-slate-950",
          muted && "text-muted-foreground italic",
          className
        )}
      >
        {value}
      </div>
    </div>
  );
}

// ---------- CSV ----------

function toCsv(rows: LedgerRow[]): string {
  const header = [
    "Quote #",
    "Customer",
    "Date Sold",
    "Gross Sale",
    "Cost of Goods",
    "Owner 10%",
    "Deposit",
    "Balance",
    "Payment Method",
    "Net Profit",
    "Status",
    "Manufacturer",
    "Order Ref",
  ].join(",");

  const escapeCell = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const body = rows.map((r) =>
    [
      r.quoteNumber,
      r.customerName,
      r.dateSold ? r.dateSold.slice(0, 10) : "",
      r.grossSale.toFixed(2),
      r.costOfGoods.toFixed(2),
      r.ownerCommission.toFixed(2),
      r.depositPaid.toFixed(2),
      r.balance.toFixed(2),
      r.paymentMethod ?? "",
      r.netProfit.toFixed(2),
      r.statusLabel,
      r.manufacturerName ?? "",
      r.manufacturerOrderRef ?? "",
    ]
      .map(escapeCell)
      .join(",")
  );

  return [header, ...body].join("\n");
}

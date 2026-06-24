import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileSignature,
  Image,
  Loader2,
  PackageCheck,
  PlayCircle,
} from "lucide-react";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { cn } from "@mts/lib/utils";
import { formatMoney } from "@mts/lib/salesLedger";
import { getOrderPipelineCounts, getOrderPipelineQuotes } from "@mts/lib/quoteOrderPipeline";
import {
  getQuoteOrderAgentRunLabel,
  getRollerShadeOrderReadiness,
  type QuoteOrderAgentRun,
  type QuoteOrderAgentQueueByQuoteId,
  type QuoteOrderAgentQueueRow,
  type QuoteOrderAgentRunsByQuoteId,
  type RollerShadeOrderReadiness,
  isQuoteOrderAgentQueueOpen,
} from "@mts/lib/quoteOrderWorkflow";
import { getStatusColor, getStatusLabel } from "@mts/lib/quoteStatus";
import type { SalesQuote, SalesQuoteWithItems, QuoteStatus } from "@mts/types/quote";

interface QuoteOrderStatusPanelProps {
  quotes: SalesQuote[];
  agentRunsByQuoteId?: QuoteOrderAgentRunsByQuoteId;
  agentQueueByQuoteId?: QuoteOrderAgentQueueByQuoteId;
  onOpenQuote: (quote: SalesQuote) => void;
  onOpenContract: (quote: SalesQuote) => void;
  onMarkOrdered: (quote: SalesQuote, orderRef: string) => void;
  onMoveStatus: (quote: SalesQuote, status: Extract<QuoteStatus, "received" | "installed">) => void;
  onQueueAgentDraft: (quote: SalesQuote) => void;
  isUpdating?: boolean;
  isQueueingAgent?: boolean;
}

export function QuoteOrderStatusPanel({
  quotes,
  agentRunsByQuoteId = {},
  agentQueueByQuoteId = {},
  onOpenQuote,
  onOpenContract,
  onMarkOrdered,
  onMoveStatus,
  onQueueAgentDraft,
  isUpdating = false,
  isQueueingAgent = false,
}: QuoteOrderStatusPanelProps) {
  const pipelineQuotes = useMemo(() => getOrderPipelineQuotes(quotes), [quotes]);
  const counts = useMemo(() => getOrderPipelineCounts(quotes), [quotes]);
  const [orderRefs, setOrderRefs] = useState<Record<string, string>>({});

  const getOrderRef = (quote: SalesQuote) =>
    orderRefs[quote.id] ?? quote.manufacturer_order_ref ?? "";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-gradient-to-br from-slate-950 via-slate-900 to-[#343330] p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
              Order Queue
            </p>
            <h2 className="mt-1 text-2xl font-bold">Signed quotes moving into production</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">
              Review sold quotes, record the Norman order reference, and move each job through
              ordered, received, and installed.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Ready" value={counts.readyToOrder} tone="emerald" />
            <Metric label="Ordered" value={counts.ordered} tone="amber" />
            <Metric label="Received" value={counts.received} tone="cyan" />
          </div>
        </div>
      </div>

      {pipelineQuotes.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No signed quotes are waiting for order review. Sold quotes will appear here automatically.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {pipelineQuotes.map((quote) => {
            const orderRef = getOrderRef(quote);
            const soldAt = quote.signed_at ? format(new Date(quote.signed_at), "MMM d") : "—";
            const orderedAt = quote.ordered_at ? format(new Date(quote.ordered_at), "MMM d") : null;
            const agentRun = agentRunsByQuoteId[quote.id] ?? null;
            const queueRow = agentQueueByQuoteId[quote.id] ?? null;
            const queueOpen = isQuoteOrderAgentQueueOpen(queueRow);
            const rollerReadiness =
              "line_items" in quote
                ? getRollerShadeOrderReadiness(quote as SalesQuoteWithItems)
                : null;
            const rollerBlocked = rollerReadiness?.applies && !rollerReadiness.ready;

            return (
              <div key={quote.id} className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-500">
                      {quote.quote_number}
                    </span>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        getStatusColor(quote.status)
                      )}
                    >
                      {getStatusLabel(quote.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500">
                      Signed {soldAt}
                    </span>
                    {orderedAt && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800">
                        Ordered {orderedAt}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 truncate text-lg font-semibold text-slate-950">
                    {quote.customer_name || "Unnamed customer"}
                  </div>
                  {quote.customer_address && (
                    <div className="truncate text-sm text-slate-500">{quote.customer_address}</div>
                  )}
                  <div className="mt-2 text-sm font-semibold text-slate-800">
                    {formatMoney(quote.total_amount || 0)}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Norman order ref
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={orderRef}
                      onChange={(event) =>
                        setOrderRefs((current) => ({ ...current, [quote.id]: event.target.value }))
                      }
                      placeholder="Enter order #"
                      className="h-9 bg-white"
                    />
                    {quote.status === "sold" && (
                      <Button
                        size="sm"
                        className="h-9 whitespace-nowrap bg-slate-950 text-white hover:bg-slate-800"
                        disabled={isUpdating}
                        onClick={() => onMarkOrdered(quote, orderRef)}
                      >
                        <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                        Mark Ordered
                      </Button>
                    )}
                  </div>
                  <AgentProof run={agentRun} />
                  <AgentQueueStatus row={queueRow} />
                  <RollerReadinessStatus readiness={rollerReadiness} />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onOpenQuote(quote)}>
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Quote
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onOpenContract(quote)}>
                    <FileSignature className="mr-1.5 h-3.5 w-3.5" />
                    Contract
                  </Button>
                  {quote.status === "sold" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isQueueingAgent || queueOpen || rollerBlocked}
                      title={
                        rollerBlocked
                          ? `Missing roller fields: ${rollerReadiness.missingFields.join("; ")}`
                          : undefined
                      }
                      onClick={() => onQueueAgentDraft(quote)}
                    >
                      {queueOpen ? (
                        <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {queueOpen
                        ? "Agent Queued"
                        : rollerBlocked
                          ? "Fix Roller Fields"
                          : "Queue Agent"}
                    </Button>
                  )}
                  {quote.status === "ordered" && (
                    <Button
                      size="sm"
                      disabled={isUpdating}
                      onClick={() => onMoveStatus(quote, "received")}
                      className="bg-cyan-600 text-white hover:bg-cyan-700"
                    >
                      <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                      Mark Received
                    </Button>
                  )}
                  {quote.status === "received" && (
                    <Button
                      size="sm"
                      disabled={isUpdating}
                      onClick={() => onMoveStatus(quote, "installed")}
                      className="bg-purple-600 text-white hover:bg-purple-700"
                    >
                      Mark Installed
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RollerReadinessStatus({ readiness }: { readiness: RollerShadeOrderReadiness | null }) {
  if (!readiness?.applies) return null;

  if (readiness.ready) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Roller shade draft ready
        </div>
        <div className="mt-1 text-[11px] opacity-80">
          {readiness.itemCount} Norman roller line item{readiness.itemCount === 1 ? "" : "s"} ready
          for portal draft only.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" />
        Roller shade draft blocked
      </div>
      <div className="mt-1 text-[11px] opacity-80">
        Missing: {readiness.missingFields.slice(0, 4).join("; ")}
        {readiness.missingFields.length > 4 ? "..." : ""}
      </div>
    </div>
  );
}

function AgentQueueStatus({ row }: { row: QuoteOrderAgentQueueRow | null }) {
  if (!row) return null;

  const tones = {
    queued: "border-sky-200 bg-sky-50 text-sky-800",
    processing: "border-amber-200 bg-amber-50 text-amber-800",
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    failed: "border-red-200 bg-red-50 text-red-800",
    cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const label = {
    queued: "Queued for Norman draft entry",
    processing: "Norman draft entry running",
    completed: "Norman draft request completed",
    failed: "Norman draft request failed",
    cancelled: "Norman draft request cancelled",
  }[row.status];

  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", tones[row.status])}>
      <div className="flex items-center gap-2 font-semibold">
        {row.status === "processing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Clock3 className="h-3.5 w-3.5" />
        )}
        {label}
      </div>
      {row.error_message && <div className="mt-1 text-[11px] opacity-80">{row.error_message}</div>}
    </div>
  );
}

function AgentProof({ run }: { run: QuoteOrderAgentRun | null }) {
  const status = run?.status ?? "skipped";
  const label = getQuoteOrderAgentRunLabel(run);
  const proofPath = run?.screenshotPath ?? null;
  const proofIsUrl = proofPath ? /^https?:\/\//i.test(proofPath) : false;

  const tones = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    partial: "border-amber-200 bg-amber-50 text-amber-800",
    fail: "border-red-200 bg-red-50 text-red-800",
    running: "border-sky-200 bg-sky-50 text-sky-800",
    skipped: "border-slate-200 bg-slate-50 text-slate-600",
  };

  const Icon = run
    ? status === "running"
      ? Loader2
      : status === "fail" || status === "partial"
        ? AlertTriangle
        : proofPath
          ? Image
          : CheckCircle2
    : Bot;

  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", tones[status])}>
      <div className="flex items-center gap-2 font-semibold">
        <Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-spin")} />
        {label}
      </div>
      {proofPath && (
        <div className="mt-1 truncate font-mono text-[11px] opacity-80">
          {proofIsUrl ? (
            <a href={proofPath} target="_blank" rel="noreferrer" className="underline">
              View Norman proof screenshot
            </a>
          ) : (
            proofPath
          )}
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "cyan";
}) {
  const tones = {
    emerald: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
    amber: "border-amber-300/30 bg-amber-400/15 text-amber-100",
    cyan: "border-cyan-300/30 bg-cyan-400/15 text-cyan-100",
  };

  return (
    <div className={cn("min-w-[82px] rounded-xl border px-3 py-2", tones[tone])}>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

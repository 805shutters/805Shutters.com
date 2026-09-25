import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { Button } from "@mts/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@mts/components/ui/dialog";
import type { SalesQuote } from "@mts/types/quote";
import type { TechnicalMeasureDecision } from "@/lib/crm/measure-needed-state";

export function InPersonSigning({ quote, measureDecision, disabled = false }: {
  quote: SalesQuote; measureDecision: TechnicalMeasureDecision | ""; disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const preparing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signed = Boolean(quote.signed_at && quote.customer_signature);

  async function open() {
    if (preparing.current || disabled) return;
    preparing.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in to the CRM again before opening the contract.");
      const response = await fetch(`/api/crm/sales-quotes/${encodeURIComponent(quote.id)}/in-person`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ expectedRevision: quote.quote_v2_revision,
          idempotencyKey: `in-person:${quote.id}:${quote.quote_v2_revision || 1}`,
          ...(measureDecision ? { measureDecision } : {}),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "The contract could not be opened. Please try again.");
      if (typeof result?.path !== "string" || !/^\/quote\/[A-Za-z0-9_-]+$/.test(result.path)) throw new Error("The contract link could not be verified.");
      setPath(result.path);
      void queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
    } catch (error) { setError(error instanceof Error ? error.message : "The contract could not be opened."); }
    finally { preparing.current = false; setBusy(false); }
  }

  function close() {
    setPath(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
  }

  return <div className="space-y-3">
    {signed ? <p className="font-medium text-emerald-700">Signed by {quote.customer_printed_name || quote.customer_name}</p>
      : <p className="text-sm text-muted-foreground">Review the contract together, then let the customer draw or type their signature on this device. Opening the contract saves this version for review and sends no message.</p>}
    {!signed && quote.status === "sold" && <p className="text-sm">Sale recorded. The customer can still sign the contract here.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <Button type="button" onClick={open} disabled={busy || disabled}>
      {busy ? "Opening contract…" : signed ? "View signed contract" : "Sign with customer here"}
    </Button>
    <Dialog open={Boolean(path)} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="flex h-[95dvh] w-[98vw] max-w-6xl flex-col gap-2 p-3">
        <DialogTitle className="pr-8">Customer contract</DialogTitle>
        <DialogDescription>Hand the device to the customer to review and sign. Close this window to return to the quote.</DialogDescription>
        {path && <iframe title="Review and sign customer contract" src={path} className="min-h-0 w-full flex-1 rounded border bg-white" />}
      </DialogContent>
    </Dialog>
  </div>;
}

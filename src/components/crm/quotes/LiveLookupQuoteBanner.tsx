"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { liveLookupLineText, liveLookupQuoteText, type LiveLookupLineSummary, type LiveLookupQuoteSummary } from "@/lib/quote/live-lookup-presentation";

export function LiveLookupQuoteBanner({ quoteId }: { quoteId: string }) {
  const [quote, setQuote] = useState<LiveLookupQuoteSummary | null>(null);
  const [lines, setLines] = useState<LiveLookupLineSummary[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void (async () => {
      const quoteResult = await supabase.from("sales_quotes").select("live_margin,live_margin_set_by,live_margin_set_at").eq("id", quoteId).maybeSingle();
      const lineResult = await supabase.from("crm_live_lookup_current_line_prices").select("line_id,net_unit_price,installation,shipping,price_source,manual_typed_by,spec_current").eq("quote_id", quoteId);
      if (!active || quoteResult.error || lineResult.error || !quoteResult.data) return;
      setQuote({
        margin: quoteResult.data.live_margin == null ? null : Number(quoteResult.data.live_margin),
        setBy: quoteResult.data.live_margin_set_by,
        setAt: quoteResult.data.live_margin_set_at,
      });
      setLines((lineResult.data ?? []).map((row) => ({
        lineId: row.line_id,
        netUnitPrice: row.net_unit_price == null ? null : Number(row.net_unit_price),
        installation: row.installation == null ? null : Number(row.installation),
        shipping: row.shipping == null ? null : Number(row.shipping),
        priceSource: row.price_source === "live_site" || row.price_source === "manual_no_source" ? row.price_source : null,
        manualTypedBy: row.manual_typed_by,
        specCurrent: row.spec_current !== false,
      })));
    })();
    return () => { active = false; };
  }, [quoteId]);

  if (!quote) return null;
  return (
    <section aria-label="Live lookup price" style={{ margin: "12px 16px", padding: 12, border: "1px solid #d8d8d2", borderRadius: 8, fontFamily: "system-ui, sans-serif" }}>
      <p style={{ margin: 0 }}>{liveLookupQuoteText(quote)}</p>
      {lines.map((line) => <p key={line.lineId} style={{ margin: "6px 0 0" }}>{liveLookupLineText(line)}</p>)}
    </section>
  );
}

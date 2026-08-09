"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicQuote } from "@/lib/crm/public-quote";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { CustomerContractDocument } from "@/app/quote/[token]/CustomerContractDocument";
import { QuoteContractPreviewStandalone } from "./QuoteContractPreviewStandalone";

type PreviewState =
  | { status: "loading" }
  | { status: "crm"; quote: PublicQuote }
  | { status: "sales" }
  | { status: "error"; message: string };

export function CustomerDocumentPreviewStandalone({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase) {
        router.replace("/crm");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/crm");
        return;
      }

      try {
        const response = await fetch(`/api/crm/quotes/${quoteId}/document`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        if (!active) return;
        if (response.status === 404) {
          setState({ status: "sales" });
          return;
        }
        if (response.status === 401 || response.status === 403) {
          router.replace("/crm");
          return;
        }
        const body = await response.json();
        if (!response.ok || !body?.quote) {
          throw new Error(body?.message || "Contract preview could not be loaded.");
        }
        setState({ status: "crm", quote: body.quote as PublicQuote });
      } catch (error) {
        if (active) setState({ status: "error", message: error instanceof Error ? error.message : "Contract preview could not be loaded." });
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [quoteId, router, supabase]);

  if (state.status === "sales") return <QuoteContractPreviewStandalone quoteId={quoteId} />;
  if (state.status === "crm") return <CustomerContractDocument quote={state.quote} embedded previewOnly />;
  if (state.status === "error") {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "60px 20px", fontFamily: "system-ui, sans-serif", color: "#0b0b0b" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Contract unavailable</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>{state.message}</p>
      </main>
    );
  }
  return <main style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>Loading customer contract…</main>;
}

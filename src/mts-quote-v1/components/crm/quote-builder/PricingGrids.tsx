"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { TableProperties, X } from "lucide-react";
import { PricingGuidePanel } from "@/components/crm/PricingGuidePanel";
import { Button } from "@mts-v1/components/ui/button";
import { supabase } from "@mts-v1/integrations/supabase/client";
import { useQuoteBuilderStore } from "@mts-v1/stores/quoteBuilderStore";
import { cn } from "@mts-v1/lib/utils";

export function PricingGrids() {
  const { activeQuoteId, setActiveTab } = useQuoteBuilderStore();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f4f2] p-4 text-[#1c1c1a]">
      <div className="mb-4 rounded-2xl border border-[#d8d8d2] bg-white/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0b0b0b] text-white">
              <TableProperties className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8d8a82]">
                Quote Builder
              </p>
              <h1 className="text-xl font-black text-[#0b0b0b]">Pricing Grids</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeQuoteId && (
              <div className="quote-view-toggle" role="group" aria-label="Quote view">
                <button
                  type="button"
                  aria-pressed="false"
                  className="quote-view-toggle__button"
                  onClick={() => setActiveTab("builder")}
                >
                  Builder
                </button>
                <button
                  type="button"
                  aria-pressed="true"
                  className="quote-view-toggle__button quote-view-toggle__button--active"
                  onClick={() => setActiveTab("pricing")}
                >
                  Pricing Grids
                </button>
                <button
                  type="button"
                  aria-pressed="false"
                  onClick={() => setActiveTab("contract")}
                  className="quote-view-toggle__button"
                >
                  Contract
                </button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("dashboard")}
              className={cn(
                "h-10 rounded-lg border-[#d8d8d2] bg-white text-[#0b0b0b]",
                "hover:border-[#0b0b0b] hover:bg-[#0b0b0b] hover:text-white"
              )}
              aria-label="Close pricing grids - back to dashboard"
              title="Close - back to dashboard"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="rounded-xl border border-[#d8d8d2] bg-white p-6 text-sm text-slate-600">
          Loading pricing grids...
        </div>
      ) : session ? (
        <PricingGuidePanel session={session} />
      ) : (
        <div className="rounded-xl border border-[#d8d8d2] bg-white p-6 text-sm text-slate-600">
          CRM session is required to view pricing grids.
        </div>
      )}
    </div>
  );
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { supabase as productionSupabase } from "./client";

export type QuoteBuilderDatabase = typeof productionSupabase;

type QuoteBuilderRuntime = {
  database: QuoteBuilderDatabase;
  isolated: boolean;
  preferStoredTotal: boolean;
  authoritativeV2: boolean;
  /**
   * Production V2 rows must mutate through authenticated server APIs. The
   * isolated Quote Lab keeps using its in-memory adapter, even though both
   * runtimes share the authoritative configuration UI.
   */
  serverOwnedV2: boolean;
  showLabCatalogControls: boolean;
};

const defaultRuntime: QuoteBuilderRuntime = {
  database: productionSupabase,
  isolated: false,
  preferStoredTotal: false,
  authoritativeV2: false,
  serverOwnedV2: false,
  showLabCatalogControls: false,
};

const QuoteBuilderDatabaseContext = createContext<QuoteBuilderRuntime>(defaultRuntime);

export function QuoteBuilderDatabaseProvider({
  database,
  isolated = false,
  preferStoredTotal = false,
  authoritativeV2 = isolated,
  serverOwnedV2 = false,
  showLabCatalogControls = false,
  children,
}: {
  database: QuoteBuilderDatabase;
  isolated?: boolean;
  preferStoredTotal?: boolean;
  authoritativeV2?: boolean;
  serverOwnedV2?: boolean;
  showLabCatalogControls?: boolean;
  children: ReactNode;
}) {
  return (
    <QuoteBuilderDatabaseContext.Provider
      value={{
        database,
        isolated,
        preferStoredTotal,
        authoritativeV2,
        serverOwnedV2,
        showLabCatalogControls,
      }}
    >
      {children}
    </QuoteBuilderDatabaseContext.Provider>
  );
}

export function useQuoteBuilderDatabase() {
  return useContext(QuoteBuilderDatabaseContext);
}

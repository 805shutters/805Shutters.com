"use client";

import { createContext, useContext, type ReactNode } from "react";
import { supabase as productionSupabase } from "./client";

export type QuoteBuilderDatabase = typeof productionSupabase;

type QuoteBuilderRuntime = {
  database: QuoteBuilderDatabase;
  isolated: boolean;
  preferStoredTotal: boolean;
  authoritativeV2: boolean;
  showLabCatalogControls: boolean;
};

const defaultRuntime: QuoteBuilderRuntime = {
  database: productionSupabase,
  isolated: false,
  preferStoredTotal: false,
  authoritativeV2: false,
  showLabCatalogControls: false,
};

const QuoteBuilderDatabaseContext = createContext<QuoteBuilderRuntime>(defaultRuntime);

export function QuoteBuilderDatabaseProvider({
  database,
  isolated = false,
  preferStoredTotal = false,
  authoritativeV2 = isolated,
  showLabCatalogControls = false,
  children,
}: {
  database: QuoteBuilderDatabase;
  isolated?: boolean;
  preferStoredTotal?: boolean;
  authoritativeV2?: boolean;
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

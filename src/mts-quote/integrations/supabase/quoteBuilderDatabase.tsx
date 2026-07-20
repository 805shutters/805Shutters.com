"use client";

import { createContext, useContext, type ReactNode } from "react";
import { supabase as productionSupabase } from "./client";

export type QuoteBuilderDatabase = typeof productionSupabase;

type QuoteBuilderRuntime = {
  database: QuoteBuilderDatabase;
  isolated: boolean;
  preferStoredTotal: boolean;
};

const defaultRuntime: QuoteBuilderRuntime = {
  database: productionSupabase,
  isolated: false,
  preferStoredTotal: false,
};

const QuoteBuilderDatabaseContext = createContext<QuoteBuilderRuntime>(defaultRuntime);

export function QuoteBuilderDatabaseProvider({
  database,
  isolated = false,
  preferStoredTotal = false,
  children,
}: {
  database: QuoteBuilderDatabase;
  isolated?: boolean;
  preferStoredTotal?: boolean;
  children: ReactNode;
}) {
  return (
    <QuoteBuilderDatabaseContext.Provider value={{ database, isolated, preferStoredTotal }}>
      {children}
    </QuoteBuilderDatabaseContext.Provider>
  );
}

export function useQuoteBuilderDatabase() {
  return useContext(QuoteBuilderDatabaseContext);
}

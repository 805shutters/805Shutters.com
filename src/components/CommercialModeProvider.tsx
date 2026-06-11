"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type CommercialModeContextValue = {
  isCommercialMode: boolean;
  toggleCommercialMode: () => void;
};

const CommercialModeContext = createContext<CommercialModeContextValue | null>(null);
const storageKey = "805-commercial-mode";

export function CommercialModeProvider({ children }: { children: ReactNode }) {
  const [isCommercialMode, setIsCommercialMode] = useState(false);

  useEffect(() => {
    const savedMode = window.localStorage.getItem(storageKey);
    setIsCommercialMode(savedMode === "true");
  }, []);

  useEffect(() => {
    document.body.classList.toggle("commercial-mode", isCommercialMode);
    window.localStorage.setItem(storageKey, String(isCommercialMode));
  }, [isCommercialMode]);

  const toggleCommercialMode = useCallback(() => {
    setIsCommercialMode((currentMode) => !currentMode);
  }, []);

  const value = useMemo(
    () => ({
      isCommercialMode,
      toggleCommercialMode
    }),
    [isCommercialMode, toggleCommercialMode]
  );

  return <CommercialModeContext.Provider value={value}>{children}</CommercialModeContext.Provider>;
}

export function useCommercialMode() {
  const context = useContext(CommercialModeContext);

  if (!context) {
    throw new Error("useCommercialMode must be used inside CommercialModeProvider");
  }

  return context;
}

export function CommercialModeBadge() {
  const { isCommercialMode, toggleCommercialMode } = useCommercialMode();

  return (
    <button
      aria-pressed={isCommercialMode}
      className={`commercial-mode-badge${isCommercialMode ? " active" : ""}`}
      onClick={toggleCommercialMode}
      type="button"
    >
      {isCommercialMode ? "Residential" : "Commercial"}
    </button>
  );
}

"use client";

// Radix portals (Dialog/Select/DropdownMenu) default to document.body, which
// is OUTSIDE the `.mts-quote-scope` wrapper — so descendant-scoped Tailwind
// utilities would not reach them. We expose the scope element through context
// and pass it as the Radix Portal `container`, keeping popovers inside scope.
import { createContext, useContext } from "react";

export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

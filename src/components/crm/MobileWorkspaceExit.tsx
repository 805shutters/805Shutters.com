"use client";

import { usePathname } from "next/navigation";
import { X } from "lucide-react";

export function MobileWorkspaceExit({ showOnHome = false }: { showOnHome?: boolean }) {
  const pathname = usePathname();
  if (!showOnHome && pathname === "/crm/mobile") return null;

  return (
    <a className="mobile-workspace-exit" href="/crm/mobile" aria-label="Close workspace and return to mobile app home">
      <X aria-hidden="true" />
    </a>
  );
}

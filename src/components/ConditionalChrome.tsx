"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CommercialModeProvider } from "./CommercialModeProvider";
import { MessagingAssistantWidget } from "./MessagingAssistantWidget";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Wraps the site chrome (header/footer/messaging widget/commercial mode). */
export function ConditionalChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCrmRoute = pathname === "/crm" || Boolean(pathname?.startsWith("/crm/"));
  const isQuoteRoute = pathname === "/quote" || Boolean(pathname?.startsWith("/quote/"));
  const showAssistantWidget = !isCrmRoute && !isQuoteRoute;

  // Preserve the existing CRM shell while keeping it free of public website chrome.
  if (isCrmRoute) {
    return <main>{children}</main>;
  }

  // Customer quote routes show only the contract experience.
  if (isQuoteRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <CommercialModeProvider>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </CommercialModeProvider>
      {showAssistantWidget ? <MessagingAssistantWidget /> : null}
    </>
  );
}

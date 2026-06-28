"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CommercialModeProvider } from "./CommercialModeProvider";
import { MessagingAssistantWidget } from "./MessagingAssistantWidget";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Wraps the site chrome (header/footer/messaging widget/commercial mode).
 *  On dedicated full-screen pages (the quote builder), renders NONE of it —
 *  just the bare <main> content, so the page is 100% quoting UI. */
export function ConditionalChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Dedicated CRM app routes — no site header, footer, or chat widget.
  if (pathname?.startsWith("/crm/quote/") || pathname?.startsWith("/crm/mobile")) {
    return <main>{children}</main>;
  }

  return (
    <>
      <CommercialModeProvider>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </CommercialModeProvider>
      <MessagingAssistantWidget />
    </>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { CommercialModeProvider } from "@/components/CommercialModeProvider";
import { MessagingAssistantWidget } from "@/components/MessagingAssistantWidget";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { RouteTracking } from "@/components/RouteTracking";
import { TrackingScripts } from "@/components/TrackingScripts";
import { site } from "@/lib/site-data";
import { localBusinessJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl),
  title: {
    default: "805 Shutters, Shades & Blinds",
    template: "%s"
  },
  description:
    "Custom shutters, shades, blinds, and commercial window coverings across Ventura County.",
  alternates: {
    canonical: "/"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <TrackingScripts />
        <RouteTracking />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd())
          }}
        />
        <CommercialModeProvider>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </CommercialModeProvider>
        <MessagingAssistantWidget />
      </body>
    </html>
  );
}

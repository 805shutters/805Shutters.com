import type { Metadata } from "next";
import { Bodoni_Moda } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { MessagingAssistantWidget } from "@/components/MessagingAssistantWidget";
import { RouteTracking } from "@/components/RouteTracking";
import { TrackingScripts } from "@/components/TrackingScripts";
import { site } from "@/lib/site-data";
import { localBusinessJsonLd } from "@/lib/structured-data";

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-logo-bodoni",
  display: "swap"
});

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
      <body className={bodoniModa.variable}>
        <TrackingScripts />
        <RouteTracking />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd())
          }}
        />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <MessagingAssistantWidget />
      </body>
    </html>
  );
}

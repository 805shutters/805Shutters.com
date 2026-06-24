import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ConditionalChrome } from "@/components/ConditionalChrome";
import { RouteTracking } from "@/components/RouteTracking";
import { TrackingScripts } from "@/components/TrackingScripts";
import { CrmAuthRedirect } from "@/components/crm/CrmAuthRedirect";
import { site } from "@/lib/site-data";
import { localBusinessJsonLd } from "@/lib/structured-data";

const bodoniModa = Bodoni_Moda({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-bodoni-moda"
});

const theanoDidot = localFont({
  src: "../fonts/theano-didot-latin.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-theano-didot"
});

// Industrial grotesque used only for the "805 Commercial" wordmark
// (commercial mode). Variable font — weights set in CSS. Residential
// keeps the Theano Didot serif.
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo"
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
    <html lang="en" className={`${bodoniModa.variable} ${theanoDidot.variable} ${archivo.variable}`}>
      <body>
        <TrackingScripts />
        <RouteTracking />
        <CrmAuthRedirect />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd())
          }}
        />
        <ConditionalChrome>{children}</ConditionalChrome>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "@/components/crm/commercial-workspace.css";
import { ConditionalChrome } from "@/components/ConditionalChrome";
import { PublicActivityTracking } from "@/components/PublicActivityTracking";
import { CrmAuthRedirect } from "@/components/crm/CrmAuthRedirect";
import { absoluteUrl, machineReadableFeeds } from "@/lib/ai-search-data";
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

const defaultTitle = "805 Shutters | Ventura County Window Treatments";
const defaultDescription =
  "Custom shutters, shades, blinds, and commercial window coverings across Ventura County.";

export const metadata: Metadata = {
  metadataBase: new URL(site.baseUrl),
  title: {
    default: defaultTitle,
    template: "%s"
  },
  description: defaultDescription,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    siteName: "805 Shutters",
    locale: "en_US",
    title: defaultTitle,
    description: defaultDescription,
    url: site.baseUrl,
    images: [
      {
        url: "/images/805-hero-window-treatments.jpg",
        width: 1774,
        height: 887,
        alt: "Custom window treatments installed in a Ventura County home"
      }
    ]
  },
  // Only declare the card type here. X/Twitter falls back to each page's
  // og:title / og:description / og:image, so per-page shares stay specific
  // instead of being overridden by a generic site-wide twitter:title.
  twitter: {
    card: "summary_large_image"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodoniModa.variable} ${theanoDidot.variable} ${archivo.variable}`}>
      <head>
        {machineReadableFeeds.map((feed) => (
          <link
            key={feed.href}
            rel="alternate"
            type={feed.contentType}
            title={feed.label}
            href={absoluteUrl(feed.href)}
          />
        ))}
        <meta name="ai-search-feeds" content={machineReadableFeeds.map((feed) => absoluteUrl(feed.href)).join(",")} />
      </head>
      <body>
        <PublicActivityTracking />
        <CrmAuthRedirect />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd())
          }}
        />
        <ConditionalChrome>{children}</ConditionalChrome>
      </body>
    </html>
  );
}

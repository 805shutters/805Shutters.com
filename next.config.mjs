const legacyRedirectSources = {
  "/": [
    "/home/",
    "/home-1/",
    "/home-2/",
    "/home-3/",
    "/home-4/",
    "/424-2/",
    "/425-2/",
    "/426-2/",
    "/427-2/",
    "/428-2/",
    "/447-2/",
    "/pagelines-805logo-png/",
    "/pagelines-805logo2-png/",
    "/pagelines-805logonav-png/",
    "/pagelines-805logonav-png-2/",
    "/pagelines-home3-jpg/",
    "/pagelines-home3-png/",
    "/pagelines-home3-png-2/",
    "/pagelines-homeslider-jpg/",
    "/pagelines-homeslider2-jpg/",
    "/pagelines-homeslider2-jpg-2/",
    "/pagelines-logo-png/",
    "/pagelines-logo-huge-png/",
    "/qtq50-6vubjg/"
  ],
  "/about/": [
    "/about-us/",
    "/about-us-1/",
    "/about-us-headshot-1/",
    "/about-us-headshot-2/",
    "/about-us-headshot-3/"
  ],
  "/blinds/": [
    "/blinds-alum1/",
    "/blinds-alum2/",
    "/blinds-alum3/",
    "/blinds-alum4/",
    "/blinds-alum5/",
    "/blinds-alum6/",
    "/blinds-gallery/",
    "/blinds-softwood/",
    "/blinds-softwood1/",
    "/blinds-softwood2/",
    "/blinds-softwood4/",
    "/blinds-vert1/",
    "/blinds-vert2/",
    "/blinds-vert3/",
    "/blinds-wood1/",
    "/blinds-wood2/",
    "/blinds-wood3/",
    "/blinds-wood4/",
    "/pagelines-blinds-header-jpg/",
    "/pagelines-blinds-jpg/",
    "/pagelines-blinds-jpg-2/",
    "/pagelines-blinds-no-text-tall-jpg/",
    "/pagelines-blinds-no-text-tall-jpg-2/",
    "/pagelines-blinds-no-text-tall-jpg-3/",
    "/pagelines-blinds-notext-tall-jpg/",
    "/pagelines-blinds-notext-tall-jpg-2/",
    "/pagelines-blinds-text-only-png/",
    "/pagelines-blinds-text-only-png-2/"
  ],
  "/contact/": ["/contact-us/"],
  "/faq/": ["/frequently-asked-questions-faq/"],
  "/gallery/": [
    "/cropped-gallery-6-jpg/",
    "/gallery-1/",
    "/gallery-2/",
    "/gallery-3/",
    "/gallery-4/",
    "/gallery-5/",
    "/gallery-6/",
    "/gallery-7/",
    "/gallery-8/",
    "/portfolio/",
    "/portfolio-1a/",
    "/portfolio-1b/",
    "/portfolio-1c/",
    "/portfolio-2a/",
    "/portfolio-2b/",
    "/portfolio-2c/",
    "/portfolio-2d/"
  ],
  "/recent-projects/": [
    "/blog/",
    "/blog-2/",
    "/blog-post-title/",
    "/inspiration/"
  ],
  "/shades/": [
    "/pagelines-shades-header-jpg/",
    "/pagelines-shades-jpg/",
    "/pagelines-shades-no-text-tall-jpg/",
    "/pagelines-shades-not-text-jpg/",
    "/pagelines-shades-text-only-png/",
    "/pagelines-shades-text-only-png-2/",
    "/pagelines-shades1-jpg/",
    "/shades-2/",
    "/shades-gallery/",
    "/shades-honeycomb/",
    "/shades-honeycomb2/",
    "/shades-roller/",
    "/shades-roller2/",
    "/shades-roller3/",
    "/shades-roller4/",
    "/shades-roller5/",
    "/shades-roman/",
    "/shades-roman1/",
    "/shades-roman2/",
    "/shades-roman3/",
    "/shades-sheer1/",
    "/shades-sheer2/",
    "/shades-sheer3/",
    "/shades-sheer4/",
    "/shades-wovenwood1/",
    "/shades-wovenwood2/",
    "/shades-wovenwood4/",
    "/shades-wovenwood5/",
    "/shades-wovenwood6/"
  ],
  "/shutters/": [
    "/cropped-shutter-icon2-png/",
    "/pagelines-shutter-no-text-tall-jpg/",
    "/pagelines-shutter-no-text-tall-jpg-2/",
    "/pagelines-shutters-dark-jpg/",
    "/pagelines-shutters-dark-jpg-2/",
    "/pagelines-shutters-header-jpg/",
    "/pagelines-shutters-header3-jpg/",
    "/pagelines-shutters-jpg/",
    "/pagelines-shutters-overlay-png/",
    "/pagelines-shutters-text-only-png/",
    "/pagelines-shutters-text-only-png-2/",
    "/pagelines-shutters-text-only2-png/",
    "/pagelines-shutters1-jpg/",
    "/shutter-icon/",
    "/shutter-icon2/",
    "/shutters-eclipse1/",
    "/shutters-eclipse2/",
    "/shutters-eclipse3/",
    "/shutters-eclipse4/",
    "/shutters-eclipse5/",
    "/shutters-eclipse6/",
    "/shutters-gallery/",
    "/shutters-norman01/",
    "/shutters-norman02/",
    "/shutters-norman03/",
    "/shutters-norman04/",
    "/shutters-norman05/",
    "/shutters-norman06/",
    "/shutters-norman07/",
    "/shutters-norman08/",
    "/shutters-norman09/",
    "/shutters-norman10/",
    "/shutters-norman11/",
    "/shutters-norman12/",
    "/shutters-norman13/",
    "/shutters-norman14/",
    "/shutters-norman16/",
    "/shutters-norman17/",
    "/shutters-norman18/",
    "/shutters-norman19/",
    "/shutters-norman20/",
    "/shutters-norman21/",
    "/shutters-norman22/",
    "/shutters-norman23/",
    "/shutters-norman24/",
    "/shutters-page/"
  ],
  "/window-coverings/": [
    "/pagelines-products-header-jpg/",
    "/pagelines-products-slide-jpg/",
    "/pagelines-productsheader2-jpg/",
    "/products/"
  ],
  "/window-treatments/": [
    "/services/",
    "/services-1/",
    "/services-2/"
  ]
};

const legacyRedirects = Object.entries(legacyRedirectSources).flatMap(([destination, sources]) =>
  sources.map((source) => ({
    source,
    destination,
    permanent: true
  }))
);

// Canonicalize the apex domain to the www host so non-www requests don't
// split ranking signals across two hostnames. The host value is anchored
// (^...$) so it matches ONLY "805shutters.com" and never the www host,
// which prevents an infinite redirect loop.
const canonicalHostRedirect = {
  source: "/:path*",
  has: [{ type: "host", value: "^805shutters\\.com$" }],
  destination: "https://www.805shutters.com/:path*",
  permanent: true
};

const publicVercelHostRedirect = {
  source: "/:path*",
  has: [{ type: "host", value: "^805-one\\.vercel\\.app$" }],
  destination: "https://www.805shutters.com/:path*",
  permanent: true
};

const malformedPhoneRedirects = ["/TEL\\:8058069344/", "/tel\\:8058069344/"].map((source) => ({
  source,
  destination: "/contact/",
  permanent: true
}));

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
  trailingSlash: true,
  async headers() {
    return [
      {
        source: "/quote/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} https://web.squarecdn.com https://sandbox.web.squarecdn.com https://pay.google.com https://www.googletagmanager.com https://connect.facebook.net https://va.vercel-scripts.com`,
              "frame-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://pay.google.com",
              "connect-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com https://pay.google.com https://o160250.ingest.sentry.io https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com https://vitals.vercel-insights.com",
              "style-src 'self' 'unsafe-inline' https://web.squarecdn.com https://sandbox.web.squarecdn.com",
              "font-src 'self' data: https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net"
            ].join("; ")
          }
        ]
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          }
        ]
      }
    ];
  },
  async redirects() {
    return [canonicalHostRedirect, publicVercelHostRedirect, ...malformedPhoneRedirects, ...legacyRedirects];
  }
};

export default nextConfig;

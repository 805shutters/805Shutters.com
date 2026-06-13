import { site } from "./site-data";
import type { SitePage } from "./site-data";
import { commercialFaqs } from "./commercial-mode-data";

export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${site.baseUrl}#local-business`,
    name: site.name,
    url: site.baseUrl,
    telephone: site.phone,
    areaServed: site.areas.map((area) => ({
      "@type": "City",
      name: area
    })),
    address: {
      "@type": "PostalAddress",
      addressRegion: "CA",
      addressCountry: "US"
    },
    makesOffer: [
      "Custom shutters",
      "Custom window shades",
      "Custom blinds",
      "Custom drapery",
      "Commercial window coverings"
    ]
  };
}

export function commercialWindowCoveringsJsonLd(page: SitePage) {
  const pageUrl = `${site.baseUrl}${page.path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#commercial-window-coverings-service`,
        name: "Commercial Window Coverings in Ventura County",
        description: page.description,
        url: pageUrl,
        provider: {
          "@type": "LocalBusiness",
          "@id": `${site.baseUrl}#local-business`,
          name: site.name,
          telephone: site.phone,
          url: site.baseUrl
        },
        areaServed: site.areas.map((area) => ({
          "@type": "City",
          name: area
        })),
        serviceType: [
          "Commercial window coverings",
          "Commercial roller shades",
          "Solar shades",
          "Office blinds",
          "School window coverings",
          "Storefront roller shades",
          "Retail solar shades",
          "Warehouse office blinds"
        ],
        audience: [
          {
            "@type": "BusinessAudience",
            audienceType: "Schools and facilities"
          },
          {
            "@type": "BusinessAudience",
            audienceType: "Office buildings and tenant improvements"
          },
          {
            "@type": "BusinessAudience",
            audienceType: "Warehouses and industrial spaces"
          },
          {
            "@type": "BusinessAudience",
            audienceType: "Storefronts and retail spaces"
          }
        ]
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: commercialFaqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: site.baseUrl
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Commercial Window Coverings",
            item: pageUrl
          }
        ]
      }
    ]
  };
}

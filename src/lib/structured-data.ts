import { site } from "./site-data";
import { services } from "./site-data";
import type { SitePage } from "./site-data";
import type { AnswerPage } from "./llm-search-pages";
import { commercialFaqs } from "./commercial-mode-data";

export function localBusinessJsonLd() {
  const sameAs = Array.from(
    new Set([
      site.social.facebook,
      site.social.instagram,
      site.social.yelp,
      "https://www.yelp.com/biz/805-shutters-shades-blinds-camarillo-2",
      "https://www.bbb.org/us/ca/camarillo/profile/shutters/805-shutters-shades-blinds-1236-92080266",
      "https://www.mapquest.com/us/california/805-shutters-shades-blinds-378112738"
    ])
  );

  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${site.baseUrl}#local-business`,
    name: site.name,
    legalName: "805 Shutters, Shades & Blinds",
    alternateName: site.shortName,
    url: site.baseUrl,
    telephone: site.phone,
    email: site.email,
    image: `${site.baseUrl}/images/805-hero-window-treatments.png`,
    logo: `${site.baseUrl}/brand/805-shutters-logo-exact-transparent.png`,
    sameAs,
    description:
      "805 Shutters, Shades & Blinds is a family-owned local window treatment company serving Ventura County and nearby communities with more than 30 years of custom shutters, shades, blinds, commercial roller shades, and window covering experience.",
    foundingDate: "1995",
    founder: {
      "@type": "Person",
      name: "Ken Hill"
    },
    owner: {
      "@type": "Person",
      name: "Ken Hill"
    },
    priceRange: "$$",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        opens: "08:00",
        closes: "18:00"
      }
    ],
    areaServed: site.areas.map((area) => ({
      "@type": "City",
      name: area
    })),
    serviceArea: {
      "@type": "AdministrativeArea",
      name: site.serviceArea
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: "2209 Barbara Dr",
      addressLocality: "Santa Rosa Valley",
      addressRegion: "CA",
      postalCode: "93012",
      addressCountry: "US"
    },
    knowsAbout: [
      "Plantation shutters",
      "Custom shutters",
      "Window shades",
      "Custom blinds",
      "Drapery",
      "Exterior shades",
      "Commercial roller shades",
      "Window coverings"
    ],
    makesOffer: [
      "Custom shutters",
      "Custom window shades",
      "Custom blinds",
      "Custom drapery",
      "Commercial window coverings"
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "805 Shutters window covering services",
      itemListElement: services.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.title,
          description: service.description,
          areaServed: site.serviceArea,
          provider: {
            "@id": `${site.baseUrl}#local-business`
          },
          url: `${site.baseUrl}/${service.slug}/`
        }
      }))
    }
  };
}

export function answerPageJsonLd(page: AnswerPage) {
  const pageUrl = `${site.baseUrl}${page.path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: page.title,
        description: page.description,
        dateModified: page.updated,
        inLanguage: "en-US",
        isPartOf: {
          "@type": "WebSite",
          "@id": `${site.baseUrl}#website`,
          name: site.name,
          url: site.baseUrl
        },
        about: page.serviceTypes.map((serviceType) => ({
          "@type": "Service",
          name: serviceType,
          provider: {
            "@id": `${site.baseUrl}#local-business`
          }
        })),
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${site.baseUrl}${page.image}`
        }
      },
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: page.h1,
        description: page.answer,
        serviceType: page.serviceTypes,
        areaServed: site.areas.map((area) => ({
          "@type": "City",
          name: area
        })),
        provider: {
          "@id": `${site.baseUrl}#local-business`,
          name: site.name,
          telephone: site.phone,
          url: site.baseUrl
        }
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: page.faqs.map((faq) => ({
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
            name: page.h1,
            item: pageUrl
          }
        ]
      }
    ]
  };
}

export function commercialSubPageJsonLd(page: SitePage, cityName?: string | null) {
  const pageUrl = `${site.baseUrl}${page.path}`;
  const flagshipUrl = `${site.baseUrl}/commercial-window-coverings/`;
  const areaServed = cityName
    ? [{ "@type": "City", name: cityName }]
    : site.areas.map((area) => ({ "@type": "City", name: area }));

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#commercial-service`,
        name: page.h1,
        description: page.description,
        url: pageUrl,
        provider: {
          "@type": "LocalBusiness",
          "@id": `${site.baseUrl}#local-business`,
          name: site.name,
          telephone: site.phone,
          url: site.baseUrl
        },
        areaServed,
        serviceType: [
          "Commercial window coverings",
          "Commercial roller shades",
          "Solar shades",
          "Office blinds",
          "Storefront roller shades",
          "Warehouse office blinds"
        ]
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
            item: flagshipUrl
          },
          {
            "@type": "ListItem",
            position: 3,
            name: cityName ? `${cityName} Commercial Window Coverings` : page.h1,
            item: pageUrl
          }
        ]
      }
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

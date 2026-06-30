import { site } from "./site-data";
import { services } from "./site-data";
import type { SitePage } from "./site-data";
import type { AnswerPage } from "./llm-search-pages";
import { commercialFaqs } from "./commercial-mode-data";

type JsonLdNode = Record<string, unknown>;

function localBusinessId() {
  return `${site.baseUrl}#local-business`;
}

function websiteId() {
  return `${site.baseUrl}#website`;
}

function areaServed() {
  return site.areas.map((area) => ({
    "@type": "City",
    name: area
  }));
}

function providerReference() {
  return {
    "@id": localBusinessId(),
    name: site.name,
    telephone: site.phone,
    url: site.baseUrl
  };
}

function slugifySchemaId(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function freeConsultationAction(pageUrl: string, name: string) {
  return {
    "@type": "ReserveAction",
    name,
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${site.baseUrl}/free-window-treatment-consultation/`,
      actionPlatform: [
        "https://schema.org/DesktopWebPlatform",
        "https://schema.org/MobileWebPlatform"
      ]
    },
    object: {
      "@id": `${pageUrl}#service`
    }
  };
}

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
    "@graph": [
      {
        "@type": ["HomeAndConstructionBusiness", "LocalBusiness"],
        "@id": localBusinessId(),
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
        contactPoint: {
          "@type": "ContactPoint",
          telephone: site.phone,
          email: site.email,
          contactType: "customer service",
          areaServed: "US-CA",
          availableLanguage: "English"
        },
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
        areaServed: areaServed(),
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
          "Window coverings",
          "Motorized shades",
          "Sliding door window treatments"
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
          "@id": `${site.baseUrl}#service-catalog`,
          name: "805 Shutters window covering services",
          itemListElement: services.map((service) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: service.title,
              description: service.description,
              areaServed: site.serviceArea,
              provider: {
                "@id": localBusinessId()
              },
              url: `${site.baseUrl}/${service.slug}/`
            }
          }))
        }
      },
      {
        "@type": "WebSite",
        "@id": websiteId(),
        name: site.name,
        alternateName: "805 Shutters, Shades & Blinds",
        url: site.baseUrl,
        inLanguage: "en-US",
        publisher: {
          "@id": localBusinessId()
        }
      }
    ]
  };
}

export function faqPageJsonLd(page: SitePage) {
  const pageUrl = `${site.baseUrl}${page.path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        url: pageUrl,
        name: page.title,
        mainEntity: page.sections.map((section) => ({
          "@type": "Question",
          name: section.heading,
          acceptedAnswer: {
            "@type": "Answer",
            text: section.body
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

export function servicePageJsonLd(page: SitePage) {
  const pageUrl = `${site.baseUrl}${page.path}`;
  const graph: JsonLdNode[] = [
    {
      "@type": "Service",
      "@id": `${pageUrl}#service`,
      name: page.h1,
      description: page.description,
      url: pageUrl,
      serviceType: page.eyebrow,
      provider: {
        "@id": localBusinessId(),
        name: site.name,
        telephone: site.phone,
        url: site.baseUrl
      },
      areaServed: areaServed()
    }
  ];

  if (page.faqs?.length) {
    graph.push({
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
    });
  }

  graph.push({
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
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph
  };
}

export function answerPageJsonLd(page: AnswerPage) {
  const pageUrl = `${site.baseUrl}${page.path}`;
  const serviceId = `${pageUrl}#service`;
  const offerCatalogId = `${pageUrl}#offer-catalog`;
  const productListId = `${pageUrl}#recommended-options`;

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
          "@id": websiteId(),
          name: site.name,
          url: site.baseUrl
        },
        mainEntity: {
          "@id": serviceId
        },
        breadcrumb: {
          "@id": `${pageUrl}#breadcrumb`
        },
        about: page.serviceTypes.map((serviceType) => ({
          "@type": ["Service", "Product"],
          "@id": `${pageUrl}#${slugifySchemaId(serviceType)}`,
          name: serviceType,
          category: "Window treatment",
          provider: {
            "@id": localBusinessId()
          }
        })),
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${site.baseUrl}${page.image}`
        }
      },
      {
        "@type": "Service",
        "@id": serviceId,
        name: page.h1,
        description: page.answer,
        url: pageUrl,
        serviceType: page.serviceTypes,
        category: "Custom window treatments",
        areaServed: areaServed(),
        provider: providerReference(),
        audience: [
          {
            "@type": "PeopleAudience",
            audienceType: "Ventura County homeowners"
          },
          {
            "@type": "BusinessAudience",
            audienceType: "Ventura County business and property managers"
          }
        ],
        availableChannel: {
          "@type": "ServiceChannel",
          serviceUrl: `${site.baseUrl}/free-window-treatment-consultation/`,
          servicePhone: site.phone
        },
        hasOfferCatalog: {
          "@id": offerCatalogId
        },
        offers: {
          "@type": "Offer",
          name: `Free in-home consultation for ${page.h1}`,
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${site.baseUrl}/free-window-treatment-consultation/`
        },
        potentialAction: freeConsultationAction(pageUrl, `Book a free consultation for ${page.h1}`)
      },
      {
        "@type": "OfferCatalog",
        "@id": offerCatalogId,
        name: `${page.h1} options`,
        itemListElement: page.serviceTypes.map((serviceType, index) => ({
          "@type": "Offer",
          "@id": `${pageUrl}#offer-${index + 1}`,
          name: `${serviceType} consultation and installation`,
          availability: "https://schema.org/InStock",
          areaServed: site.serviceArea,
          url: pageUrl,
          itemOffered: {
            "@type": ["Service", "Product"],
            "@id": `${pageUrl}#${slugifySchemaId(serviceType)}`,
            name: serviceType,
            category: "Window treatment",
            brand: {
              "@type": "Brand",
              name: site.name
            },
            provider: {
              "@id": localBusinessId()
            },
            areaServed: areaServed()
          }
        }))
      },
      {
        "@type": "ItemList",
        "@id": productListId,
        name: `${page.h1} recommended options`,
        numberOfItems: page.serviceTypes.length,
        itemListElement: page.serviceTypes.map((serviceType, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": ["Product", "Service"],
            "@id": `${pageUrl}#${slugifySchemaId(serviceType)}`,
            name: serviceType,
            category: "Window treatment",
            provider: {
              "@id": localBusinessId()
            }
          }
        }))
      },
      {
        "@type": "HowTo",
        "@id": `${pageUrl}#consultation-process`,
        name: `How 805 Shutters recommends ${page.h1.toLowerCase()}`,
        description: "The consultation compares the room, window details, product fit, and installation requirements before ordering.",
        supply: page.serviceTypes.map((serviceType) => ({
          "@type": "HowToSupply",
          name: serviceType
        })),
        step: [
          {
            "@type": "HowToStep",
            name: "Review the room",
            text: "Confirm how the room is used, the privacy goal, sun exposure, glare, heat, and view needs."
          },
          {
            "@type": "HowToStep",
            name: "Compare product fit",
            text: "Compare shutters, shades, blinds, or commercial coverings against the opening and daily use."
          },
          {
            "@type": "HowToStep",
            name: "Measure and plan installation",
            text: "Confirm measurements, mounting details, controls, colors, and installation expectations before ordering."
          }
        ],
        provider: {
          "@id": localBusinessId()
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

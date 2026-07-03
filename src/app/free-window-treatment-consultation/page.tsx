import type { Metadata } from "next";
import { LeadForm } from "@/components/LeadForm";
import { TrackedPhoneLink } from "@/components/TrackedPhoneLink";
import { UtmPreservingLink } from "@/components/UtmPreservingLink";
import { ogDefaults, site } from "@/lib/site-data";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Free Window Treatment Consultation in Ventura County | 805 Shutters",
  description:
    "Request a free in-home consultation for custom shutters, shades, blinds, exterior shades, and commercial window coverings in Ventura County.",
  alternates: {
    canonical: "/free-window-treatment-consultation/"
  },
  openGraph: {
    ...ogDefaults,
    title: "Free Window Treatment Consultation | 805 Shutters",
    description:
      "Compare custom shutters, shades, blinds, and window coverings with a local Ventura County installer.",
    url: `${site.baseUrl}/free-window-treatment-consultation/`,
    images: [
      {
        url: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
        alt: "Custom shutters installed in a Ventura County living room"
      }
    ]
  }
};

const proofPoints = [
  "Family-owned Ventura County company",
  "30+ years local experience",
  "Yelp reviews",
  "Free in-home consultation"
];

const productPaths = [
  {
    title: "Plantation Shutters",
    body: "Custom shutters for clean lines, durable privacy, specialty shapes, doors, and whole-home upgrades.",
    image: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
    alt: "Tall living room windows fitted with custom plantation shutters",
    href: "/shutters/"
  },
  {
    title: "Window Shades",
    body: "Roller, honeycomb, woven, Roman, room-darkening, and motorized shades for light control and softness.",
    image: "/images/portfolio-enhanced/roller-shade-large-window-wide.jpg",
    alt: "Large window with a custom roller shade",
    href: "/shades/"
  },
  {
    title: "Custom Blinds",
    body: "Wood, faux wood, aluminum, vertical, and softwood blinds measured for homes, offices, and rentals.",
    image: "/images/805-portfolio-blinds-office.jpg",
    alt: "Warm wood blinds installed in a Ventura County office",
    href: "/blinds/"
  },
  {
    title: "Commercial Coverings",
    body: "Roller shades and practical coverings for offices, storefronts, schools, medical spaces, and shared rooms.",
    image: "/images/product-previews/commercial-socal-office-hero.jpg",
    alt: "Commercial office windows with roller shade planning",
    href: "/commercial-window-coverings/"
  }
];

const processSteps = [
  {
    title: "Walk the rooms",
    body: "Review windows, light, privacy, heat, glare, mounting details, and the way each room is used."
  },
  {
    title: "Compare products",
    body: "Look at shutter, shade, blind, drapery, exterior, and commercial options before anything is ordered."
  },
  {
    title: "Confirm the fit",
    body: "Measure openings, confirm colors and controls, then plan installation around the property."
  }
];

const faqs = [
  {
    question: "Is the consultation free?",
    answer:
      "Yes. 805 Shutters offers free in-home consultations for Ventura County window treatment projects."
  },
  {
    question: "Can I compare shutters, shades, and blinds in one visit?",
    answer:
      "Yes. The consultation is designed to compare product types, materials, colors, privacy, light control, operation, and installation details."
  },
  {
    question: "Do you handle commercial spaces?",
    answer:
      "Yes. 805 Shutters helps with commercial roller shades and window coverings for offices, storefronts, schools, medical spaces, and shared workspaces."
  },
  {
    question: "What areas do you serve?",
    answer: `805 Shutters serves ${site.serviceArea}, including ${site.areas
      .slice(0, 8)
      .join(", ")}, and nearby communities.`
  }
];

const consultationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${site.baseUrl}/free-window-treatment-consultation/#webpage`,
      url: `${site.baseUrl}/free-window-treatment-consultation/`,
      name: metadata.title,
      description: metadata.description,
      isPartOf: {
        "@type": "WebSite",
        "@id": `${site.baseUrl}#website`,
        name: site.name,
        url: site.baseUrl
      },
      mainEntity: {
        "@id": `${site.baseUrl}/free-window-treatment-consultation/#service`
      },
      potentialAction: {
        "@type": "CommunicateAction",
        name: "Request a free window treatment consultation",
        target: `${site.baseUrl}/free-window-treatment-consultation/#consultation-form`
      }
    },
    {
      "@type": "Service",
      "@id": `${site.baseUrl}/free-window-treatment-consultation/#service`,
      name: "Free in-home window treatment consultation",
      description:
        "Free Ventura County consultation to compare custom shutters, shades, blinds, exterior shades, drapery, and commercial window coverings.",
      serviceType: [
        "Window treatment consultation",
        "Custom shutters",
        "Window shades",
        "Custom blinds",
        "Commercial window coverings"
      ],
      provider: {
        "@id": `${site.baseUrl}#local-business`
      },
      areaServed: site.areas.map((area) => ({
        "@type": "City",
        name: area
      })),
      offers: {
        "@type": "Offer",
        name: "Free in-home consultation",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${site.baseUrl}/free-window-treatment-consultation/`
      }
    },
    {
      "@type": "OfferCatalog",
      "@id": `${site.baseUrl}/free-window-treatment-consultation/#consultation-options`,
      name: "Window treatment consultation product categories",
      itemListElement: productPaths.map((product) => ({
        "@type": "Offer",
        name: product.title,
        url: `${site.baseUrl}${product.href}`,
        itemOffered: {
          "@type": ["Product", "Service"],
          name: product.title,
          description: product.body,
          category: "Window treatment",
          provider: {
            "@id": `${site.baseUrl}#local-business`
          }
        }
      }))
    },
    {
      "@type": "FAQPage",
      "@id": `${site.baseUrl}/free-window-treatment-consultation/#faq`,
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${site.baseUrl}/free-window-treatment-consultation/#breadcrumb`,
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
          name: "Free Window Treatment Consultation",
          item: `${site.baseUrl}/free-window-treatment-consultation/`
        }
      ]
    }
  ]
};

export default function FreeWindowTreatmentConsultationPage() {
  return (
    <div className={styles.adLanding}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(consultationJsonLd)
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroShade} />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Ventura County shutters, shades, and blinds</p>
          <h1>Free Window Treatment Consultation</h1>
          <p className={styles.heroText}>
            Compare custom shutters, shades, blinds, drapery, exterior shades, and commercial coverings with a local
            Ventura County team.
          </p>
          <div className={styles.heroActions}>
            <a className="button primary" href="#consultation-form">
              Request Consultation
            </a>
            <TrackedPhoneLink className="button secondary" location="free consultation landing hero">
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
          <div className={styles.proofStrip} aria-label="805 Shutters proof points">
            {proofPoints.map((point) => (
              <span key={point}>{point}</span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.conversionBand} id="consultation-form">
        <div className={styles.conversionLayout}>
          <div className={styles.conversionCopy}>
            <p className={styles.eyebrow}>Start here</p>
            <h2>Tell us what you want to update.</h2>
            <p>
              Send the basics and 805 Shutters will follow up about product options, timing, and the best next step for
              your project. Prefer to pick a time directly?
            </p>
            <div className={styles.inlineActions}>
              <UtmPreservingLink href="/book-consultation/">Book a consultation</UtmPreservingLink>
              <TrackedPhoneLink location="free consultation landing form copy">Call {site.phone}</TrackedPhoneLink>
            </div>
            <ul className={styles.checkList}>
              <li>Custom measuring and installation</li>
              <li>Residential and commercial options</li>
              <li>Local service across Ventura County</li>
            </ul>
          </div>
          <div className={styles.formPanel}>
            <LeadForm
              notesPlaceholder="Tell us about the rooms, product interest, timing, or number of windows."
              submitLabel="Request My Free Consultation"
            />
          </div>
        </div>
      </section>

      <section className={styles.productBand} aria-labelledby="consultation-products">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Product fit</p>
          <h2 id="consultation-products">One consultation can compare every major option.</h2>
        </div>
        <div className={styles.productGrid}>
          {productPaths.map((product) => (
            <article className={styles.productCard} key={product.title}>
              <img src={product.image} alt={product.alt} loading="lazy" decoding="async" />
              <div>
                <h3>{product.title}</h3>
                <p>{product.body}</p>
                <UtmPreservingLink href={product.href}>View options</UtmPreservingLink>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.processBand} aria-labelledby="consultation-process">
        <div className={styles.processIntro}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 id="consultation-process">Measured before ordering, planned before installing.</h2>
        </div>
        <div className={styles.processGrid}>
          {processSteps.map((step, index) => (
            <article className={styles.processStep} key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.serviceAreaBand} aria-labelledby="service-area">
        <div className={styles.serviceAreaInner}>
          <div>
            <p className={styles.eyebrow}>Local service area</p>
            <h2 id="service-area">Serving homeowners and businesses across Ventura County.</h2>
          </div>
          <ul className={styles.cityList}>
            {site.areas.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.faqBand} aria-labelledby="consultation-faq">
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>Questions</p>
          <h2 id="consultation-faq">Common consultation questions.</h2>
        </div>
        <div className={styles.faqGrid}>
          {faqs.map((item) => (
            <article className={styles.faqItem} key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
        <div className={styles.finalCta}>
          <a className="button primary" href="#consultation-form">
            Request Consultation
          </a>
          <TrackedPhoneLink className="button secondary" location="free consultation landing final cta">
            Call {site.phone}
          </TrackedPhoneLink>
        </div>
      </section>
    </div>
  );
}

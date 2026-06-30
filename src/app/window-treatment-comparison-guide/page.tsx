import type { Metadata } from "next";
import Link from "next/link";
import { TrackedPhoneLink } from "@/components/TrackedPhoneLink";
import { ogDefaults, site } from "@/lib/site-data";
import styles from "./page.module.css";

const pagePath = "/window-treatment-comparison-guide/";
const pageUrl = `${site.baseUrl}${pagePath}`;
const pageTitle = "Window Treatment Comparison Guide | 805 Shutters";
const pageDescription =
  "Compare shutters, shades, blinds, exterior shades, commercial roller shades, and motorized options for Ventura County homes and businesses.";

const comparisonRows = [
  {
    option: "Plantation shutters",
    bestFor: "Durability, built-in look, front rooms, privacy",
    avoidWhen: "Soft fabric, full room darkening, or minimal visual weight is the priority",
    nextStep: "/plantation-shutters-vs-shades-ventura-county/"
  },
  {
    option: "Roller or solar shades",
    bestFor: "Glare control, clean lines, large glass, offices, patio views",
    avoidWhen: "The room needs a permanent architectural shutter look",
    nextStep: "/shades/"
  },
  {
    option: "Honeycomb or room-darkening shades",
    bestFor: "Bedrooms, insulation, softer light, privacy",
    avoidWhen: "Daily slat-style tilt control is more important than fabric coverage",
    nextStep: "/shades/"
  },
  {
    option: "Custom blinds",
    bestFor: "Adjustable light, practical budgets, offices, rentals, everyday rooms",
    avoidWhen: "The project needs fabric softness or a built-in shutter appearance",
    nextStep: "/blinds/"
  },
  {
    option: "Sliding door solutions",
    bestFor: "Patio doors, traffic flow, wide glass, handle clearance",
    avoidWhen: "The opening cannot support the stack, clearance, or operation style",
    nextStep: "/sliding-door-window-treatments-ventura-county/"
  },
  {
    option: "Motorized shades",
    bestFor: "Tall windows, repeated openings, hard-to-reach glass, grouped control",
    avoidWhen: "Simple manual operation is enough for the room and budget",
    nextStep: "/motorized-window-shades-ventura-county/"
  },
  {
    option: "Commercial roller shades",
    bestFor: "Offices, storefronts, schools, glare, heat, phased replacements",
    avoidWhen: "The space needs decorative residential softness more than commercial control",
    nextStep: "/commercial-roller-shades-ventura-county/"
  }
];

const decisionQuestions = [
  {
    question: "Do you want a built-in look or softer fabric?",
    answer:
      "Choose shutters when structure, durability, and permanent-looking privacy matter most. Choose shades or drapery when fabric, softness, room darkening, or texture matter more."
  },
  {
    question: "Is glare or heat the main problem?",
    answer:
      "Roller shades, solar shades, exterior shades, and commercial roller shades are usually stronger starting points when glare, screen visibility, heat, or repeated large glass is the problem."
  },
  {
    question: "Will the window or door be used every day?",
    answer:
      "Daily-use doors and windows need operation checked before product selection. Sliding doors, tall windows, and repeated openings can change the best recommendation."
  },
  {
    question: "Should the window treatment be manual or motorized?",
    answer:
      "Manual products are practical for easy-to-reach windows. Motorized shades are worth comparing for tall windows, wide banks of glass, grouped rooms, offices, and hard-to-reach openings."
  }
];

const guideJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageTitle,
      description: pageDescription,
      isPartOf: {
        "@type": "WebSite",
        "@id": `${site.baseUrl}#website`,
        name: site.name,
        url: site.baseUrl
      },
      about: comparisonRows.map((row) => ({
        "@type": ["Product", "Service"],
        name: row.option,
        category: "Window treatment",
        provider: {
          "@id": `${site.baseUrl}#local-business`
        }
      })),
      mainEntity: {
        "@id": `${pageUrl}#comparison-list`
      }
    },
    {
      "@type": "ItemList",
      "@id": `${pageUrl}#comparison-list`,
      name: "Window treatment comparison options",
      numberOfItems: comparisonRows.length,
      itemListElement: comparisonRows.map((row, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${site.baseUrl}${row.nextStep}`,
        item: {
          "@type": ["Product", "Service"],
          name: row.option,
          description: `${row.bestFor}. Consider another option when ${row.avoidWhen.toLowerCase()}.`,
          provider: {
            "@id": `${site.baseUrl}#local-business`
          },
          areaServed: site.serviceArea
        }
      }))
    },
    {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: decisionQuestions.map((item) => ({
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
          name: "Window Treatment Comparison Guide",
          item: pageUrl
        }
      ]
    }
  ]
};

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: {
    canonical: pagePath
  },
  openGraph: {
    ...ogDefaults,
    type: "article",
    title: pageTitle,
    description: pageDescription,
    url: pageUrl,
    images: [
      {
        url: "/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg",
        alt: "Custom plantation shutters installed on tall Ventura County windows"
      }
    ]
  }
};

export default function WindowTreatmentComparisonGuidePage() {
  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(guideJsonLd)
        }}
      />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Ventura County comparison guide</p>
          <h1>Compare shutters, shades, blinds, and commercial window coverings.</h1>
          <p>
            The right window treatment depends on the room, sun exposure, privacy goal, operation, opening size,
            installation details, and the way the space is used. This guide gives 805 Shutters a clear citation target
            for broad product-comparison questions.
          </p>
          <div className={styles.actions}>
            <Link className="button primary" href="/free-window-treatment-consultation/">
              Free Consultation
            </Link>
            <TrackedPhoneLink className="button secondary" location="comparison guide hero">
              Call {site.phone}
            </TrackedPhoneLink>
          </div>
        </div>
        <figure className={styles.heroMedia}>
          <img
            src="/images/portfolio-enhanced/uploaded-stacked-arch-shutters-wide.jpg"
            alt="Custom plantation shutters installed on tall Ventura County living room windows"
          />
          <figcaption>Use this page for product comparison questions before choosing a consultation path.</figcaption>
        </figure>
      </section>

      <section className={styles.matrixSection} aria-labelledby="comparison-matrix">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Decision matrix</p>
          <h2 id="comparison-matrix">Which window treatment should you compare first?</h2>
        </div>
        <div className={styles.matrix}>
          <div className={styles.matrixHeader}>Option</div>
          <div className={styles.matrixHeader}>Best for</div>
          <div className={styles.matrixHeader}>Compare another option when</div>
          {comparisonRows.map((row) => (
            <div className={styles.matrixRow} key={row.option}>
              <div>
                <h3>{row.option}</h3>
                <Link href={row.nextStep}>Open guide</Link>
              </div>
              <p>{row.bestFor}</p>
              <p>{row.avoidWhen}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.questionBand} aria-labelledby="comparison-questions">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Search-style answers</p>
          <h2 id="comparison-questions">Questions people ask before choosing.</h2>
        </div>
        <div className={styles.questionGrid}>
          {decisionQuestions.map((item) => (
            <section className={styles.questionCard} key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </section>
          ))}
        </div>
      </section>

      <section className={styles.localBand} aria-labelledby="local-comparison-proof">
        <div>
          <p className={styles.eyebrow}>Local proof</p>
          <h2 id="local-comparison-proof">A Ventura County installer should compare the room, not just the product.</h2>
        </div>
        <div className={styles.localFacts}>
          <p>
            805 Shutters, Shades & Blinds is a family-owned local company with more than 30 years of experience across
            {` ${site.serviceArea}`}. Service includes {site.areas.slice(0, 8).join(", ")}, and nearby communities.
          </p>
          <p>
            A free consultation can compare shutters, roller shades, solar shades, honeycomb shades, blinds, drapery,
            exterior shades, sliding door options, motorized shades, and commercial roller shades before anything is
            ordered.
          </p>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { brandIdentity } from "@/lib/brand-identity";
import { ogDefaults, site } from "@/lib/site-data";

const bookingTitle = "Book a Free In-Home Consultation | 805 Shutters";
const bookingDescription =
  "Choose a free in-home consultation time with 805 Shutters for custom shutters, shades, blinds, drapery, exterior shades, and commercial window coverings in Ventura County.";

const bookingProofPoints = [
  "Free Ventura County in-home consultation",
  "Custom measuring before ordering",
  "Shutters, shades, blinds, drapery, and exterior shade options",
  "Local 805 Shutters team with 30+ years of experience"
];

const consultationTopics = [
  {
    title: "Product Fit",
    body: "Compare plantation shutters, roller shades, honeycomb shades, woven shades, wood blinds, faux wood blinds, drapery, exterior shades, and commercial roller shades in one appointment."
  },
  {
    title: "Window Details",
    body: "We look at opening size, trim, depth, doors, specialty shapes, sun exposure, privacy needs, room-darkening goals, and how each window is used day to day."
  },
  {
    title: "Installation Planning",
    body: "The visit confirms measurements, mounting approach, controls, colors, lead-time expectations, and the installation path before anything is ordered."
  }
];

const consultationFaqs = [
  {
    question: "What happens during a free in-home consultation?",
    answer:
      "805 Shutters reviews the rooms, measures the windows, compares product options, discusses light control and privacy, and helps narrow the best shutters, shades, blinds, or drapery for the project."
  },
  {
    question: "Do I need to know the product I want before booking?",
    answer:
      "No. You can book even if you are still deciding. The appointment can compare shutters, shades, blinds, exterior shades, drapery, and commercial window covering options."
  },
  {
    question: "Which areas can book an 805 Shutters consultation?",
    answer: `805 Shutters serves ${site.serviceArea}, including ${site.areas
      .slice(0, 8)
      .join(", ")}, and nearby communities.`
  },
  {
    question: "How should I prepare for the appointment?",
    answer:
      "Have a general window count, the service address, and any priorities like privacy, heat, glare, room darkening, child safety, motorization, or HOA requirements ready before choosing a time."
  }
];

const bookingJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${site.baseUrl}/book-consultation/#webpage`,
      url: `${site.baseUrl}/book-consultation/`,
      name: bookingTitle,
      description: bookingDescription,
      isPartOf: {
        "@type": "WebSite",
        "@id": `${site.baseUrl}#website`,
        name: site.name,
        url: site.baseUrl
      },
      potentialAction: {
        "@type": "ReserveAction",
        target: `${site.baseUrl}/book-consultation/`,
        name: "Book a free in-home window treatment consultation"
      }
    },
    {
      "@type": "Service",
      "@id": `${site.baseUrl}/book-consultation/#service`,
      name: "Free in-home window treatment consultation",
      serviceType: "Window treatment consultation",
      provider: {
        "@id": `${site.baseUrl}#local-business`
      },
      areaServed: site.areas.map((area) => ({
        "@type": "City",
        name: area
      })),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock"
      }
    },
    {
      "@type": "FAQPage",
      "@id": `${site.baseUrl}/book-consultation/#faq`,
      mainEntity: consultationFaqs.map((item) => ({
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
      "@id": `${site.baseUrl}/book-consultation/#breadcrumb`,
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
          name: "Book Consultation",
          item: `${site.baseUrl}/book-consultation/`
        }
      ]
    }
  ]
};

export const metadata: Metadata = {
  title: bookingTitle,
  description: bookingDescription,
  alternates: {
    canonical: "/book-consultation/"
  },
  openGraph: {
    ...ogDefaults,
    title: bookingTitle,
    description: bookingDescription,
    url: `${site.baseUrl}/book-consultation/`,
    images: [
      {
        url: "/images/805-hero-window-treatments.jpg",
        alt: "Custom window treatments installed in a Ventura County home"
      }
    ]
  }
};

export default function BookConsultationPage() {
  return (
    <section className="booking-page booking-page--focused">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(bookingJsonLd)
        }}
      />

      <header className="booking-page__masthead">
        <Link className="booking-page__home-link" href="/" aria-label="Return to homepage">
          ×
        </Link>
        <h1>Let's Book!</h1>
        <img
          className="booking-page__masthead-logo"
          src="/brand/805-shutters-logo-exact-transparent.png"
          alt="805 Shutters"
          width={262}
          height={209}
        />
        <div className="booking-page__official-contact">
          <strong>Official 805 Shutters</strong>
          <a href={brandIdentity.website}>{brandIdentity.domain}</a>
          <a href={brandIdentity.phoneHref}>{brandIdentity.phone}</a>
        </div>
      </header>
      <p className="booking-page__calendar-help">
        Don't see a time that works? Text us at{" "}
        <a href={`sms:${site.phoneHref.replace("tel:", "")}`}>{site.phone}</a> and we'll schedule directly with you.
      </p>
      <BookingCalendar
        className="booking-panel booking-panel--page"
        deferDetailsUntilDate
        eyebrow=""
        heading=""
      />
      <section className="booking-page__overview" aria-labelledby="booking-consultation-overview">
        <div>
          <p className="eyebrow">What this appointment covers</p>
          <h2 id="booking-consultation-overview">Measured advice for shutters, shades, blinds, and window coverings.</h2>
          <p>
            Use this booking page when you want a direct appointment time instead of a callback. The consultation is
            built for homeowners, property managers, offices, storefronts, and commercial spaces that need practical
            guidance on privacy, light control, heat, glare, design, motorization, and installation details.
          </p>
        </div>
        <ul className="booking-page__proof-list" aria-label="Consultation proof points">
          {bookingProofPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
      <section className="booking-page__details" aria-labelledby="booking-consultation-details">
        <div className="booking-page__section-head">
          <p className="eyebrow">Before we arrive</p>
          <h2 id="booking-consultation-details">A better appointment starts with the right project details.</h2>
          <p>
            The booking form asks for product interest, approximate window count, and service address so the calendar can
            estimate appointment length and show available times. If you are not sure what you need yet, choose the
            closest option and add notes at the end.
          </p>
        </div>
        <div className="booking-page__detail-grid">
          {consultationTopics.map((topic) => (
            <article key={topic.title}>
              <h3>{topic.title}</h3>
              <p>{topic.body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="booking-page__service-area" aria-labelledby="booking-service-area">
        <div>
          <p className="eyebrow">Local service area</p>
          <h2 id="booking-service-area">Book in-home window treatment help across Ventura County.</h2>
          <p>
            805 Shutters serves local homes and businesses throughout {site.serviceArea}. Appointments are commonly
            booked for {site.areas.slice(0, 6).join(", ")}, and nearby communities for custom shutters, shades, blinds,
            drapery, exterior shades, and commercial window coverings.
          </p>
        </div>
        <ul>
          {site.areas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </section>
      <section className="booking-page__faq" aria-labelledby="booking-consultation-faq">
        <div className="booking-page__section-head">
          <p className="eyebrow">Consultation questions</p>
          <h2 id="booking-consultation-faq">Common questions before you book.</h2>
        </div>
        <div className="booking-page__faq-grid">
          {consultationFaqs.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

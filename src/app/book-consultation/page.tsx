import type { Metadata } from "next";
import Link from "next/link";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import { ogDefaults, site } from "@/lib/site-data";

const bookingTitle = "Book a Free In-Home Consultation | 805 Shutters";
const bookingDescription =
  "Book a free in-home consultation with 805 Shutters for custom shutters, shades, blinds, drapery, and exterior shades in Ventura County.";

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
        url: "/images/805-hero-window-treatments.png",
        alt: "Custom window treatments installed in a Ventura County home"
      }
    ]
  }
};

export default function BookConsultationPage() {
  return (
    <section className="booking-page booking-page--focused">
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
      </header>
      <BookingCalendar
        className="booking-panel booking-panel--page"
        deferDetailsUntilDate
        eyebrow=""
        heading=""
      />
    </section>
  );
}

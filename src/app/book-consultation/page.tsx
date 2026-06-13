import type { Metadata } from "next";
import { BookingCalendar } from "@/components/booking/BookingCalendar";

export const metadata: Metadata = {
  title: "Book a Free In-Home Consultation | 805 Shutters",
  description:
    "Book a free in-home consultation with 805 Shutters for custom shutters, shades, blinds, drapery, and exterior shades in Ventura County.",
  alternates: {
    canonical: "/book-consultation/"
  }
};

export default function BookConsultationPage() {
  return (
    <section className="booking-page booking-page--focused">
      <header className="booking-page__masthead">
        <span className="booking-page__masthead-logo brand-text-logo" aria-label="805 Shutters">
          <span className="brand-text-logo-number">805</span>
          <span className="brand-text-logo-name">SHUTTERS</span>
        </span>
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

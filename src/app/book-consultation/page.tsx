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

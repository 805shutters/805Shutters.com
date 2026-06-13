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
      <div className="booking-page__brand">
        <img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={262} height={209} />
      </div>
      <BookingCalendar
        className="booking-panel booking-panel--page"
        deferDetailsUntilDate
        eyebrow=""
        heading="Book your free in-home consultation here"
      />
    </section>
  );
}

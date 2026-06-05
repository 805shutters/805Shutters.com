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
    <section className="booking-page">
      <div className="booking-page__intro">
        <p className="eyebrow">805 Shutters</p>
        <h1>Book a Free In-Home Consultation</h1>
      </div>
      <BookingCalendar className="booking-panel booking-panel--page" />
    </section>
  );
}

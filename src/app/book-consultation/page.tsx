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
      <BookingCalendar className="booking-panel booking-panel--page" />
      <div className="booking-page__intro">
        <p className="eyebrow">805 Shutters</p>
        <h1>Book a Free In-Home Consultation</h1>
        <p>
          Select an available date and time for a Ventura County window treatment consultation. 805 Shutters can help compare
          custom shutters, shades, blinds, drapery, exterior shades, and commercial window coverings for privacy, light
          control, color, materials, measurements, and installation planning.
        </p>
        <p>
          After you choose a time, share your name, phone number, address, and project details so the appointment can be
          reserved on the CRM calendar and followed up by the 805 Shutters team.
        </p>
        <p>
          The appointment is used to confirm window measurements, mounting conditions, product fit, privacy goals, sun
          exposure, room-darkening needs, child-safety requirements, color direction, and whether manual or motorized controls
          make the most sense. Customers can use the same visit to compare plantation shutters, wood blinds, faux wood blinds,
          vertical blinds, roller shades, honeycomb shades, woven shades, drapery, and outdoor shade options.
        </p>
        <p>
          805 Shutters serves Camarillo, Thousand Oaks, Ventura, Oxnard, Simi Valley, Moorpark, Ojai, Port Hueneme, Santa
          Paula, Santa Rosa Valley, Oak Park, Fillmore, and nearby Ventura County communities. If you are not sure which window
          covering is best, book the consultation and the team will help narrow the choices before anything is quoted or ordered.
        </p>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { trackBookingStep } from "@/lib/client-tracking";
import { BookingCalendar, type BookingCalendarVariant } from "./BookingCalendar";

export function AppointmentBooking({
  className = "button primary",
  label = "Book an appointment here",
  bookingVariant = "standard"
}: {
  className?: string;
  label?: string;
  bookingVariant?: BookingCalendarVariant;
}) {
  const [open, setOpen] = useState(false);

  function closeBooking() {
    setOpen(false);
  }

  function openBooking() {
    trackBookingStep({ step: "open", location: label });
    setOpen(true);
  }

  return (
    <>
      <button type="button" className={className} onClick={openBooking}>
        {label}
      </button>
      {open ? (
        <div className="booking-modal" role="dialog" aria-modal="true" aria-label="Book an appointment">
          <div className="booking-modal__backdrop" onClick={closeBooking} />
          <BookingCalendar
            active={open}
            onDone={closeBooking}
            onClose={closeBooking}
            showClose
            variant={bookingVariant}
          />
        </div>
      ) : null}
    </>
  );
}

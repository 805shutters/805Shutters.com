"use client";

import { useState } from "react";
import { BookingCalendar } from "./BookingCalendar";

export function AppointmentBooking({
  className = "button primary",
  label = "Book an appointment here"
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  function closeBooking() {
    setOpen(false);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <div className="booking-modal" role="dialog" aria-modal="true" aria-label="Book an appointment">
          <div className="booking-modal__backdrop" onClick={closeBooking} />
          <BookingCalendar active={open} onDone={closeBooking} onClose={closeBooking} showClose />
        </div>
      ) : null}
    </>
  );
}

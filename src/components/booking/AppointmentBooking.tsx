"use client";

import { useEffect, useRef, useState } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const focused = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; focused?.focus(); };
  }, [open]);

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
        <dialog ref={dialogRef} className="booking-modal-dialog" aria-label="Book an appointment"
          onCancel={event => { event.preventDefault(); closeBooking(); }}
          onClick={event => { if (event.target === event.currentTarget) closeBooking(); }}>
          <BookingCalendar
            active={open}
            onDone={closeBooking}
            onClose={closeBooking}
            showClose
            variant={bookingVariant}
          />
        </dialog>
      ) : null}
    </>
  );
}

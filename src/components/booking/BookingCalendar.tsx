"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { productInterestOptions } from "@/lib/product-interest-options";

type AvailabilitySlot = {
  time: string;
  label: string;
  available: boolean;
};

type AvailabilityDay = {
  date: string;
  day: number;
  available: boolean;
  slots: AvailabilitySlot[];
};

type AvailabilityResponse = {
  configured: boolean;
  month: string;
  monthLabel: string;
  startsOn: number;
  days: AvailabilityDay[];
};

type BookingCalendarProps = {
  active?: boolean;
  className?: string;
  onDone?: () => void;
  showClose?: boolean;
  onClose?: () => void;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatSelectedDate(date: string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function isErrorMessage(message: string) {
  return message.includes("could") || message.includes("requires") || message.includes("longer available");
}

export function BookingCalendar({
  active = true,
  className = "booking-panel",
  onDone,
  showClose = false,
  onClose
}: BookingCalendarProps) {
  const [month, setMonth] = useState(currentMonth());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>([]);
  const slotsRef = useRef<HTMLDivElement>(null);
  const customerInfoRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!active) return;

    setLoading(true);
    setMessage(null);

    fetch(`/api/booking/availability?month=${encodeURIComponent(month)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Availability could not be loaded.");
        setAvailability(body);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Availability could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, [active, month]);

  const selectedDay = useMemo(
    () => availability?.days.find((day) => day.date === selectedDate) || null,
    [availability, selectedDate]
  );

  function resetCalendar() {
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedProductTypes([]);
    setComplete(false);
    setMessage(null);
  }

  function handleDone() {
    resetCalendar();
    onDone?.();
  }

  function scrollToStep(ref: React.RefObject<HTMLElement | null>) {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    setSelectedTime(null);
    scrollToStep(slotsRef);
  }

  function chooseTime(time: string) {
    setSelectedTime(time);
    scrollToStep(customerInfoRef);
  }

  function toggleProductType(productType: string) {
    setSelectedProductTypes((current) =>
      current.includes(productType)
        ? current.filter((item) => item !== productType)
        : [...current, productType]
    );
  }

  function confirmationMessage(body: {
    smsConfirmationSent?: boolean;
    emailConfirmationSent?: boolean;
  }) {
    const channels = [
      body.smsConfirmationSent ? "text" : null,
      body.emailConfirmationSent ? "email" : null
    ].filter(Boolean);

    if (channels.length) {
      return `Your appointment is booked. We sent your confirmation by ${channels.join(" and ")}.`;
    }

    return "Your appointment is booked. 805 Shutters will follow up shortly.";
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate || !selectedTime) return;

    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          date: selectedDate,
          time: selectedTime,
          name: String(formData.get("name") || ""),
          phone: String(formData.get("phone") || ""),
          address: String(formData.get("address") || ""),
          windowCount: String(formData.get("windowCount") || ""),
          email: String(formData.get("email") || ""),
          productTypes: selectedProductTypes,
          notes: String(formData.get("notes") || "")
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Appointment could not be booked.");
      setComplete(true);
      setMessage(confirmationMessage(body));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be booked.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={className}>
      <div className="booking-panel__head">
        <div>
          <p className="eyebrow">Free In-Home Consultation</p>
          <h2>Book a consultation</h2>
        </div>
        {showClose ? (
          <button type="button" className="booking-close" onClick={onClose} aria-label="Close booking">
            ×
          </button>
        ) : null}
      </div>

      {complete ? (
        <div className="booking-complete">
          <h3>Appointment booked.</h3>
          <p>{message}</p>
          <button type="button" onClick={handleDone}>
            {onDone ? "Done" : "Book another appointment"}
          </button>
        </div>
      ) : (
        <>
          <div className="booking-calendar-shell">
            <div className="booking-calendar-head">
              <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="Previous month">
                ‹
              </button>
              <h3>{availability?.monthLabel || "Loading"}</h3>
              <button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="Next month">
                ›
              </button>
            </div>
            <div className="booking-weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="booking-days">
              {Array.from({ length: availability?.startsOn || 0 }, (_item, index) => (
                <span className="booking-day booking-day--empty" key={`empty-${index}`} />
              ))}
              {availability?.days.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  className={[
                    "booking-day",
                    day.available ? "booking-day--available" : "booking-day--disabled",
                    selectedDate === day.date ? "booking-day--selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!day.available}
                  onClick={() => chooseDate(day.date)}
                >
                  {day.day}
                </button>
              ))}
            </div>
            {loading ? <p className="booking-helper">Loading available appointments.</p> : null}
            {availability && !availability.configured ? (
              <p className="booking-helper error">
                Dedicated Supabase service-role key is needed before live bookings can be accepted.
              </p>
            ) : null}
          </div>

          <div className="booking-detail-panel">
            <div className="booking-step booking-step--times" ref={slotsRef}>
              <div>
                <p className="eyebrow">Available Times</p>
                <h3>{selectedDate ? formatSelectedDate(selectedDate) : "Choose a date"}</h3>
              </div>
              <div className="booking-slots">
                {selectedDay?.slots.map((slot) => (
                  <button
                    type="button"
                    key={slot.time}
                    disabled={!slot.available}
                    className={selectedTime === slot.time ? "active" : ""}
                    onClick={() => chooseTime(slot.time)}
                  >
                    {slot.label}
                  </button>
                ))}
                {!selectedDay ? <p>Available times show after you pick a date.</p> : null}
              </div>
            </div>

            <form className="booking-form" onSubmit={submitBooking} ref={customerInfoRef}>
              <div>
                <p className="eyebrow">Customer Information</p>
                <h3>{selectedTime ? "Tell us where to meet you" : "Choose a time to finish booking"}</h3>
              </div>
              {selectedDate && selectedTime ? (
                <p className="booking-selection-summary">
                  {formatSelectedDate(selectedDate)} at {selectedDay?.slots.find((slot) => slot.time === selectedTime)?.label}
                </p>
              ) : null}
              <div className="field-row">
                <label>
                  Full name
                  <input name="name" autoComplete="name" required disabled={!selectedTime} />
                </label>
                <label>
                  Phone
                  <input name="phone" autoComplete="tel" required disabled={!selectedTime} />
                </label>
              </div>
              <label>
                Address
                <input name="address" autoComplete="street-address" required disabled={!selectedTime} />
              </label>
              <div className="field-row">
                <label>
                  Approx. quantity of windows
                  <input name="windowCount" type="number" min="1" disabled={!selectedTime} />
                </label>
                <label>
                  Email <span className="booking-optional">optional</span>
                  <input name="email" type="email" autoComplete="email" disabled={!selectedTime} />
                </label>
              </div>
              <fieldset className="booking-product-options" disabled={!selectedTime}>
                <legend>
                  Product interest <span className="booking-optional">optional</span>
                </legend>
                <div className="booking-product-grid">
                  {productInterestOptions.map((productType) => (
                    <button
                      type="button"
                      key={productType}
                      className={selectedProductTypes.includes(productType) ? "active" : ""}
                      aria-pressed={selectedProductTypes.includes(productType)}
                      disabled={!selectedTime}
                      onClick={() => toggleProductType(productType)}
                    >
                      {productType}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label>
                Notes <span className="booking-optional">optional</span>
                <textarea name="notes" rows={3} disabled={!selectedTime} />
              </label>
              {message ? <p className={`booking-message ${isErrorMessage(message) ? "error" : ""}`}>{message}</p> : null}
              <button type="submit" disabled={!selectedTime || submitting}>
                {submitting ? "Booking..." : "Submit Appointment"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

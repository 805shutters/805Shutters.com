"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { trackLeadEvent } from "@/lib/client-tracking";

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

type InquiryState = "idle" | "submitting" | "sent" | "error";

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
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [inquiryState, setInquiryState] = useState<InquiryState>("idle");
  const [inquiryMessage, setInquiryMessage] = useState<string | null>(null);

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
    setComplete(false);
    setMessage(null);
  }

  function handleDone() {
    resetCalendar();
    onDone?.();
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
          notes: String(formData.get("notes") || "")
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Appointment could not be booked.");
      setComplete(true);
      setMessage(
        body.smsConfirmationSent
          ? "Your appointment is booked. We sent a confirmation text to your phone."
          : "Your appointment is booked. 805 Shutters will follow up shortly."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be booked.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const urlParams = new URLSearchParams(window.location.search);
    const city = String(formData.get("city") || "");

    setInquiryState("submitting");
    setInquiryMessage(null);

    try {
      const response = await fetch("/api/leads/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          leadContext: "booking_fallback",
          interest: "schedule_request",
          projectInterest: String(formData.get("projectInterest") || "consultation"),
          name: String(formData.get("name") || ""),
          phone: String(formData.get("phone") || ""),
          email: String(formData.get("email") || ""),
          city,
          address: String(formData.get("address") || ""),
          preferredTimes: String(formData.get("preferredTimes") || ""),
          notes: String(formData.get("notes") || ""),
          requestedDate: selectedDate || undefined,
          requestedTime: selectedTime || undefined,
          pagePath: window.location.pathname,
          company: String(formData.get("company") || ""),
          utm_source: urlParams.get("utm_source") || undefined,
          utm_medium: urlParams.get("utm_medium") || undefined,
          utm_campaign: urlParams.get("utm_campaign") || undefined,
          utm_content: urlParams.get("utm_content") || undefined,
          utm_term: urlParams.get("utm_term") || undefined
        })
      });
      const result = (await response.json()) as { id?: string; message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Request could not be sent.");
      }

      setInquiryState("sent");
      setInquiryMessage("Request received. We will call or text you with the closest available time.");
      trackLeadEvent({
        eventId: result.id,
        interest: "schedule_request",
        city,
        pagePath: window.location.pathname
      });
      form.reset();
    } catch (error) {
      setInquiryState("error");
      setInquiryMessage(error instanceof Error ? error.message : "Request could not be sent.");
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
                    day.available ? "" : "booking-day--disabled",
                    selectedDate === day.date ? "booking-day--selected" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!day.available}
                  onClick={() => {
                    setSelectedDate(day.date);
                    setSelectedTime(null);
                  }}
                >
                  {day.day}
                </button>
              ))}
            </div>
            {loading ? <p className="booking-helper">Loading available appointments.</p> : null}
            {availability && !availability.configured ? (
              <p className="booking-helper error">
                Appointment availability is controlled from the CRM. No live slots are published yet.
              </p>
            ) : null}
          </div>

          <div className="booking-detail-panel">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3>{selectedDate ? formatSelectedDate(selectedDate) : "Choose a date"}</h3>
            </div>
            <div className="booking-slots">
              {selectedDay?.slots.map((slot) => (
                <button
                  type="button"
                  key={slot.time}
                  disabled={!slot.available}
                  className={selectedTime === slot.time ? "active" : ""}
                  onClick={() => setSelectedTime(slot.time)}
                >
                  {slot.label}
                </button>
              ))}
              {!selectedDay ? <p>Available times show after you pick a date.</p> : null}
            </div>

            <form className="booking-form" onSubmit={submitBooking}>
              <p className="eyebrow">Step 2</p>
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
                  Number of windows
                  <input name="windowCount" type="number" min="1" disabled={!selectedTime} />
                </label>
                <label>
                  Email
                  <input name="email" type="email" autoComplete="email" disabled={!selectedTime} />
                </label>
              </div>
              <label>
                Notes
                <textarea name="notes" rows={3} disabled={!selectedTime} />
              </label>
              {message ? <p className={`booking-message ${isErrorMessage(message) ? "error" : ""}`}>{message}</p> : null}
              <button type="submit" disabled={!selectedTime || submitting}>
                {submitting ? "Booking..." : "Confirm Appointment"}
              </button>
            </form>

            <div className="booking-inquiry">
              <div className="booking-inquiry__head">
                <p className="eyebrow">Need a different time?</p>
                <h3>Request another appointment time</h3>
                <p>
                  Tell us what day or time you were hoping for and we will call or text you with the closest
                  available option.
                </p>
              </div>

              {!inquiryOpen && inquiryState !== "sent" ? (
                <button
                  type="button"
                  className="booking-inquiry-toggle"
                  onClick={() => setInquiryOpen(true)}
                  aria-expanded={inquiryOpen}
                >
                  Request a Different Time
                </button>
              ) : null}

              {inquiryOpen && inquiryState !== "sent" ? (
                <form className="booking-inquiry-form" onSubmit={submitInquiry}>
                  <label className="honeypot-field" aria-hidden="true">
                    Company
                    <input name="company" autoComplete="off" tabIndex={-1} />
                  </label>
                  <div className="field-row">
                    <label>
                      Full name
                      <input name="name" autoComplete="name" required />
                    </label>
                    <label>
                      Phone
                      <input name="phone" autoComplete="tel" required />
                    </label>
                  </div>
                  <div className="field-row">
                    <label>
                      Email
                      <input name="email" type="email" autoComplete="email" />
                    </label>
                    <label>
                      City
                      <input name="city" autoComplete="address-level2" />
                    </label>
                  </div>
                  <label>
                    Address
                    <input name="address" autoComplete="street-address" />
                  </label>
                  <label>
                    Project
                    <select name="projectInterest" defaultValue="consultation">
                      <option value="consultation">Free consultation</option>
                      <option value="shutters">Shutters</option>
                      <option value="shades">Shades</option>
                      <option value="blinds">Blinds</option>
                      <option value="commercial">Commercial window coverings</option>
                    </select>
                  </label>
                  <label>
                    Preferred days or times
                    <textarea
                      name="preferredTimes"
                      rows={3}
                      required
                      placeholder="E.g. next Friday after 2 PM, weekday mornings, or Saturday if available"
                    />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" rows={3} />
                  </label>
                  {inquiryMessage ? (
                    <p className={`booking-message ${inquiryState === "error" ? "error" : ""}`}>
                      {inquiryMessage}
                    </p>
                  ) : null}
                  <div className="booking-inquiry-actions">
                    <button type="submit" disabled={inquiryState === "submitting"}>
                      {inquiryState === "submitting" ? "Sending..." : "Send Time Request"}
                    </button>
                    <button type="button" className="button secondary" onClick={() => setInquiryOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {inquiryState === "sent" && inquiryMessage ? (
                <p className="booking-message">{inquiryMessage}</p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
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
  appointmentDurationMinutes?: number;
  month: string;
  monthLabel: string;
  startsOn: number;
  days: AvailabilityDay[];
};

type BookingCalendarProps = {
  active?: boolean;
  className?: string;
  deferDetailsUntilDate?: boolean;
  eyebrow?: string;
  heading?: string;
  onDone?: () => void;
  showClose?: boolean;
  onClose?: () => void;
};

const windowCountOptions = [
  { label: "1-5", value: "5" },
  { label: "6-10", value: "10" },
  { label: "11-15", value: "15" },
  { label: "16-20", value: "20" },
  { label: "21-25", value: "25" },
  { label: "26-30", value: "30" },
  { label: "31-35", value: "35" },
  { label: "36-40", value: "40" },
  { label: "41+", value: "41" }
];

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

function appointmentLengthFromWindowCount(windowCount: string | number | undefined) {
  const count = Number(windowCount || 0);
  if (!Number.isFinite(count) || count <= 0) return "";
  const minutes = Math.ceil(count / 5) * 60;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${minutes} minutes`;
}

function appointmentLengthFromMinutes(minutes: number | undefined) {
  if (!minutes || !Number.isFinite(minutes)) return "";
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? "" : "s"}` : `${minutes} minutes`;
}

function isErrorMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("could") ||
    lower.includes("requires") ||
    lower.includes("longer available") ||
    lower.includes("choose") ||
    lower.includes("enter") ||
    lower.includes("required")
  );
}

export function BookingCalendar({
  active = true,
  className = "booking-panel",
  deferDetailsUntilDate = false,
  eyebrow = "Free In-Home Consultation",
  heading = "Book a consultation",
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
  const [selectedWindowCount, setSelectedWindowCount] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [projectConfirmed, setProjectConfirmed] = useState(false);
  const slotsRef = useRef<HTMLDivElement>(null);
  const customerInfoRef = useRef<HTMLFormElement>(null);

  const projectDetailsReady = Boolean(selectedWindowCount && serviceAddress.trim());
  const selectedAppointmentLength = appointmentLengthFromWindowCount(selectedWindowCount);
  const availabilityAppointmentLength =
    appointmentLengthFromMinutes(availability?.appointmentDurationMinutes) || selectedAppointmentLength;

  useEffect(() => {
    if (!active || !projectConfirmed || !projectDetailsReady) return;

    const params = new URLSearchParams({
      month,
      windowCount: selectedWindowCount,
      address: serviceAddress.trim()
    });

    setLoading(true);
    setMessage(null);

    fetch(`/api/booking/availability?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Availability could not be loaded.");
        setAvailability(body);
      })
      .catch((error) => {
        setAvailability(null);
        setMessage(error instanceof Error ? error.message : "Availability could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, [active, month, projectConfirmed, projectDetailsReady, selectedWindowCount, serviceAddress]);

  const selectedDay = useMemo(
    () => availability?.days.find((day) => day.date === selectedDate) || null,
    [availability, selectedDate]
  );

  function resetAvailabilitySelection() {
    setAvailability(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setProjectConfirmed(false);
    setMessage(null);
  }

  function resetCalendar() {
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedProductTypes([]);
    setSelectedWindowCount("");
    setServiceAddress("");
    setProjectConfirmed(false);
    setAvailability(null);
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
    resetAvailabilitySelection();
  }

  function chooseWindowCount(value: string) {
    setSelectedWindowCount(value);
    resetAvailabilitySelection();
  }

  function handleAddressChange(event: ChangeEvent<HTMLInputElement>) {
    setServiceAddress(event.target.value);
    resetAvailabilitySelection();
  }

  function showAvailability() {
    if (!projectDetailsReady) return;
    setAvailability(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setComplete(false);
    setMessage(null);
    setProjectConfirmed(true);
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
    if (!selectedDate || !selectedTime || !projectDetailsReady) return;

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const followUpRequested = submitter?.value === "follow-up";

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
          address: serviceAddress.trim(),
          windowCount: selectedWindowCount,
          email: String(formData.get("email") || ""),
          productTypes: selectedProductTypes,
          notes: String(formData.get("notes") || ""),
          followUpRequested
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

  const hasPanelHead = Boolean(eyebrow || heading || showClose);

  return (
    <div className={className}>
      {hasPanelHead ? (
        <div className="booking-panel__head">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {heading ? <h2>{heading}</h2> : null}
          </div>
          {showClose ? (
            <button type="button" className="booking-close" onClick={onClose} aria-label="Close booking">
              ×
            </button>
          ) : null}
        </div>
      ) : null}

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
          <div className="booking-project-panel">
            <div>
              <p className="eyebrow">Project Details</p>
              <h3>Do you know which type of product your interested in? (optional)</h3>
            </div>

            <fieldset className="booking-product-options" aria-label="Product interest">
              <div className="booking-product-grid">
                {productInterestOptions.map((productType) => (
                  <button
                    type="button"
                    key={productType}
                    className={selectedProductTypes.includes(productType) ? "active" : ""}
                    aria-pressed={selectedProductTypes.includes(productType)}
                    onClick={() => toggleProductType(productType)}
                  >
                    {productType}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="booking-product-options">
              <legend>Approximately how many windows do you need covered?</legend>
              <div className="booking-count-grid">
                {windowCountOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={selectedWindowCount === option.value ? "active" : ""}
                    aria-pressed={selectedWindowCount === option.value}
                    onClick={() => chooseWindowCount(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label>
              What address should we go to?
              <AddressAutocomplete
                name="projectAddress"
                value={serviceAddress}
                onChange={handleAddressChange}
                required
              />
            </label>

            <div className="booking-project-actions">
              <button
                type="button"
                className="booking-project-button"
                disabled={!projectDetailsReady || loading}
                onClick={showAvailability}
              >
                {loading ? "Checking availability..." : "Show available times"}
              </button>
              {selectedAppointmentLength ? (
                <p className="booking-helper booking-helper--flush">
                  Estimated appointment length: {selectedAppointmentLength}
                </p>
              ) : null}
            </div>
          </div>

          {projectConfirmed ? (
            <div className="booking-calendar-shell">
              <div className="booking-calendar-head">
                <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="Previous month">
                  ‹
                </button>
                <h3>{availability?.monthLabel || (loading ? "Loading" : "Calendar")}</h3>
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
              {availabilityAppointmentLength ? (
                <p className="booking-helper">Appointment length: {availabilityAppointmentLength}</p>
              ) : null}
              {availability && !availability.configured ? (
                <p className="booking-helper error">
                  Dedicated Supabase service-role key is needed before live bookings can be accepted.
                </p>
              ) : null}
              {message && !selectedTime ? (
                <p className={`booking-helper ${isErrorMessage(message) ? "error" : ""}`}>{message}</p>
              ) : null}
            </div>
          ) : null}

          {projectConfirmed && (!deferDetailsUntilDate || selectedDate) ? (
            <div className="booking-detail-panel">
              <div className="booking-step booking-step--times" ref={slotsRef}>
                <div>
                  <p className="eyebrow">Available Times</p>
                  <h3>{selectedDate ? formatSelectedDate(selectedDate) : "Choose a date"}</h3>
                </div>
                {availabilityAppointmentLength ? (
                  <p className="booking-selection-summary">
                    Estimated appointment length: {availabilityAppointmentLength}
                  </p>
                ) : null}
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

              {!deferDetailsUntilDate || selectedTime ? (
                <form className="booking-form" onSubmit={submitBooking} ref={customerInfoRef}>
                  <div>
                    <p className="eyebrow">Customer Information</p>
                    <h3>{selectedTime ? "Tell us who to contact" : "Choose a time to finish booking"}</h3>
                  </div>
                  {selectedDate && selectedTime ? (
                    <p className="booking-selection-summary">
                      {formatSelectedDate(selectedDate)} at {selectedDay?.slots.find((slot) => slot.time === selectedTime)?.label}
                      {availabilityAppointmentLength ? ` · ${availabilityAppointmentLength}` : ""}
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
                    Email <span className="booking-optional">optional</span>
                    <input name="email" type="email" autoComplete="email" disabled={!selectedTime} />
                  </label>
                  <label>
                    Notes <span className="booking-optional">optional</span>
                    <textarea name="notes" rows={3} disabled={!selectedTime} />
                  </label>
                  {message && selectedTime ? (
                    <p className={`booking-message ${isErrorMessage(message) ? "error" : ""}`}>{message}</p>
                  ) : null}
                  <div className="booking-submit-row">
                    <button
                      type="submit"
                      name="followUp"
                      value="follow-up"
                      disabled={!selectedTime || submitting}
                    >
                      {submitting ? "Booking..." : "Submit – request a follow-up to confirm details"}
                    </button>
                    <button
                      type="submit"
                      name="followUp"
                      value="none"
                      className="booking-submit-secondary"
                      disabled={!selectedTime || submitting}
                    >
                      {submitting ? "Booking..." : "Submit – no follow-up needed"}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

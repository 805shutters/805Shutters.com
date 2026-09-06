"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { losAngelesDateString } from "@/lib/booking/availability";
import { bookingDurationLabelForWindowCount } from "@/lib/booking/duration";
import { brandIdentity } from "@/lib/brand-identity";
import {
  getLeadAttribution,
  trackBookingEvent,
  trackBookingStep,
} from "@/lib/client-tracking";
import type { ResolvedAddress } from "@/lib/places/types";
import {
  commercialProjectTypeOptions,
  productInterestOptions,
} from "@/lib/product-interest-options";

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
  revision: string;
  expiresAt: string;
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
  variant?: BookingCalendarVariant;
};

export type BookingCalendarVariant = "standard" | "commercial";

const windowCountOptions = [
  { label: "1-5", value: "5" },
  { label: "6-10", value: "10" },
  { label: "11-15", value: "15" },
  { label: "16-20", value: "20" },
  { label: "21-25", value: "25" },
  { label: "26-30", value: "30" },
  { label: "31 +", value: "31" },
];

const commercialWindowCountOptions = [
  { label: "1-5", value: "5" },
  { label: "6-10", value: "10" },
  { label: "11-30", value: "30" },
  { label: "31-50", value: "50" },
  { label: "51-100", value: "100" },
  { label: "100-500", value: "500" },
  { label: "500+", value: "501" },
];

function currentMonth() {
  return losAngelesDateString().slice(0, 7);
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
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function appointmentLengthFromMinutes(minutes: number | undefined) {
  if (!minutes || !Number.isFinite(minutes)) return "";
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? `${hours} hour${hours === 1 ? "" : "s"}`
    : `${minutes} minutes`;
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
  eyebrow,
  heading,
  onDone,
  showClose = false,
  onClose,
  variant = "standard",
}: BookingCalendarProps) {
  const isCommercialBooking = variant === "commercial";
  const panelClassName = [
    className,
    isCommercialBooking ? "booking-panel--commercial" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const resolvedEyebrow =
    eyebrow ??
    (isCommercialBooking
      ? "Commercial Shade Audit"
      : "Free In-Home Consultation");
  const resolvedHeading =
    heading ??
    (isCommercialBooking
      ? "Book a commercial shade audit"
      : "Book a consultation");
  const projectOptions = isCommercialBooking
    ? commercialProjectTypeOptions
    : productInterestOptions;
  const projectQuestion = isCommercialBooking
    ? "What type of commercial space is this? (optional)"
    : "Do you know which type of product you're interested in? (optional)";
  const projectOptionsLabel = isCommercialBooking
    ? "Commercial project type"
    : "Product interest";
  const windowCountQuestion = isCommercialBooking
    ? "Approximately how many commercial windows need shades?"
    : "Approximately how many windows do you need covered?";
  const addressQuestion = isCommercialBooking
    ? "What site address should we go to?"
    : "What address should we go to?";
  const windowOptions = isCommercialBooking
    ? commercialWindowCountOptions
    : windowCountOptions;
  const [month, setMonth] = useState(currentMonth());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(
    null,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [selectedProductTypes, setSelectedProductTypes] = useState<string[]>(
    [],
  );
  const [selectedWindowCount, setSelectedWindowCount] = useState("");
  const [serviceAddress, setServiceAddress] = useState("");
  const [projectConfirmed, setProjectConfirmed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const loadingRef = useRef(false);
  const revisionRef = useRef<string | null>(null);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const [contact, setContact] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const slotsRef = useRef<HTMLDivElement>(null);
  const customerInfoRef = useRef<HTMLFormElement>(null);

  const projectDetailsReady = Boolean(
    selectedWindowCount && serviceAddress.trim(),
  );
  const selectedAppointmentLength =
    bookingDurationLabelForWindowCount(selectedWindowCount);
  const availabilityAppointmentLength =
    appointmentLengthFromMinutes(availability?.appointmentDurationMinutes) ||
    selectedAppointmentLength;

  useEffect(() => {
    if (!active || complete) return;
    const update = () => {
      if (!loadingRef.current) setRefresh((n) => n + 1);
    };
    const interval = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, [active, complete]);
  useEffect(() => {
    if (!active || complete || !projectConfirmed || !projectDetailsReady) {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    const params = new URLSearchParams({
      month,
      windowCount: selectedWindowCount,
      address: serviceAddress.trim(),
    });
    loadingRef.current = true;
    setLoading(true);
    fetch(`/api/booking/availability?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.message || "Availability could not be checked.");
        if (!current) return;
        if (revisionRef.current && revisionRef.current !== body.revision) {
          setSelectedTime(null);
          setMessage(
            "Jessica's calendar updated. Please select an available time.",
          );
        }
        revisionRef.current = body.revision;
        setAvailability(body);
      })
      .catch((error) => {
        if (!current) return;
        setAvailability(null);
        setSelectedTime(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "Availability could not be checked.",
        );
      })
      .finally(() => {
        if (current) {
          loadingRef.current = false;
          setLoading(false);
        }
      });
    return () => {
      current = false;
      loadingRef.current = false;
      controller.abort();
    };
  }, [
    active,
    complete,
    month,
    projectConfirmed,
    projectDetailsReady,
    selectedWindowCount,
    serviceAddress,
    refresh,
  ]);
  useEffect(() => {
    if (
      selectedDate &&
      selectedTime &&
      !availability?.days
        .find((d) => d.date === selectedDate)
        ?.slots.some((s) => s.time === selectedTime && s.available)
    )
      setSelectedTime(null);
  }, [availability, selectedDate, selectedTime]);

  const selectedDay = useMemo(
    () => availability?.days.find((day) => day.date === selectedDate) || null,
    [availability, selectedDate],
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
    setContact({ name: "", phone: "", email: "", notes: "" });
    requestKey.current = null;
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

  function bookingTrackingContext() {
    return {
      pagePath: window.location.pathname,
      ...getLeadAttribution(),
    };
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    setSelectedTime(null);
    trackBookingStep({
      step: "date_select",
      productTypes: selectedProductTypes,
      windowCount: selectedWindowCount,
      ...bookingTrackingContext(),
    });
    scrollToStep(slotsRef);
  }

  function chooseTime(time: string) {
    setSelectedTime(time);
    trackBookingStep({
      step: "time_select",
      productTypes: selectedProductTypes,
      windowCount: selectedWindowCount,
      ...bookingTrackingContext(),
    });
    scrollToStep(customerInfoRef);
  }

  function toggleProductType(productType: string) {
    setSelectedProductTypes((current) =>
      current.includes(productType)
        ? current.filter((item) => item !== productType)
        : [...current, productType],
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

  function confirmProjectDetails(addressOverride?: string) {
    const nextAddress = (addressOverride ?? serviceAddress).trim();
    if (!selectedWindowCount || !nextAddress) return;
    trackBookingStep({
      step: "availability_request",
      productTypes: selectedProductTypes,
      windowCount: selectedWindowCount,
      ...bookingTrackingContext(),
    });
    if (nextAddress !== serviceAddress) {
      setServiceAddress(nextAddress);
    }
    setAvailability(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setComplete(false);
    setContact({ name: "", phone: "", email: "", notes: "" });
    requestKey.current = null;
    setMessage(null);
    setProjectConfirmed(true);
  }

  function handleAddressResolved(address: ResolvedAddress) {
    confirmProjectDetails(address.fullAddress);
  }

  function showAvailability() {
    if (!projectDetailsReady) return;
    confirmProjectDetails();
  }

  function confirmationMessage(body: {
    smsConfirmationSent?: boolean;
    emailConfirmationSent?: boolean;
  }) {
    const channels = [
      body.smsConfirmationSent ? "text" : null,
      body.emailConfirmationSent ? "email" : null,
    ].filter(Boolean);

    if (channels.length) {
      return `Your appointment is booked. We sent your confirmation by ${channels.join(" and ")}.`;
    }

    return "Your appointment is booked. 805 Shutters will follow up shortly.";
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !selectedDate ||
      !selectedTime ||
      !projectDetailsReady ||
      !availability ||
      Date.parse(availability.expiresAt) <= Date.now()
    ) {
      setSelectedTime(null);
      setRefresh((n) => n + 1);
      return;
    }

    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const followUpRequested = submitter?.value === "follow-up";

    const formData = new FormData(event.currentTarget);
    const trackingContext = bookingTrackingContext();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        date: selectedDate,
        time: selectedTime,
        name: String(formData.get("name") || ""),
        phone: String(formData.get("phone") || ""),
        address: serviceAddress.trim(),
        windowCount: selectedWindowCount,
        email: String(formData.get("email") || ""),
        productTypes: selectedProductTypes,
        notes: String(formData.get("notes") || ""),
        followUpRequested,
        ...trackingContext,
      };
      const bodyKey = JSON.stringify(payload);
      if (!requestKey.current || requestKey.current.body !== bodyKey)
        requestKey.current = { body: bodyKey, key: crypto.randomUUID() };
      const response = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: requestKey.current.key,
          revision: availability.revision,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setSelectedTime(null);
          setRefresh((n) => n + 1);
          requestKey.current = null;
        }
        throw new Error(body.message || "Appointment could not be booked.");
      }
      trackBookingEvent({
        eventId: typeof body.leadId === "string" ? body.leadId : undefined,
        jobId: typeof body.jobId === "string" ? body.jobId : undefined,
        productTypes: selectedProductTypes,
        windowCount: selectedWindowCount,
        followUpRequested,
        ...trackingContext,
      });
      setComplete(true);
      setMessage(confirmationMessage(body));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Appointment could not be booked.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasPanelHead = Boolean(resolvedEyebrow || resolvedHeading || showClose);

  return (
    <div className={panelClassName}>
      {hasPanelHead ? (
        <div className="booking-panel__head">
          <div>
            {resolvedEyebrow ? (
              <p className="eyebrow">{resolvedEyebrow}</p>
            ) : null}
            {resolvedHeading ? <h2>{resolvedHeading}</h2> : null}
          </div>
          {showClose ? (
            <button
              type="button"
              className="booking-close"
              onClick={onClose}
              aria-label="Close booking"
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}

      {complete ? (
        <div className="booking-complete">
          <h3>Appointment booked.</h3>
          <p>{message}</p>
          <p className="booking-complete__official-contact">
            Official 805 Shutters contact:{" "}
            <a href={brandIdentity.website}>{brandIdentity.domain}</a> ·{" "}
            <a href={brandIdentity.phoneHref}>{brandIdentity.phone}</a>
          </p>
          <button type="button" onClick={handleDone}>
            {onDone ? "Done" : "Book another appointment"}
          </button>
        </div>
      ) : (
        <>
          <div className="booking-project-panel">
            <div>
              <h3>{projectQuestion}</h3>
            </div>

            <fieldset
              className="booking-product-options"
              aria-label={projectOptionsLabel}
            >
              <div className="booking-product-grid">
                {projectOptions.map((productType) => (
                  <button
                    type="button"
                    key={productType}
                    className={
                      selectedProductTypes.includes(productType) ? "active" : ""
                    }
                    aria-pressed={selectedProductTypes.includes(productType)}
                    onClick={() => toggleProductType(productType)}
                  >
                    {productType}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset
              className="booking-product-options"
              aria-label={windowCountQuestion}
            >
              <h3>{windowCountQuestion}</h3>
              <div className="booking-count-grid">
                {windowOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={
                      selectedWindowCount === option.value ? "active" : ""
                    }
                    aria-pressed={selectedWindowCount === option.value}
                    onClick={() => chooseWindowCount(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label>
              <span className="booking-address-heading">{addressQuestion}</span>
              <AddressAutocomplete
                name="projectAddress"
                value={serviceAddress}
                onChange={handleAddressChange}
                onResolved={handleAddressResolved}
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
                {loading
                  ? "Checking availability..."
                  : isCommercialBooking
                    ? "Show audit dates and times"
                    : "Show dates and times"}
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
                <button
                  type="button"
                  onClick={() => setMonth((value) => shiftMonth(value, -1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <h3>
                  {availability?.monthLabel ||
                    (loading ? "Loading" : "Calendar")}
                </h3>
                <button
                  type="button"
                  onClick={() => setMonth((value) => shiftMonth(value, 1))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
              <div className="booking-weekdays" aria-hidden="true">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <span key={day}>{day}</span>
                  ),
                )}
              </div>
              <div className="booking-days">
                {Array.from(
                  { length: availability?.startsOn || 0 },
                  (_item, index) => (
                    <span
                      className="booking-day booking-day--empty"
                      key={`empty-${index}`}
                    />
                  ),
                )}
                {availability?.days.map((day) => (
                  <button
                    type="button"
                    key={day.date}
                    className={[
                      "booking-day",
                      day.available
                        ? "booking-day--available"
                        : "booking-day--disabled",
                      selectedDate === day.date ? "booking-day--selected" : "",
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
              {loading ? (
                <p className="booking-helper">
                  Loading available appointments.
                </p>
              ) : null}
              {availabilityAppointmentLength ? (
                <p className="booking-helper">
                  Appointment length: {availabilityAppointmentLength}
                </p>
              ) : null}
              {availability && !availability.configured ? (
                <p className="booking-helper error">
                  Dedicated Supabase service-role key is needed before live
                  bookings can be accepted.
                </p>
              ) : null}
              {message && !selectedTime ? (
                <p
                  className={`booking-helper ${isErrorMessage(message) ? "error" : ""}`}
                >
                  {message}
                </p>
              ) : null}
            </div>
          ) : null}

          {projectConfirmed && (!deferDetailsUntilDate || selectedDate) ? (
            <div className="booking-detail-panel">
              <div className="booking-step booking-step--times" ref={slotsRef}>
                <div>
                  <p className="eyebrow">Available Times</p>
                  <h3>
                    {selectedDate
                      ? formatSelectedDate(selectedDate)
                      : "Choose a date"}
                  </h3>
                </div>
                {availabilityAppointmentLength ? (
                  <p className="booking-selection-summary">
                    Estimated appointment length:{" "}
                    {availabilityAppointmentLength}
                  </p>
                ) : null}
                <div className="booking-slots">
                  {selectedDay?.slots.map((slot) => (
                    <button
                      type="button"
                      key={slot.time}
                      disabled={!slot.available || loading}
                      className={selectedTime === slot.time ? "active" : ""}
                      onClick={() => chooseTime(slot.time)}
                    >
                      {slot.label}
                    </button>
                  ))}
                  {!selectedDay ? (
                    <p>Available times show after you pick a date.</p>
                  ) : null}
                </div>
              </div>

              {!deferDetailsUntilDate || selectedTime ? (
                <form
                  className="booking-form"
                  onSubmit={submitBooking}
                  ref={customerInfoRef}
                >
                  <div>
                    <p className="eyebrow">Customer Information</p>
                    <h3>
                      {selectedTime
                        ? "Tell us who to contact"
                        : "Choose a time to finish booking"}
                    </h3>
                  </div>
                  {selectedDate && selectedTime ? (
                    <p className="booking-selection-summary">
                      {formatSelectedDate(selectedDate)} at{" "}
                      {
                        selectedDay?.slots.find(
                          (slot) => slot.time === selectedTime,
                        )?.label
                      }
                      {availabilityAppointmentLength
                        ? ` · ${availabilityAppointmentLength}`
                        : ""}
                    </p>
                  ) : null}
                  <div className="field-row">
                    <label>
                      Full name
                      <input
                        name="name"
                        value={contact.name}
                        onChange={(e) =>
                          setContact((c) => ({ ...c, name: e.target.value }))
                        }
                        autoComplete="name"
                        required
                        disabled={!selectedTime}
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        name="phone"
                        value={contact.phone}
                        onChange={(e) =>
                          setContact((c) => ({ ...c, phone: e.target.value }))
                        }
                        autoComplete="tel"
                        required
                        disabled={!selectedTime}
                      />
                    </label>
                  </div>
                  <label>
                    Email <span className="booking-optional">optional</span>
                    <input
                      name="email"
                      value={contact.email}
                      onChange={(e) =>
                        setContact((c) => ({ ...c, email: e.target.value }))
                      }
                      type="email"
                      autoComplete="email"
                      disabled={!selectedTime}
                    />
                  </label>
                  <label>
                    Notes <span className="booking-optional">optional</span>
                    <textarea
                      name="notes"
                      value={contact.notes}
                      onChange={(e) =>
                        setContact((c) => ({ ...c, notes: e.target.value }))
                      }
                      rows={3}
                      disabled={!selectedTime}
                    />
                  </label>
                  {message && selectedTime ? (
                    <p
                      className={`booking-message ${isErrorMessage(message) ? "error" : ""}`}
                    >
                      {message}
                    </p>
                  ) : null}
                  <div className="booking-submit-row">
                    <button
                      type="submit"
                      name="followUp"
                      value="follow-up"
                      disabled={!selectedTime || submitting || loading}
                    >
                      {submitting
                        ? "Booking..."
                        : "Submit – request a follow-up to confirm details"}
                    </button>
                    <button
                      type="submit"
                      name="followUp"
                      value="none"
                      className="booking-submit-secondary"
                      disabled={!selectedTime || submitting || loading}
                    >
                      {submitting
                        ? "Booking..."
                        : "Submit – no follow-up needed"}
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

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import { losAngelesDateString } from "@/lib/booking/availability";
import { brandIdentity } from "@/lib/brand-identity";
import { getLeadAttribution, trackBookingEvent, trackBookingStep } from "@/lib/client-tracking";
import { productInterestOptions } from "@/lib/product-interest-options";
import type { BookingCalendarProps } from "./BookingCalendar";
import "./consultation-booking.css";

type Slot = { time: string; label: string; available: boolean };
type Availability = {
  month: string;
  monthLabel: string;
  startsOn: number;
  revision: string;
  expiresAt: string;
  addressChecked: boolean;
  days: { date: string; day: number; available: boolean; slots: Slot[] }[];
};
type Selection = { date: string; time: string };
const emptyContact = { name: "", phone: "", email: "", notes: "" };
const countOptions = ["1–5", "6–10", "11–15", "16–20", "21–25", "26–30", "31+"];
const countValues = ["5", "10", "15", "20", "25", "30", "31"];

function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}
function timeLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
function trackingContext() {
  return { ...getLeadAttribution(), pagePath: window.location.pathname };
}

export function ConsultationBooking({ active = true, className = "", heading,
  showClose = false, onClose, onDone }: BookingCalendarProps) {
  const [month, setMonth] = useState(() => losAngelesDateString().slice(0, 7));
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selection, setSelection] = useState<Selection>({ date: "", time: "" });
  const [contactStarted, setContactStarted] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [contact, setContact] = useState(emptyContact);
  const [address, setAddress] = useState("");
  const [checkAddress, setCheckAddress] = useState("");
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [windowCount, setWindowCount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [availabilityError, setAvailabilityError] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const selectionRef = useRef(selection);
  const busyRef = useRef(false);
  const submittingRef = useRef(false);
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const completeRef = useRef<HTMLElement>(null);
  const pendingScroll = useRef<"times" | "details" | null>(null);
  selectionRef.current = selection;

  useEffect(() => {
    const target = pendingScroll.current;
    if (!target) return;
    pendingScroll.current = null;
    const frame = window.requestAnimationFrame(() => {
      const element = target === "times" ? slotsRef.current : formRef.current;
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({
        behavior: target === "details" ? "instant" : window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection, editingSchedule]);

  useEffect(() => {
    if (!complete) return;
    const frame = window.requestAnimationFrame(() => {
      completeRef.current?.focus({ preventScroll: true });
      completeRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [complete]);

  useEffect(() => {
    if (!active || complete) return;
    const update = () => { if (!busyRef.current && !submittingRef.current) setRefresh(n => n + 1); };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [active, complete]);

  useEffect(() => {
    if (!active || complete) return;
    const controller = new AbortController();
    let current = true;
    busyRef.current = true;
    setLoading(true);
    const params = new URLSearchParams({ month, variant: "standard" });
    if (checkAddress) params.set("address", checkAddress);
    fetch(`/api/booking/availability/?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Available times could not be loaded. Please try again.");
        if (!current) return;
        setAvailability(body);
        setAvailabilityError("");
        setVerifiedAddress(body.addressChecked ? checkAddress : null);
        const chosen = selectionRef.current;
        if (chosen.time && !body.days.some((day: Availability["days"][number]) =>
          day.date === chosen.date && day.slots.some(slot => slot.time === chosen.time && slot.available))) {
          setSelection({ ...chosen, time: "" });
          setMessage(checkAddress
            ? "That time doesn’t fit the travel time to your address. Please choose another time; your details are saved below."
            : "That time is no longer available. Please choose another; your details are saved below.");
        }
      })
      .catch(error => {
        if (!current) return;
        setAvailabilityError(error instanceof Error ? error.message : "Available times could not be loaded.");
        setVerifiedAddress(null);
      })
      .finally(() => { if (current) { busyRef.current = false; setLoading(false); } });
    return () => { current = false; controller.abort(); busyRef.current = false; };
  }, [active, complete, month, checkAddress, refresh]);

  const selectedDay = availability?.days.find(day => day.date === selection.date);
  const availableTimeGroups = [
    { label: "Morning", note: "Before noon", slots: selectedDay?.slots.filter(slot => slot.available && Number(slot.time.split(":")[0]) < 12) ?? [] },
    { label: "Afternoon", note: "Noon onward", slots: selectedDay?.slots.filter(slot => slot.available && Number(slot.time.split(":")[0]) >= 12) ?? [] },
  ].filter(group => group.slots.length > 0);
  const addressChecked = Boolean(availability?.addressChecked && verifiedAddress === address.trim());
  const selectionAvailable = Boolean(selectedDay?.slots.some(slot => slot.time === selection.time && slot.available));
  const hasOpenings = availability?.days.some(day => day.available);
  const monthLabel = availability?.month === month ? availability.monthLabel
    : new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`));
  const showSchedule = !contactStarted || !selection.time || editingSchedule;
  const isPage = className.includes("booking-panel--page");
  const title = heading ?? "Book your free consultation";

  function chooseDate(date: string) {
    pendingScroll.current = "times";
    setSelection({ date, time: "" });
    setMessage("");
    trackBookingStep({ step: "date_select", ...trackingContext() });
  }
  function returnToCalendar() {
    calendarRef.current?.focus({ preventScroll: true });
    calendarRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }
  function editAppointment() {
    pendingScroll.current = "times";
    setEditingSchedule(true);
  }
  function chooseTime(time: string) {
    pendingScroll.current = "details";
    setSelection({ date: selection.date, time });
    setContactStarted(true);
    setEditingSchedule(false);
    setMessage("");
    trackBookingStep({ step: "time_select", ...trackingContext() });
  }
  function changeMonth(delta: number) {
    setMonth(value => shiftMonth(value, delta));
    setAvailability(null);
    setSelection({ date: "", time: "" });
    setMessage("");
  }
  function reset() {
    setComplete(false);
    setSelection({ date: "", time: "" });
    setContactStarted(false);
    setEditingSchedule(false);
    setContact(emptyContact);
    setAddress("");
    setCheckAddress("");
    setVerifiedAddress(null);
    setProductTypes([]);
    setWindowCount("");
    setMessage("");
    requestKey.current = null;
    setRefresh(n => n + 1);
    onDone?.();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!selectionAvailable || !addressChecked || loading || !availability || availabilityError) {
      setCheckAddress(address.trim());
      setRefresh(n => n + 1);
      return;
    }
    if (Date.parse(availability.expiresAt) <= Date.now()) {
      setMessage("Refreshing your time. Your details are saved; please book when the check finishes.");
      setRefresh(n => n + 1);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setMessage("");
    const payload = { ...selection, ...contact, address: address.trim(), windowCount: windowCount || null,
      productTypes, variant: "standard", followUpRequested: false, ...trackingContext() };
    const bodyKey = JSON.stringify(payload);
    if (requestKey.current?.body !== bodyKey) requestKey.current = { body: bodyKey, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/booking/", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, revision: availability.revision, idempotencyKey: requestKey.current.key }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setRefresh(n => n + 1);
        throw new Error(result.message || "We couldn’t finish booking. Please try again.");
      }
      setComplete(true);
      // The outbox is asynchronous. Queued or provider-accepted messages are not delivery proof.
      trackBookingEvent({ eventId: result.leadId, jobId: result.jobId, productTypes, windowCount,
        followUpRequested: false, ...trackingContext() });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn’t finish booking. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <div className={`consultation-booking${isPage ? " consultation-booking--page" : ""}${!complete ? " consultation-booking--bold" : ""}`}>
    {(title || showClose) && <header className="consultation-booking__head">
      {!isPage && <img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={80} height={64} />}
      <div>{title && <h2>{title}</h2>}<p>Free in-home visit · 1 hour</p></div>
      {showClose && <button type="button" className="consultation-booking__close" onClick={onClose} aria-label="Close booking">×</button>}
    </header>}
    {complete ? <section className="consultation-booking__complete" role="status" ref={completeRef} tabIndex={-1} aria-label="Appointment confirmation">
      <span className="consultation-booking__check" aria-hidden="true">✓</span>
      <h2>Your appointment is booked.</h2>
      <p><strong>{dateLabel(selection.date)} at {timeLabel(selection.time)}</strong><br />1 hour · Pacific time</p>
      <p>{address}</p>
      <p>We look forward to meeting you, {contact.name.split(" ")[0]}.</p>
      <a href={brandIdentity.phoneHref}>{brandIdentity.phone}</a>
      <button type="button" onClick={reset}>{onDone ? "Done" : "Book another appointment"}</button>
    </section> : <>
      {showSchedule && <div className="consultation-booking__schedule">
        <section className="consultation-booking__calendar" ref={calendarRef} tabIndex={-1} aria-label="Choose a consultation date" aria-busy={loading}>
          <div className="consultation-booking__month">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} disabled={submitting || month <= losAngelesDateString().slice(0, 7)}>←</button>
            <h2>{monthLabel}</h2>
            <button type="button" aria-label="Next month" disabled={submitting} onClick={() => changeMonth(1)}>→</button>
          </div>
          <div className="consultation-booking__weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
          <div className="consultation-booking__days">
            {Array.from({ length: availability?.startsOn ?? new Date(`${month}-01T12:00:00`).getDay() }, (_, i) => <span key={`empty-${i}`} />)}
            {(availability?.days ?? Array.from({ length: new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate() }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, day: i + 1, available: false, slots: [] }))).map(day => {
              // Slot times are already local Pacific HH:mm values from the availability API.
              const openSlots = day.available && !loading && !availabilityError ? day.slots.filter(slot => slot.available) : [];
              const periods = [
                ...(openSlots.some(slot => Number(slot.time.split(":")[0]) < 12) ? ["Morning"] : []),
                ...(openSlots.some(slot => Number(slot.time.split(":")[0]) >= 12) ? ["Afternoon"] : []),
              ];
              return <button type="button" key={day.date}
                aria-label={`${dateLabel(day.date)}${periods.length ? `. ${periods.join(" and ")} available` : ""}`}
                aria-pressed={selection.date === day.date}
                disabled={!day.available || loading || submitting || Boolean(availabilityError)} onClick={() => chooseDate(day.date)}>
                <span className="consultation-booking__date-number">{day.day}</span>
                {periods.length > 0 && <span className="consultation-booking__periods" aria-hidden="true">
                  {periods.map(period => <span className="consultation-booking__period" key={period}>
                    <span className="consultation-booking__period-full">{period}</span>
                    <span className="consultation-booking__period-short">{period === "Morning" ? "AM" : "PM"}</span>
                  </span>)}
                </span>}
              </button>;
            })}
          </div>
          <p className="consultation-booking__hint consultation-booking__legend">
            <span className="consultation-booking__period-full">Morning: before noon · Afternoon: noon onward</span>
            <span className="consultation-booking__period-short">AM: before noon · PM: noon onward</span>
          </p>
          <p className="consultation-booking__hint">Choose a highlighted day to see exact times · Pacific time</p>
          {!loading && !availabilityError && availability && !hasOpenings && <p>No appointments are available this month. Try the next month or <a href={`sms:${brandIdentity.phoneHref.replace("tel:", "")}`}>text us</a> for help.</p>}
          {loading && !selection.date && <p role="status">Loading available dates…</p>}
        </section>
        {selection.date && <div className="consultation-booking__times" ref={slotsRef} tabIndex={-1} role="region" aria-label={`Choose a time for ${dateLabel(selection.date)}`}>
          <div className="consultation-booking__times-head">
            <h3>{dateLabel(selection.date)}</h3>
            <button type="button" className="consultation-booking__change-date" onClick={returnToCalendar} disabled={submitting}>Change date</button>
          </div>
          <p className="consultation-booking__hint">{addressChecked ? "Available for your address · 1 hour · Pacific time" : "Choose a time · Free one-hour visit · Pacific time"}</p>
          <div className="consultation-booking__time-groups">
            {availableTimeGroups.map(group => <section className="consultation-booking__time-group" aria-label={`${group.label} appointments`} key={group.label}>
              <h4>{group.label} <span>{group.note}</span></h4>
              <div className="consultation-booking__slots">
                {group.slots.map(slot => <button type="button" key={slot.time}
                  aria-label={`${slot.label}, 1-hour visit`} aria-pressed={selection.time === slot.time} disabled={loading || submitting || Boolean(availabilityError)} onClick={() => chooseTime(slot.time)}>
                  <strong>{slot.label}</strong>
                </button>)}
              </div>
            </section>)}
          </div>
          {availableTimeGroups.length > 0 && <p className="consultation-booking__hint">Select a time to enter your details.</p>}
          {!loading && selectedDay && !selectedDay.available && hasOpenings && <p>Please choose another date for available times.</p>}
          {loading && <p role="status">{checkAddress ? "Checking times for your address…" : "Loading available times…"}</p>}
        </div>}
      </div>}
      {availabilityError && <div className="consultation-booking__notice" role="alert"><p>{availabilityError}</p><button type="button" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
      {message && <p className="consultation-booking__notice" role="alert">{message}</p>}
      {contactStarted && <form className={`consultation-booking__form${!showSchedule ? " consultation-booking__form--active" : ""}`} ref={formRef} tabIndex={-1} aria-label="Your details" onSubmit={submit}>
        <h3>Complete your booking</h3>
        <p>Enter your details to book your free one-hour visit.</p>
        {selection.time ? <div className="consultation-booking__appointment">
          <p className="consultation-booking__summary">{dateLabel(selection.date)} at {timeLabel(selection.time)} · 1 hour</p>
          {!showSchedule && <button type="button" className="consultation-booking__change-date" onClick={editAppointment} disabled={submitting}>Change date or time</button>}
        </div> : <p>Choose an available time above. Your details are kept here.</p>}
        <fieldset className="consultation-booking__details-layout" disabled={submitting}>
          <div className="consultation-booking__contact">
            <h4>Your information</h4>
            <div className="consultation-booking__fields">
              <label>Full name<input name="name" autoComplete="name" required value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} /></label>
              <label>Service address<AddressAutocomplete name="address" required value={address}
                onChange={event => { setAddress(event.target.value); setCheckAddress(""); setVerifiedAddress(null); }}
                onBlur={() => setCheckAddress(address.trim())}
                onResolved={resolved => { setAddress(resolved.fullAddress); setCheckAddress(resolved.fullAddress.trim()); setVerifiedAddress(null); }} /></label>
              <label>Phone number<input name="phone" type="tel" autoComplete="tel" required value={contact.phone} onChange={event => setContact({ ...contact, phone: event.target.value })} /></label>
              <label>Email (optional)<input name="email" type="email" autoComplete="email" value={contact.email} onChange={event => setContact({ ...contact, email: event.target.value })} /></label>
            </div>
          </div>
          <section className="consultation-booking__optional" aria-label="Optional project questions">
            <h4>Your project <span>Optional</span></h4>
            <p className="consultation-booking__hint">Share what you know. You can skip these questions.</p>
            <fieldset className="consultation-booking__products"><legend>What type of coverings are you interested in?</legend>
              {productInterestOptions.map(product => <label key={product}><input type="checkbox" checked={productTypes.includes(product)}
                onChange={() => setProductTypes(current => current.includes(product) ? current.filter(value => value !== product) : [...current, product])} />{product}</label>)}
            </fieldset>
            <label>How many windows will we be measuring?<select name="windowCount" value={windowCount} onChange={event => setWindowCount(event.target.value)}>
              <option value="">Not sure / skip</option>{countOptions.map((label, i) => <option value={countValues[i]} key={label}>{label}</option>)}
            </select></label>
            <label>Anything else we should know?<textarea name="notes" rows={2} value={contact.notes} onChange={event => setContact({ ...contact, notes: event.target.value })} /></label>
          </section>
          <div className="consultation-booking__actions">
            <button className="consultation-booking__submit" type="submit" disabled={loading || submitting || !selectionAvailable || !addressChecked || Boolean(availabilityError)}>{submitting ? "Booking your appointment…" : "Book appointment"}</button>
            {address.trim() && !addressChecked && !loading && !availabilityError && <p className="consultation-booking__hint">Finish entering your service address to check your time.</p>}
          </div>
        </fieldset>
      </form>}
      <p className="consultation-booking__help">Need help? <a href={`sms:${brandIdentity.phoneHref.replace("tel:", "")}`}>Text {brandIdentity.phone}</a></p>
    </>}
  </div>;
}

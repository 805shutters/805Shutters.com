"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Files,
  FileText,
  Landmark,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Trash2,
  User,
  X
} from "lucide-react";
import { bookingSlotDurationMinutes, zonedTimeToUtc } from "@/lib/booking/availability";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { productInterestOptions } from "@/lib/product-interest-options";
import { leadSourceOptions } from "@/lib/lead-source";
import type { CrmCalendarEvent } from "@/lib/crm/types";

type CalendarView = "list" | "month" | "week" | "day";

type MobileAppointment = CrmCalendarEvent & {
  window_count?: number | null;
  appointment_duration_minutes?: number | null;
};

type MobileAppointmentsResponse = {
  appointments: MobileAppointment[];
  owner: string | null;
  range: {
    startDate: string;
    endDate: string;
  };
  user: {
    email: string;
    displayName?: string | null;
  };
};

type MobileEtaResponse = {
  message: string;
  messageSent: boolean;
  sms: {
    sent: boolean;
    skipped?: string;
    error?: string;
    sid?: string;
  };
  eta: {
    minutes: number;
    text: string;
    distance: string | null;
  } | null;
  etaCalculationFailed: boolean;
  appointment: MobileAppointment;
};

const calendarViews: CalendarView[] = ["list", "week", "day"];

export function MobileWorkspaceMenu({
  appointmentCount,
  onOpenAppointments,
}: {
  appointmentCount: number;
  onOpenAppointments: () => void;
}) {
  return (
    <div className="mobile-crm-app mobile-crm-home">
      <header className="mobile-crm-home-header">
        <span className="mobile-crm-home-logo">
          <img
            src="/brand/805-shutters-logo-exact-transparent.png"
            alt="805 Shutters"
            width="1144"
            height="1080"
          />
        </span>
      </header>
      <main className="mobile-crm-home-main" aria-label="Technician workspace">
        <section className="mobile-crm-home-actions" aria-labelledby="mobile-workflow-label">
          <span className="mobile-crm-functional-label" id="mobile-workflow-label">Today&apos;s Workflow</span>
          <button
            className="mobile-crm-home-control mobile-crm-home-control--primary"
            type="button"
            onClick={onOpenAppointments}
          >
            <span className="mobile-crm-action-icon"><CalendarDays /></span>
            <div>
              <strong>Open Appointments</strong>
              <span>{appointmentCount} upcoming · Schedule, navigation, and arrival texts</span>
            </div>
            <ArrowRight />
          </button>
        </section>
        <section className="mobile-crm-home-actions" aria-labelledby="mobile-tools-label">
          <span className="mobile-crm-functional-label" id="mobile-tools-label">Field Tools</span>
          <a className="mobile-crm-home-control" href="/crm/technical-measures">
            <span className="mobile-crm-action-icon"><Ruler /></span>
            <div><strong>Technical Measures</strong><span>Complete field measurements</span></div>
            <ArrowRight />
          </a>
          <a className="mobile-crm-home-control" href="/crm/mobile/quotes">
            <span className="mobile-crm-action-icon"><FileText /></span>
            <div><strong>Quotes</strong><span>Find, send, and sign contracts</span></div>
            <ArrowRight />
          </a>
          <a className="mobile-crm-home-control" href="/crm/mobile/contracts">
            <span className="mobile-crm-action-icon"><Files /></span>
            <div><strong>Contracts</strong><span>Open signed documents</span></div>
            <ArrowRight />
          </a>
          <a className="mobile-crm-home-control" href="/crm/mobile/search">
            <span className="mobile-crm-action-icon"><Search /></span>
            <div><strong>Customer Info / Payments</strong><span>Fast lookup and payment links</span></div>
            <ArrowRight />
          </a>
          <a className="mobile-crm-home-control" href="/crm/mobile/bookkeeping">
            <span className="mobile-crm-action-icon"><Landmark /></span>
            <div><strong>Bookkeeping</strong><span>Balances and payments</span></div>
            <ArrowRight />
          </a>
        </section>
      </main>
      <footer className="mobile-crm-home-footer">805 Shutters · Field Operations</footer>
    </div>
  );
}
const ownerOptions = ["Mike", "Jessica", "Unassigned"];
const productOptions = [...productInterestOptions, "Mixed"];
const appointmentDurations = [60, 90, 120, 180];

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit"
});

const longDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric"
});

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "long",
  year: "numeric"
});

const shortWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short"
});

function dateToUtcNoon(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDays(value: string, days: number) {
  const date = dateToUtcNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(value: string) {
  const date = dateToUtcNoon(value);
  return addDays(value, -date.getUTCDay());
}

function addMonths(value: string, months: number) {
  const date = dateToUtcNoon(value);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  return date.toISOString().slice(0, 10);
}

function startOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function monthDays(value: string) {
  const monthStart = startOfMonth(value);
  const nextMonth = addMonths(monthStart, 1);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(startOfWeek(addDays(nextMonth, -1)), 6);
  const count = Math.round((dateToUtcNoon(gridEnd).getTime() - dateToUtcNoon(gridStart).getTime()) / 86400000) + 1;
  return Array.from({ length: count }, (_item, index) => addDays(gridStart, index));
}

function weekDays(value: string) {
  const start = startOfWeek(value);
  return Array.from({ length: 7 }, (_item, index) => addDays(start, index));
}

function todayLosAngelesDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function rangeForView(anchorDate: string, view: CalendarView) {
  if (view === "list") {
    return { start: anchorDate, end: addDays(anchorDate, 30) };
  }
  if (view === "month") {
    const days = monthDays(anchorDate);
    return { start: days[0], end: addDays(days[days.length - 1], 1) };
  }

  if (view === "week") {
    const start = startOfWeek(anchorDate);
    return { start, end: addDays(start, 7) };
  }

  return { start: anchorDate, end: addDays(anchorDate, 1) };
}

function isSameMonth(left: string, right: string) {
  return left.slice(0, 7) === right.slice(0, 7);
}

function eventDay(event: MobileAppointment) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(event.start_at));
}

function eventsForDay(events: MobileAppointment[], day: string) {
  return events
    .filter((event) => eventDay(event) === day)
    .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime());
}

function formatEventTime(event: MobileAppointment) {
  return `${timeFormatter.format(new Date(event.start_at))} - ${timeFormatter.format(new Date(event.end_at))}`;
}

function eventTitle(event: MobileAppointment) {
  return event.customer_name || event.title || "Appointment";
}

function assignedPerson(event: MobileAppointment) {
  return cleanText(event.assigned_to) || "Unassigned";
}

function cleanText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || null;
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function windowCountLabel(event: MobileAppointment) {
  if (!event.window_count) return null;
  return `${event.window_count} window${event.window_count === 1 ? "" : "s"}`;
}

function durationLabel(event: MobileAppointment) {
  if (!event.appointment_duration_minutes) return null;
  const hours = event.appointment_duration_minutes / 60;
  if (Number.isInteger(hours)) return `${hours} hr`;
  return `${event.appointment_duration_minutes} min`;
}

function mapsUrl(address: string) {
  const encoded = encodeURIComponent(address);
  if (typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent)) {
    return `https://maps.apple.com/?daddr=${encoded}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

function openDirections(address: string | null | undefined) {
  const destination = cleanText(address);
  if (!destination) return;
  window.open(mapsUrl(destination), "_blank", "noopener,noreferrer");
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not available on this device."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  });
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "CRM request failed.";
    throw new Error(message);
  }
  return body as T;
}

function moveAnchorDate(anchorDate: string, view: CalendarView, direction: -1 | 1) {
  if (view === "list") return addDays(anchorDate, direction * 30);
  if (view === "month") return addMonths(anchorDate, direction);
  if (view === "week") return addDays(anchorDate, direction * 7);
  return addDays(anchorDate, direction);
}

function appointmentDateTimeRange(date: string, time: string, durationMinutes: number) {
  const start = zonedTimeToUtc(date, time);
  const safeDuration = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : bookingSlotDurationMinutes;
  const end = new Date(start.getTime() + safeDuration * 60 * 1000);
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString()
  };
}

function eventDateInputValue(event: MobileAppointment) {
  return eventDay(event);
}

function eventTimeInputValue(event: MobileAppointment) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(event.start_at));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function AppointmentChip({
  event,
  compact = false,
  onClick
}: {
  event: MobileAppointment;
  compact?: boolean;
  onClick: (event: MobileAppointment) => void;
}) {
  return (
    <button type="button" className={compact ? "mobile-crm-chip compact" : "mobile-crm-chip"} onClick={() => onClick(event)}>
      <span>{timeFormatter.format(new Date(event.start_at))}</span>
      <strong>{eventTitle(event)}</strong>
      <em>{assignedPerson(event)}</em>
    </button>
  );
}

function MonthView({
  events,
  anchorDate,
  onSelectDay,
  onSelectEvent
}: {
  events: MobileAppointment[];
  anchorDate: string;
  onSelectDay: (day: string) => void;
  onSelectEvent: (event: MobileAppointment) => void;
}) {
  const days = monthDays(anchorDate);
  const monthStart = startOfMonth(anchorDate);
  return (
    <div className="mobile-crm-month-grid">
      {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
        <div className="mobile-crm-month-head" key={`${weekday}-${index}`}>{weekday}</div>
      ))}
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day);
        return (
          <article className={`mobile-crm-month-day${isSameMonth(day, monthStart) ? "" : " outside"}`} key={day}>
            <button type="button" className="mobile-crm-day-number" onClick={() => onSelectDay(day)}>
              <span>{Number(day.slice(-2))}</span>
              {dayEvents.length ? <em>{dayEvents.length}</em> : null}
            </button>
            <div className="mobile-crm-month-events">
              {dayEvents.slice(0, 2).map((event) => (
                <AppointmentChip compact event={event} key={event.id} onClick={onSelectEvent} />
              ))}
              {dayEvents.length > 2 ? (
                <button type="button" className="mobile-crm-more" onClick={() => onSelectDay(day)}>
                  +{dayEvents.length - 2}
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function WeekView({
  events,
  anchorDate,
  onSelectDay,
  onSelectEvent
}: {
  events: MobileAppointment[];
  anchorDate: string;
  onSelectDay: (day: string) => void;
  onSelectEvent: (event: MobileAppointment) => void;
}) {
  return (
    <div className="mobile-crm-week-list">
      {weekDays(anchorDate).map((day) => {
        const dayEvents = eventsForDay(events, day);
        return (
          <section className="mobile-crm-week-day" key={day}>
            <button type="button" className="mobile-crm-week-date" onClick={() => onSelectDay(day)}>
              <span>{shortWeekdayFormatter.format(dateToUtcNoon(day))}</span>
              <strong>{Number(day.slice(-2))}</strong>
              <em>{dayEvents.length || 0} appt</em>
            </button>
            <div className="mobile-crm-week-events">
              {dayEvents.length ? (
                dayEvents.map((event) => <AppointmentChip event={event} key={event.id} onClick={onSelectEvent} />)
              ) : (
                <p>No appointments</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayView({
  events,
  anchorDate,
  onSelectEvent
}: {
  events: MobileAppointment[];
  anchorDate: string;
  onSelectEvent: (event: MobileAppointment) => void;
}) {
  const dayEvents = eventsForDay(events, anchorDate);
  return (
    <div className="mobile-crm-day-list">
      {dayEvents.length ? (
        dayEvents.map((event) => (
          <button type="button" className="mobile-crm-day-card" key={event.id} onClick={() => onSelectEvent(event)}>
            <span>{formatEventTime(event)}</span>
            <strong>{eventTitle(event)}</strong>
            <small>{assignedPerson(event)}</small>
            <em>{cleanText(event.customer_address || event.location) || "Address not set"}</em>
          </button>
        ))
      ) : (
        <div className="mobile-crm-empty-day">
          <CalendarDays />
          <p>No appointments for {longDayFormatter.format(dateToUtcNoon(anchorDate))}</p>
        </div>
      )}
    </div>
  );
}

function UpcomingView({
  events,
  onSelectEvent
}: {
  events: MobileAppointment[];
  onSelectEvent: (event: MobileAppointment) => void;
}) {
  const days = Array.from(new Set(events.map(eventDay))).sort();
  return (
    <div className="mobile-crm-upcoming-list">
      {days.length ? days.map((day) => (
        <section className="mobile-crm-upcoming-day" key={day}>
          <div className="mobile-crm-upcoming-date">
            <span>{shortWeekdayFormatter.format(dateToUtcNoon(day))}</span>
            <strong>{longDayFormatter.format(dateToUtcNoon(day))}</strong>
          </div>
          <div className="mobile-crm-day-list">
            {eventsForDay(events, day).map((event) => (
              <button type="button" className="mobile-crm-day-card" key={event.id} onClick={() => onSelectEvent(event)}>
                <span>{formatEventTime(event)}</span>
                <strong>{eventTitle(event)}</strong>
                <small>{assignedPerson(event)}</small>
                <em>{cleanText(event.customer_address || event.location) || "Address not set"}</em>
              </button>
            ))}
          </div>
        </section>
      )) : (
        <div className="mobile-crm-empty-day"><CalendarDays /><p>No upcoming appointments.</p></div>
      )}
    </div>
  );
}

function AppointmentDetailSheet({
  event,
  etaBusy,
  mutationBusy,
  etaMessage,
  onClose,
  onReschedule,
  onCancel,
  onTextAndNavigate,
  onNavigateOnly
}: {
  event: MobileAppointment;
  etaBusy: boolean;
  mutationBusy: boolean;
  etaMessage: string | null;
  onClose: () => void;
  onReschedule: (event: MobileAppointment) => void;
  onCancel: (event: MobileAppointment) => void;
  onTextAndNavigate: (event: MobileAppointment) => void;
  onNavigateOnly: (event: MobileAppointment) => void;
}) {
  const address = cleanText(event.customer_address || event.location);
  const canText = Boolean(event.customer_phone && address);
  return (
    <div className="mobile-crm-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-crm-sheet" role="dialog" aria-modal="true" aria-label="Appointment details" onClick={(eventClick) => eventClick.stopPropagation()}>
        <div className="mobile-crm-sheet-bar">
          <div>
            <span>{formatEventTime(event)}</span>
            <h2>{eventTitle(event)}</h2>
          </div>
          <button type="button" aria-label="Close appointment details" onClick={onClose}>
            <X />
          </button>
        </div>

        <div className="mobile-crm-detail-grid">
          <p><User /> <span>{cleanText(event.assigned_to) || "Unassigned"}</span></p>
          <p><Clock /> <span>{dateTimeFormatter.format(new Date(event.start_at))}{durationLabel(event) ? `, ${durationLabel(event)}` : ""}</span></p>
          <p><MapPin /> <span>{address || "Address not set"}</span></p>
          <p><Phone /> <span>{cleanText(event.customer_phone) || "Phone not set"}</span></p>
        </div>

        <div className="mobile-crm-detail-notes">
          {cleanText(event.product_interest) ? <p><strong>Product</strong><span>{event.product_interest}</span></p> : null}
          {windowCountLabel(event) ? <p><strong>Windows</strong><span>{windowCountLabel(event)}</span></p> : null}
          {cleanText(event.customer_notes || event.notes) ? <p><strong>Notes</strong><span>{event.customer_notes || event.notes}</span></p> : null}
        </div>

        {etaMessage ? <p className="mobile-crm-eta-status">{etaMessage}</p> : null}

        <div className="mobile-crm-sheet-actions">
          <button type="button" className="mobile-crm-secondary-action" disabled={mutationBusy} onClick={() => onReschedule(event)}>
            <CalendarClock />
            <span>Reschedule Appointment</span>
          </button>
          <button type="button" className="mobile-crm-danger-action" disabled={mutationBusy} onClick={() => onCancel(event)}>
            {mutationBusy ? <Loader2 className="spin" /> : <Trash2 />}
            <span>{mutationBusy ? "Canceling..." : "Cancel Appointment"}</span>
          </button>
          {event.job_id ? (
            <a className="mobile-crm-secondary-action" href={`/crm/technical-measures?jobId=${encodeURIComponent(event.job_id)}`}>
              <Ruler />
              <span>Technical Measure</span>
            </a>
          ) : null}
          <button type="button" className="mobile-crm-primary-action" disabled={!canText || etaBusy} onClick={() => onTextAndNavigate(event)}>
            {etaBusy ? <Loader2 className="spin" /> : <MessageSquare />}
            <span>{etaBusy ? "Sending..." : "Text & Navigate"}</span>
          </button>
          <button type="button" className="mobile-crm-secondary-action" disabled={!address || etaBusy} onClick={() => onNavigateOnly(event)}>
            <Navigation />
            <span>Navigate Only</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function RescheduleAppointmentSheet({
  event,
  busy,
  onClose,
  onSubmit
}: {
  event: MobileAppointment;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const duration = event.appointment_duration_minutes || bookingSlotDurationMinutes;
  return (
    <div className="mobile-crm-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-crm-sheet mobile-crm-add-sheet" role="dialog" aria-modal="true" aria-label="Reschedule appointment" onClick={(eventClick) => eventClick.stopPropagation()}>
        <div className="mobile-crm-sheet-bar">
          <div>
            <span>{eventTitle(event)}</span>
            <h2>Reschedule</h2>
          </div>
          <button type="button" aria-label="Close reschedule appointment" disabled={busy} onClick={onClose}>
            <X />
          </button>
        </div>

        <form className="mobile-crm-add-form" onSubmit={onSubmit}>
          <div className="mobile-crm-form-row">
            <label>
              New date
              <input name="date" type="date" required defaultValue={eventDateInputValue(event)} />
            </label>
            <label>
              New time
              <input name="time" type="time" required defaultValue={eventTimeInputValue(event)} />
            </label>
          </div>
          <label>
            Duration
            <select name="duration" defaultValue={String(duration)}>
              {Array.from(new Set([...appointmentDurations, duration])).sort((left, right) => left - right).map((minutes) => (
                <option value={minutes} key={minutes}>
                  {minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`}
                </option>
              ))}
            </select>
          </label>
          <div className="mobile-crm-sheet-actions">
            <button type="submit" className="mobile-crm-primary-action" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <CalendarClock />}
              <span>{busy ? "Rescheduling..." : "Confirm New Time"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AddAppointmentSheet({
  defaultDate,
  busy,
  onClose,
  onSubmit
}: {
  defaultDate: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="mobile-crm-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="mobile-crm-sheet mobile-crm-add-sheet" role="dialog" aria-modal="true" aria-label="Add appointment" onClick={(eventClick) => eventClick.stopPropagation()}>
        <div className="mobile-crm-sheet-bar">
          <div>
            <span>New appointment</span>
            <h2>Add Appointment</h2>
          </div>
          <button type="button" aria-label="Close add appointment" onClick={onClose}>
            <X />
          </button>
        </div>

        <form className="mobile-crm-add-form" onSubmit={onSubmit}>
          <label>
            Customer
            <input name="customer_name" required placeholder="Customer name" autoFocus />
          </label>
          <label>
            Phone
            <input name="phone" required inputMode="tel" placeholder="805-000-0000" />
          </label>
          <label>
            Address
            <input name="address" placeholder="Project address" />
          </label>
          <label>
            City
            <input name="city" placeholder="Camarillo" />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="customer@email.com" />
          </label>
          <div className="mobile-crm-form-row">
            <label>
              Date
              <input name="date" type="date" required defaultValue={defaultDate} />
            </label>
            <label>
              Time
              <input name="time" type="time" required defaultValue="09:00" />
            </label>
          </div>
          <div className="mobile-crm-form-row">
            <label>
              Duration
              <select name="duration" defaultValue={String(bookingSlotDurationMinutes)}>
                {appointmentDurations.map((duration) => (
                  <option value={duration} key={duration}>
                    {duration % 60 === 0 ? `${duration / 60} hr` : `${duration} min`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assigned
              <select name="assigned_to" defaultValue="Unassigned">
                {ownerOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Product
            <select name="product_interest" defaultValue="Shutters">
              {productOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Lead Source
            <select name="lead_source" defaultValue="">
              <option value="">Unknown</option>
              {leadSourceOptions.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <textarea name="notes" rows={3} placeholder="Gate code, rooms, samples to bring..." />
          </label>
          <div className="mobile-crm-sheet-actions">
            <button type="submit" className="mobile-crm-primary-action" disabled={busy}>
              {busy ? <Loader2 className="spin" /> : <Plus />}
              <span>{busy ? "Saving..." : "Save Appointment"}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function MobileAppointmentApp() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appointments, setAppointments] = useState<MobileAppointment[]>([]);
  const [view, setView] = useState<CalendarView>("list");
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(true);
  const [anchorDate, setAnchorDate] = useState(() => todayLosAngelesDate());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<MobileAppointment | null>(null);
  const [reschedulingAppointment, setReschedulingAppointment] = useState<MobileAppointment | null>(null);
  const [addingAppointment, setAddingAppointment] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [appointmentMutationBusy, setAppointmentMutationBusy] = useState(false);
  const [etaBusy, setEtaBusy] = useState(false);
  const [etaMessage, setEtaMessage] = useState<string | null>(null);
  const activeRange = useMemo(() => rangeForView(anchorDate, view), [anchorDate, view]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      setMessage("Supabase auth is not configured.");
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function loadAppointments(activeSession = session) {
    if (!activeSession) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        start: activeRange.start,
        end: activeRange.end,
        scope: "all"
      });
      const result = await crmFetch<MobileAppointmentsResponse>(activeSession, `/api/crm/mobile/appointments?${params}`);
      setAppointments(result.appointments);
      setUserLabel(result.user.displayName || result.user.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointments could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, activeRange.start, activeRange.end]);

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const customerName = formString(formData, "customer_name");
    const phone = formString(formData, "phone");
    const email = formString(formData, "email");
    const city = formString(formData, "city");
    const address = formString(formData, "address");
    const productInterest = formString(formData, "product_interest") || "Shutters";
    const assignedTo = formString(formData, "assigned_to") || "Unassigned";
    const notes = formString(formData, "notes");
    const date = formString(formData, "date");
    const time = formString(formData, "time");
    const durationMinutes = Number(formString(formData, "duration") || bookingSlotDurationMinutes);
    const { startAt, endAt } = appointmentDateTimeRange(date, time, durationMinutes);

    setSavingAppointment(true);
    setMessage(null);

    try {
      const { job } = await crmFetch<{ job: { id: string } }>(session, "/api/crm/jobs", {
        method: "POST",
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          email,
          city,
          address,
          product_interest: productInterest,
          lead_source: formString(formData, "lead_source"),
          sales_owner: assignedTo,
          priority: "normal",
          next_action: "Prepare for appointment",
          next_action_due: date,
          estimated_total: 0,
          notes
        })
      });

      await crmFetch<{ event: MobileAppointment }>(session, "/api/crm/calendar", {
        method: "POST",
        body: JSON.stringify({
          job_id: job.id,
          title: `${customerName} consultation`,
          event_type: "sales_consult",
          assigned_to: assignedTo,
          start_at: startAt,
          end_at: endAt,
          location: address,
          notes
        })
      });

      form.reset();
      setAddingAppointment(false);
      setAnchorDate(date);
      await loadAppointments(session);
      setMessage("Appointment saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be saved.");
      await loadAppointments(session);
    } finally {
      setSavingAppointment(false);
    }
  }

  async function rescheduleAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !reschedulingAppointment) return;

    const formData = new FormData(event.currentTarget);
    const date = formString(formData, "date");
    const time = formString(formData, "time");
    const durationMinutes = Number(formString(formData, "duration") || bookingSlotDurationMinutes);
    const { startAt, endAt } = appointmentDateTimeRange(date, time, durationMinutes);

    setAppointmentMutationBusy(true);
    setMessage(null);
    try {
      await crmFetch<{ event: MobileAppointment }>(session, "/api/crm/calendar", {
        method: "PATCH",
        body: JSON.stringify({
          id: reschedulingAppointment.id,
          start_at: startAt,
          end_at: endAt
        })
      });
      setReschedulingAppointment(null);
      setSelectedAppointment(null);
      setAnchorDate(date);
      await loadAppointments(session);
      setMessage(`${eventTitle(reschedulingAppointment)} was rescheduled.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be rescheduled.");
    } finally {
      setAppointmentMutationBusy(false);
    }
  }

  async function cancelAppointment(event: MobileAppointment) {
    if (!session) return;
    const confirmed = window.confirm(
      `Cancel ${eventTitle(event)}'s appointment?\n\nThis removes it from the active schedule but keeps the cancellation in your records.`
    );
    if (!confirmed) return;

    setAppointmentMutationBusy(true);
    setMessage(null);
    try {
      await crmFetch<{ event: MobileAppointment }>(session, "/api/crm/calendar", {
        method: "PATCH",
        body: JSON.stringify({
          id: event.id,
          action: "cancel",
          reason: "Canceled from mobile appointments"
        })
      });
      setSelectedAppointment(null);
      await loadAppointments(session);
      setMessage(`${eventTitle(event)}'s appointment was canceled.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Appointment could not be canceled.");
    } finally {
      setAppointmentMutationBusy(false);
    }
  }

  async function handleTextAndNavigate(event: MobileAppointment) {
    if (!session) return;
    const address = cleanText(event.customer_address || event.location);
    if (!event.customer_phone || !address) {
      setEtaMessage("Phone and address are required before sending an in-route text.");
      return;
    }

    setEtaBusy(true);
    setEtaMessage(null);
    try {
      const position = await getCurrentPosition();
      const result = await crmFetch<MobileEtaResponse>(session, `/api/crm/mobile/appointments/${event.id}/eta`, {
        method: "POST",
        body: JSON.stringify({
          installerLat: position.coords.latitude,
          installerLng: position.coords.longitude
        })
      });

      setSelectedAppointment(result.appointment);
      setEtaMessage(
        result.messageSent
          ? result.eta?.text
            ? `Text sent. Drive time ${result.eta.text}.`
            : "Text sent."
          : `Text not sent: ${result.sms.skipped || result.sms.error || "SMS unavailable"}.`
      );
      openDirections(address);
      await loadAppointments(session);
    } catch (error) {
      setEtaMessage(error instanceof Error ? error.message : "Could not send the in-route text.");
    } finally {
      setEtaBusy(false);
    }
  }

  if (authLoading) {
    return (
      <div className="mobile-crm-app mobile-crm-centered">
        <Loader2 className="spin" />
        <p>Checking session...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mobile-crm-login">
        <section>
          <div className="mobile-crm-logo">
            <img
              src="/brand/805-shutters-logo.png"
              alt="805 Shutters, Blinds, Shades, Drapery"
              width="286"
              height="270"
            />
          </div>
          <h1>Appointments</h1>
          <p>Sign in with an approved 805 Shutters Google account.</p>
          {message ? <em>{message}</em> : null}
          <a className="mobile-crm-google-button" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent("/crm/mobile")}`}>
            <span aria-hidden="true"><b>G</b></span>
            Continue with Google
          </a>
        </section>
      </div>
    );
  }

  const rangeLabel =
    view === "list"
      ? `Upcoming 30 days`
      : view === "month"
      ? monthLabelFormatter.format(dateToUtcNoon(startOfMonth(anchorDate)))
      : view === "week"
        ? `${longDayFormatter.format(dateToUtcNoon(activeRange.start))} - ${longDayFormatter.format(dateToUtcNoon(addDays(activeRange.end, -1)))}`
        : longDayFormatter.format(dateToUtcNoon(anchorDate));

  if (showWorkspaceMenu) {
    return (
      <MobileWorkspaceMenu
        appointmentCount={appointments.length}
        onOpenAppointments={() => setShowWorkspaceMenu(false)}
      />
    );
  }

  return (
    <div className="mobile-crm-app">
      <header className="mobile-crm-topbar">
        <button type="button" className="mobile-crm-back-button" aria-label="Back to workspaces" onClick={() => setShowWorkspaceMenu(true)}>
          <ArrowLeft />
        </button>
        <div>
          <span>805 Shutters</span>
          <h1>Appointments</h1>
          <p>All appointments</p>
        </div>
        <div className="mobile-crm-topbar-actions">
          <button type="button" aria-label="Add appointment" onClick={() => setAddingAppointment(true)}>
            <Plus />
          </button>
          <button type="button" aria-label="Close appointments and return to mobile app home" onClick={() => setShowWorkspaceMenu(true)}>
            <X />
          </button>
        </div>
      </header>

      <nav className="mobile-crm-workspaces" aria-label="Mobile CRM workspaces">
        <button type="button" className="active" aria-current="page"><CalendarDays />Appointments</button>
        <a href="/crm/technical-measures"><Ruler />Measures</a>
        <a href="/crm/mobile/quotes"><FileText />Quotes</a>
      </nav>

      <section className="mobile-crm-controls">
        <div className="mobile-crm-segment" aria-label="Calendar view">
          {calendarViews.map((item) => (
            <button type="button" className={view === item ? "active" : ""} key={item} onClick={() => setView(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="mobile-crm-range">
        <button type="button" aria-label="Previous" onClick={() => setAnchorDate(moveAnchorDate(anchorDate, view, -1))}>
          <ChevronLeft />
        </button>
        <button type="button" onClick={() => setAnchorDate(todayLosAngelesDate())}>
          <strong>{rangeLabel}</strong>
          <span>{appointments.length} scheduled</span>
        </button>
        <button type="button" aria-label="Next" onClick={() => setAnchorDate(moveAnchorDate(anchorDate, view, 1))}>
          <ChevronRight />
        </button>
      </section>

      <main className="mobile-crm-calendar">
        {message ? <p className="mobile-crm-alert">{message}</p> : null}
        {loading ? (
          <div className="mobile-crm-loading">
            <Loader2 className="spin" />
            <span>Loading appointments...</span>
          </div>
        ) : null}
        {view === "list" ? (
          <UpcomingView
            events={appointments}
            onSelectEvent={(event) => {
              setEtaMessage(null);
              setSelectedAppointment(event);
            }}
          />
        ) : view === "month" ? (
          <MonthView
            events={appointments}
            anchorDate={anchorDate}
            onSelectDay={(day) => {
              setAnchorDate(day);
              setView("day");
            }}
            onSelectEvent={(event) => {
              setEtaMessage(null);
              setSelectedAppointment(event);
            }}
          />
        ) : view === "week" ? (
          <WeekView
            events={appointments}
            anchorDate={anchorDate}
            onSelectDay={(day) => {
              setAnchorDate(day);
              setView("day");
            }}
            onSelectEvent={(event) => {
              setEtaMessage(null);
              setSelectedAppointment(event);
            }}
          />
        ) : (
          <DayView
            events={appointments}
            anchorDate={anchorDate}
            onSelectEvent={(event) => {
              setEtaMessage(null);
              setSelectedAppointment(event);
            }}
          />
        )}
      </main>

      <footer className="mobile-crm-footer">
        <button type="button" onClick={() => loadAppointments()} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} />
          <span>{userLabel || "Refresh"}</span>
        </button>
      </footer>

      {selectedAppointment ? (
        <AppointmentDetailSheet
          event={selectedAppointment}
          etaBusy={etaBusy}
          mutationBusy={appointmentMutationBusy}
          etaMessage={etaMessage}
          onClose={() => setSelectedAppointment(null)}
          onReschedule={(event) => {
            setSelectedAppointment(null);
            setReschedulingAppointment(event);
          }}
          onCancel={cancelAppointment}
          onTextAndNavigate={handleTextAndNavigate}
          onNavigateOnly={(event) => openDirections(event.customer_address || event.location)}
        />
      ) : null}

      {reschedulingAppointment ? (
        <RescheduleAppointmentSheet
          event={reschedulingAppointment}
          busy={appointmentMutationBusy}
          onClose={() => {
            if (!appointmentMutationBusy) setReschedulingAppointment(null);
          }}
          onSubmit={rescheduleAppointment}
        />
      ) : null}

      {addingAppointment ? (
        <AddAppointmentSheet
          defaultDate={anchorDate}
          busy={savingAppointment}
          onClose={() => {
            if (!savingAppointment) setAddingAppointment(false);
          }}
          onSubmit={createAppointment}
        />
      ) : null}
    </div>
  );
}

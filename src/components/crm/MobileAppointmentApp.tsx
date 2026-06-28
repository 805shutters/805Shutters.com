"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  RefreshCw,
  User,
  X
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { CrmCalendarEvent } from "@/lib/crm/types";

type CalendarView = "month" | "week" | "day";
type CalendarScope = "my" | "all";

type MobileAppointment = CrmCalendarEvent & {
  window_count?: number | null;
  appointment_duration_minutes?: number | null;
};

type MobileAppointmentsResponse = {
  appointments: MobileAppointment[];
  scope: CalendarScope;
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

const calendarViews: CalendarView[] = ["month", "week", "day"];
const calendarScopes: CalendarScope[] = ["my", "all"];

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

function cleanText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || null;
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
  if (view === "month") return addMonths(anchorDate, direction);
  if (view === "week") return addDays(anchorDate, direction * 7);
  return addDays(anchorDate, direction);
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

function AppointmentDetailSheet({
  event,
  etaBusy,
  etaMessage,
  onClose,
  onTextAndNavigate,
  onNavigateOnly
}: {
  event: MobileAppointment;
  etaBusy: boolean;
  etaMessage: string | null;
  onClose: () => void;
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

export function MobileAppointmentApp() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [appointments, setAppointments] = useState<MobileAppointment[]>([]);
  const [scope, setScope] = useState<CalendarScope>("my");
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(() => todayLosAngelesDate());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<MobileAppointment | null>(null);
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
        scope
      });
      const result = await crmFetch<MobileAppointmentsResponse>(activeSession, `/api/crm/mobile/appointments?${params}`);
      setAppointments(result.appointments);
      setOwnerLabel(result.owner);
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
  }, [session?.access_token, scope, activeRange.start, activeRange.end]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setAppointments([]);
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
    view === "month"
      ? monthLabelFormatter.format(dateToUtcNoon(startOfMonth(anchorDate)))
      : view === "week"
        ? `${longDayFormatter.format(dateToUtcNoon(activeRange.start))} - ${longDayFormatter.format(dateToUtcNoon(addDays(activeRange.end, -1)))}`
        : longDayFormatter.format(dateToUtcNoon(anchorDate));

  return (
    <div className="mobile-crm-app">
      <header className="mobile-crm-topbar">
        <div>
          <span>805 Shutters</span>
          <h1>Appointments</h1>
          <p>{scope === "my" ? ownerLabel ? `${ownerLabel}'s schedule` : "My appointments" : "All appointments"}</p>
        </div>
        <button type="button" aria-label="Sign out" onClick={signOut}>
          <LogOut />
        </button>
      </header>

      <section className="mobile-crm-controls">
        <div className="mobile-crm-segment" aria-label="Calendar scope">
          {calendarScopes.map((item) => (
            <button type="button" className={scope === item ? "active" : ""} key={item} onClick={() => setScope(item)}>
              {item === "my" ? "My" : "All"}
            </button>
          ))}
        </div>
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
        {view === "month" ? (
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
          etaMessage={etaMessage}
          onClose={() => setSelectedAppointment(null)}
          onTextAndNavigate={handleTextAndNavigate}
          onNavigateOnly={(event) => openDirections(event.customer_address || event.location)}
        />
      ) : null}
    </div>
  );
}

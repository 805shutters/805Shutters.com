"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { Ban, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { losAngelesDateString, losAngelesTimeString, zonedTimeToUtc, bookingSlotDurationMinutes } from "@/lib/booking/availability";
import type { CrmAvailabilitySlot, CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import { changeCalendarDay, monthAppointmentDetails, monthCalendarDays, monthDayEvents, publishedCalendarRanges } from "@/lib/crm/staff-month-calendar";
import { JessicaWorkingRanges } from "./JessicaWorkingRanges";
import styles from "./StaffMonthCalendar.module.css";

type Snapshot = { month: string; revision: string; ranges: CrmAvailabilitySlot[] };
type Selection = { date: string; time: string; startAt: string; endAt: string; availableOwners?: string[] };
type Props = { session: Session; events: CrmCalendarEvent[]; jobs: CrmJob[]; anchorDate: string; onDateChange: (date: string) => void; onSelectSlot: (slot: Selection) => void; onOpenEvent: (event: CrmCalendarEvent) => void };

export function StaffMonthCalendar({ session, events, jobs, anchorDate, onDateChange, onSelectSlot, onOpenEvent }: Props) {
  const month = anchorDate.slice(0, 7);
  const days = monthCalendarDays(month);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [start, setStart] = useState("09:00"), [end, setEnd] = useState("17:00");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [bookingDay, setBookingDay] = useState<string | null>(null);
  const [bookingTime, setBookingTime] = useState("09:00");
  const [showHours, setShowHours] = useState(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const section = useRef<HTMLElement>(null);
  const activeMonth = useRef(month);
  activeMonth.current = month;
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Calendar could not be saved. Reload and try again.");
    if (typeof body.revision !== "string" || !body.revision || !Array.isArray(body.ranges)) throw new Error("Calendar response is incomplete. Reload to try again.");
    return body as Omit<Snapshot, "month">;
  }, [session.access_token]);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setNotice(""); setSnapshot(null);
    request(`/api/crm/availability?month=${month}`).then(body => {
      if (current) setSnapshot({ ...body, month });
    }).catch(reason => { if (current) setError(reason.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [month, request, reload, events]);

  useEffect(() => {
    // Size the grid to the actual remaining viewport, independent of its contents.
    const fit = () => {
      if (section.current) section.current.style.setProperty("--calendar-height", `${Math.max(160, window.innerHeight - section.current.getBoundingClientRect().top - 16)}px`);
    };
    fit(); window.addEventListener("resize", fit);
    const observer = new ResizeObserver(fit);
    if (section.current?.parentElement) observer.observe(section.current.parentElement);
    return () => { window.removeEventListener("resize", fit); observer.disconnect(); };
  }, []);

  const dialogOpen = !!(selectedDay || bookingDay || showHours);
  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!dialogOpen && dialog.current?.open) dialog.current.close();
  }, [dialogOpen]);
  function closeDialog() {
    setSelectedDay(null); setBookingDay(null);
    if (showHours) { setShowHours(false); setReload(value => value + 1); }
  }
  const ready = !loading && snapshot?.month === month && !!snapshot.revision;
  const hasDrafts = snapshot?.ranges.some(range => range.status === "draft") ?? false;
  const canChange = ready && !saving && !hasDrafts;
  const published = publishedCalendarRanges(snapshot?.month === month ? snapshot.ranges : []);
  const isAvailable = (date: string) => published.some(range => losAngelesDateString(new Date(range.start_at)) === date);

  async function updateDay(date: string, available: boolean) {
    if (!canChange || !snapshot || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const ranges = changeCalendarDay(snapshot.ranges, date, available, start, end);
      const body = await request("/api/crm/availability", { method: "PUT", body: JSON.stringify({ month, revision: snapshot.revision, ranges }) });
      if (activeMonth.current === month) {
        setSnapshot({ ...body, month });
        setNotice(available ? `${date}: working hours published, ${start}–${end}.` : `${date}: blocked for new public bookings. Existing appointments stay scheduled.`);
      }
    } catch (reason) {
      if (activeMonth.current === month) {
        setError(reason instanceof Error ? reason.message : "Save failed. Reload to see current hours.");
        // A conflict or uncertain response must be reconciled before another write.
        setSnapshot(null);
      }
    } finally { inFlight.current = false; setSaving(false); }
  }
  function beginBooking(date: string) {
    setSelectedDay(null); setBookingDay(date);
    const first = published.find(range => losAngelesDateString(new Date(range.start_at)) === date);
    setBookingTime(first ? losAngelesTimeString(new Date(first.start_at)) : start);
  }
  function moveMonth(delta: number) {
    const [year, number] = month.split("-").map(Number);
    onDateChange(new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 10));
  }
  function controls(date: string, expanded = false) {
    return <div className={styles.actions} data-expanded={expanded}>
      <button type="button" className={styles.block} disabled={!canChange} aria-label={`Block ${date}`} title="Block day for public booking" onClick={() => void updateDay(date, false)}><Ban aria-hidden="true" /><span>Block</span></button>
      <button type="button" className={styles.available} disabled={!canChange} aria-label={`Available ${date}`} title={`Publish ${start}–${end} for public booking`} onClick={() => void updateDay(date, true)}><CheckCircle2 aria-hidden="true" /><span>Available</span></button>
      <button type="button" className={styles.book} disabled={saving} aria-label={`Book Appointment ${date}`} title="Book Appointment" onClick={() => beginBooking(date)}><CalendarPlus aria-hidden="true" /><span>Book Appointment</span></button>
    </div>;
  }
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  return <section ref={section} className={styles.calendar} aria-label="Appointment calendar">
    <header className={styles.header}>
      <div><h1>Calendar</h1><p>Consultations &amp; public booking · Pacific time</p></div>
      <div className={styles.navigation}><button type="button" disabled={saving} onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft /></button><h2>{monthLabel}</h2><button type="button" disabled={saving} onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight /></button><button type="button" disabled={saving} onClick={() => onDateChange(losAngelesDateString())}>Today</button></div>
    </header>
    <div className={styles.toolbar}>
      <span>Jessica’s public hours</span><label>From <input type="time" aria-label="Public hours start" value={start} disabled={saving} onChange={e => setStart(e.target.value)} /></label><label>To <input type="time" aria-label="Public hours end" value={end} disabled={saving} onChange={e => setEnd(e.target.value)} /></label>
      <button type="button" aria-label="Working hours" disabled={saving || loading} onClick={() => setShowHours(true)}>Hours</button>
      <span className={styles.legend}><i /> Available <i /> Blocked <i /> Appointment</span>
    </div>
    <div className={styles.status} role={error ? "alert" : "status"}>
      <span>{loading ? "Loading public hours…" : error || (hasDrafts ? "Unpublished hours need review. Open Working hours before changing a day." : notice || "Available uses the hours above. Customer booking still checks travel time, conflicts, and notice.")}</span>
      {error && <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload calendar</button>}
    </div>
    <div className={styles.weekdays}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day}>{day}</span>)}</div>
    <div className={styles.grid} style={{ "--week-count": days.length / 7 } as CSSProperties}>
      {days.map((date, index) => {
        if (!date) return <div key={`empty-${index}`} className={styles.empty} />;
        const appointments = monthDayEvents(events, date);
        const first = appointments[0];
        const details = first && monthAppointmentDetails(first, jobs);
        const state = !ready ? "unknown" : isAvailable(date) ? "available" : "blocked";
        return <article key={date} className={styles.day} data-date={date} data-state={state} aria-label={`${date}, ${state}`}>
          <button type="button" className={styles.date} aria-label={`Day details ${date}`} aria-current={date === losAngelesDateString() ? "date" : undefined} onClick={() => setSelectedDay(date)}><span>{Number(date.slice(-2))}</span>{appointments.length > 1 && <small>+{appointments.length - 1}</small>}</button>
          {details ? <button type="button" className={styles.appointment} aria-label={`Appointments ${date}: ${details.name}${appointments.length > 1 ? ` and ${appointments.length - 1} more` : ""}`} onClick={() => setSelectedDay(date)}>
            <strong title={details.name}>{details.name}</strong><span title={`City: ${details.city}`}><small>City</small> {details.city}</span><span title={`Product: ${details.product}`}><small>Product</small> {details.product}</span><span title={`Lead Type: ${details.leadType}`}><small>Lead Type</small> {details.leadType}</span>
          </button> : controls(date)}
        </article>;
      })}
    </div>
    <dialog ref={dialog} className={styles.dialog} onCancel={closeDialog} onClose={closeDialog} aria-labelledby="month-dialog-title">
      <div className={styles.dialogHead}><h2 id="month-dialog-title">{showHours ? "Working hours" : bookingDay ? "Book Appointment" : selectedDay}</h2><button type="button" aria-label="Close calendar details" onClick={closeDialog}><X /></button></div>
      {showHours ? <JessicaWorkingRanges session={session} initialMonth={month} /> : bookingDay ? <form className={styles.bookingForm} onSubmit={event => {
        event.preventDefault();
        const startAt = zonedTimeToUtc(bookingDay, bookingTime);
        const slot = { date: bookingDay, time: bookingTime, startAt: startAt.toISOString(), endAt: new Date(startAt.getTime() + bookingSlotDurationMinutes * 60000).toISOString() };
        closeDialog(); onSelectSlot(slot);
      }}><p>{bookingDay} · Pacific time</p><label>Appointment time<input type="time" required value={bookingTime} onChange={event => setBookingTime(event.target.value)} /></label><button type="submit" className={styles.book}>Continue to customer details</button></form> : selectedDay && <>
        <p className={styles.daySummary}>{!ready ? "Public hours not loaded" : isAvailable(selectedDay) ? "Available for public booking during published hours" : "Blocked for new public bookings"}</p>
        {controls(selectedDay, true)}
        {saving && <p role="status">Saving day…</p>}{error && <p role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Reload calendar</button></p>}
        {monthDayEvents(events, selectedDay).map(event => {
          const details = monthAppointmentDetails(event, jobs);
          return <button type="button" key={event.id} className={styles.detailAppointment} onClick={() => { closeDialog(); onOpenEvent(event); }}><strong>{details.name}</strong><span>{losAngelesTimeString(new Date(event.start_at))}–{losAngelesTimeString(new Date(event.end_at))} · {event.assigned_to || "Unassigned"}</span><span>City: {details.city}</span><span>Product: {details.product}</span><span>Lead Type: {details.leadType}</span><b>Open appointment →</b></button>;
        })}
      </>}
    </dialog>
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { Ban, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { losAngelesDateString, losAngelesTimeString, bookingSlotDurationMinutes } from "@/lib/booking/availability";
import type { CrmAvailabilitySlot, CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import { changeCalendarDay, monthAppointmentDetails, monthDayEvents, publishedCalendarRanges } from "@/lib/crm/staff-month-calendar";
import { calendarHour, calendarHourState, calendarHourOccupied, changeCalendarHour } from "@/lib/crm/staff-calendar-slots";
import { weekCalendarDays, shiftCalendarWeek, weekTimeBounds, weekDayLayout } from "@/lib/crm/staff-week-calendar";
import { JessicaWorkingRanges } from "./JessicaWorkingRanges";
import styles from "./StaffWeekCalendar.module.css";

type Snapshot = { month: string; revision: string; ranges: CrmAvailabilitySlot[] };
type Selection = { date: string; time: string; startAt: string; endAt: string; availableOwners?: string[] };
type Props = { session: Session; events: CrmCalendarEvent[]; jobs: CrmJob[]; anchorDate: string; onDateChange: (date: string) => void; onSelectSlot: (slot: Selection) => void; onOpenEvent: (event: CrmCalendarEvent) => void };

export function StaffWeekCalendar({ session, events, jobs, anchorDate, onDateChange, onSelectSlot, onOpenEvent }: Props) {
  const month = anchorDate.slice(0, 7);
  const days = weekCalendarDays(anchorDate);
  const week = days[0];
  const monthsKey = [...new Set(days.map(date => date.slice(0, 7)))].join(",");
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showHours, setShowHours] = useState(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const section = useRef<HTMLElement>(null);
  const activeWeek = useRef(week);
  activeWeek.current = week;
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "Calendar could not be saved. Reload and try again.");
    if (typeof body.revision !== "string" || !body.revision || !Array.isArray(body.ranges)) throw new Error("Calendar response is incomplete. Reload to try again.");
    return body as Omit<Snapshot, "month">;
  }, [session.access_token]);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setNotice(""); setSnapshots({});
    Promise.all(monthsKey.split(",").map(async month => ({ ...await request(`/api/crm/availability?month=${month}`), month }))).then(results => {
      if (current) setSnapshots(Object.fromEntries(results.map(snapshot => [snapshot.month, snapshot])));
    }).catch(reason => { if (current) setError(reason.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [monthsKey, request, reload, events]);

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

  const dialogOpen = !!(selectedDay || showHours);
  useEffect(() => {
    if (dialogOpen && !dialog.current?.open) dialog.current?.showModal();
    if (!dialogOpen && dialog.current?.open) dialog.current.close();
  }, [dialogOpen]);
  function closeDialog() {
    setSelectedDay(null);
    if (showHours) { setShowHours(false); setReload(value => value + 1); }
  }
  const ready = !loading && monthsKey.split(",").every(month => !!snapshots[month]?.revision);
  const hasDrafts = Object.values(snapshots).some(snapshot => snapshot.ranges.some(range => range.status === "draft"));
  const canChange = ready && !saving && !hasDrafts;
  const published = publishedCalendarRanges(Object.values(snapshots).flatMap(snapshot => snapshot.ranges));
  const isAvailable = (date: string) => published.some(range => losAngelesDateString(new Date(range.start_at)) === date);

  async function updateAvailability(date: string, minute: number | null, available: boolean) {
    const month = date.slice(0, 7);
    const snapshot = snapshots[month];
    if (!canChange || !snapshot || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const ranges = minute === null ? changeCalendarDay(snapshot.ranges, date, false, "", "") : changeCalendarHour(snapshot.ranges, date, minute, available);
      const body = await request("/api/crm/availability", { method: "PUT", body: JSON.stringify({ month, revision: snapshot.revision, ranges }) });
      if (activeWeek.current === week) {
        setSnapshots(current => ({ ...current, [month]: { ...body, month } }));
        setNotice(`${date}${minute === null ? "" : ` ${calendarHour(date, minute).time}`}: ${available ? "hour published for public booking" : minute === null ? "day blocked for new public bookings; existing appointments stay scheduled" : "hour blocked for new public bookings"}.`);
      }
    } catch (reason) {
      if (activeWeek.current === week) {
        setError(reason instanceof Error ? reason.message : "Save failed. Reload to see current hours.");
        // A conflict or uncertain response must be reconciled before another write.
        setSnapshots({});
      }
    } finally { inFlight.current = false; setSaving(false); }
  }
  function beginBooking(date: string, minute: number) {
    const slot = calendarHour(date, minute);
    onSelectSlot({ ...slot, endAt: new Date(Date.parse(slot.startAt) + bookingSlotDurationMinutes * 60000).toISOString() });
  }
  function controls(date: string, minute: number) {
    const time = calendarHour(date, minute).time;
    return <div className={styles.actions}>
      <button type="button" className={styles.block} disabled={!canChange} aria-label={`Block ${date} ${time}`} title={`Block ${time} for public booking`} onClick={() => void updateAvailability(date, minute, false)}><Ban aria-hidden="true" /><span>Block</span></button>
      <button type="button" className={styles.available} disabled={!canChange} aria-label={`Available ${date} ${time}`} title={`Publish the hour starting ${time}`} onClick={() => void updateAvailability(date, minute, true)}><CheckCircle2 aria-hidden="true" /><span>Available</span></button>
      <button type="button" className={styles.book} disabled={saving} aria-label={`Book Appointment ${date} ${time}`} title={`Book Appointment at ${time}`} onClick={() => beginBooking(date, minute)}><CalendarPlus aria-hidden="true" /><span>Book Appointment</span></button>
    </div>;
  }
  const labelDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const weekLabel = `${labelDate(days[0])} – ${labelDate(days[6])}, ${days[6].slice(0, 4)}`;
  const bounds = weekTimeBounds(events, days);
  const hours = Array.from({ length: (bounds.end - bounds.start) / 60 }, (_, index) => bounds.start + index * 60);
  const timeLabel = (minute: number) => `${Math.floor(minute / 60) % 12 || 12} ${minute < 720 ? "AM" : "PM"}`;
  return <section ref={section} className={styles.calendar} aria-label="Appointment calendar">
    <header className={styles.header}>
      <div><h1>Calendar</h1><p>Consultations &amp; public booking · Pacific time</p></div>
      <div className={styles.navigation}><button type="button" disabled={saving} onClick={() => onDateChange(shiftCalendarWeek(anchorDate, -1))} aria-label="Previous week"><ChevronLeft /></button><h2>{weekLabel}</h2><button type="button" disabled={saving} onClick={() => onDateChange(shiftCalendarWeek(anchorDate, 1))} aria-label="Next week"><ChevronRight /></button><button type="button" disabled={saving} onClick={() => onDateChange(losAngelesDateString())}>Today</button></div>
    </header>
    <div className={styles.toolbar}>
      <span>One-hour slots · Jessica’s public availability</span>
      <button type="button" aria-label="Working hours" disabled={saving || loading} onClick={() => setShowHours(true)}>Working hours</button>
      <span className={styles.legend}><i /> Available <i /> Blocked <i /> Appointment</span>
    </div>
    <div className={styles.status} role={error ? "alert" : "status"}>
      <span>{loading ? "Loading public hours…" : error || (hasDrafts ? "Unpublished hours need review. Open Working hours before changing a slot." : notice || "Each button changes one hour. Public booking still checks travel time, conflicts, and notice.")}</span>
      {error && <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload calendar</button>}
    </div>
    <div className={styles.weekHeader}>
      <span className={styles.timeHeading}>Pacific</span>
      {days.map((date, index) => <div key={date} className={styles.dayHead}>
        <button type="button" className={styles.date} aria-label={`Day details ${date}`} aria-current={date === losAngelesDateString() ? "date" : undefined} onClick={() => setSelectedDay(date)}><span>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]} {Number(date.slice(-2))}</span><small>{monthDayEvents(events, date).length || ""}</small></button>
        <button type="button" className={styles.blockDay} disabled={!canChange} aria-label={`Block day ${date}`} onClick={() => void updateAvailability(date, null, false)}><Ban aria-hidden="true" /><span>Block day</span></button>
      </div>)}
    </div>
    <div className={styles.grid} style={{ "--hour-count": hours.length } as CSSProperties}>
      <div className={styles.timeAxis}>{hours.map((minute, index) => <span key={minute} style={{ top: `${index / hours.length * 100}%` }}>{timeLabel(minute)}</span>)}</div>
      {days.map(date => {
        const state = !ready ? "unknown" : "loaded";
        const layout = weekDayLayout(events, date, bounds);
        return <article key={date} className={styles.day} data-date={date} data-state={state} aria-label={`${date}, ${state}`}>
          {hours.map(minute => {
            const slot = calendarHour(date, minute);
            const occupied = calendarHourOccupied(events, date, slot.startAt, slot.endAt);
            const state = !ready ? "unknown" : calendarHourState(published, slot.startAt, slot.endAt);
            return <div key={minute} className={styles.hourSlot} data-time={slot.time} data-state={state} data-occupied={occupied} style={{ top: `${(minute - bounds.start) / (bounds.end - bounds.start) * 100}%`, height: `${60 / (bounds.end - bounds.start) * 100}%` }} aria-label={`${date} ${slot.time}, ${occupied ? "appointment" : state}`}>
              {!occupied && controls(date, minute)}
              {!occupied && state === "partial" && <span className={styles.partial} title="Only part of this hour is published">Partial</span>}
            </div>;
          })}
          {layout.map(({ event, top, height, lane, lanes }) => {
            const details = monthAppointmentDetails(event, jobs);
            const time = `${losAngelesTimeString(new Date(event.start_at))}–${losAngelesTimeString(new Date(event.end_at))}`;
            return <button type="button" key={event.id} className={styles.appointment} style={{ top: `${top}%`, height: `${height}%`, left: `${lane / lanes * 100}%`, width: `${100 / lanes}%` }} aria-label={`${details.name}, ${date} ${time}. City: ${details.city}. Product: ${details.product}. Lead Type: ${details.leadType}. Open appointment`} title={`${time} · ${details.name}\nCity: ${details.city}\nProduct: ${details.product}\nLead Type: ${details.leadType}`} onClick={() => onOpenEvent(event)}>
              <strong>{details.name}</strong><span><small>City</small> {details.city}</span><span><small>Product</small> {details.product}</span><span><small>Lead Type</small> {details.leadType}</span>
            </button>;
          })}
        </article>;
      })}
    </div>
    <dialog ref={dialog} className={styles.dialog} onCancel={closeDialog} onClose={closeDialog} aria-labelledby="week-dialog-title">
      <div className={styles.dialogHead}><h2 id="week-dialog-title">{showHours ? "Working hours" : selectedDay}</h2><button type="button" aria-label="Close calendar details" onClick={closeDialog}><X /></button></div>
      {showHours ? <JessicaWorkingRanges session={session} initialMonth={month} /> : selectedDay && <>
        <p className={styles.daySummary}>{!ready ? "Public hours not loaded" : isAvailable(selectedDay) ? "Available for public booking during published hours" : "Blocked for new public bookings"}</p>
        <button type="button" className={styles.blockDay} disabled={!canChange} onClick={() => void updateAvailability(selectedDay, null, false)}>Block day</button>
        {saving && <p role="status">Saving day…</p>}{error && <p role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Reload calendar</button></p>}
        {monthDayEvents(events, selectedDay).map(event => {
          const details = monthAppointmentDetails(event, jobs);
          return <button type="button" key={event.id} className={styles.detailAppointment} onClick={() => { closeDialog(); onOpenEvent(event); }}><strong>{details.name}</strong><span>{losAngelesTimeString(new Date(event.start_at))}–{losAngelesTimeString(new Date(event.end_at))} · {event.assigned_to || "Unassigned"}</span><span>City: {details.city}</span><span>Product: {details.product}</span><span>Lead Type: {details.leadType}</span><b>Open appointment →</b></button>;
        })}
      </>}
    </dialog>
  </section>;
}

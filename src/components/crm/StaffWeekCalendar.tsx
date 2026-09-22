"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { Check, Minus, ChevronLeft, ChevronRight, CalendarPlus, Settings2, Plus, X } from "lucide-react";
import { losAngelesDateString, losAngelesTimeString, bookingSlotDurationMinutes } from "@/lib/booking/availability";
import type { CrmAvailabilitySlot, CrmCalendarEvent, CrmJob } from "@/lib/crm/types";
import { changeCalendarDay, monthAppointmentDetails, monthDayEvents, publishedCalendarRanges } from "@/lib/crm/staff-month-calendar";
import { calendarSlot, staffCalendarIntervalMinutes, calendarHourState, calendarHourOccupied, changeCalendarSlot, calendarDayState, changeCalendarDayHours } from "@/lib/crm/staff-calendar-slots";
import { weekCalendarDays, shiftCalendarWeek, weekTimeBounds, weekDayLayout } from "@/lib/crm/staff-week-calendar";
import { calendarEventSalePresentation } from "@/lib/crm/calendar-event-sales";
import { JessicaWorkingRanges } from "./JessicaWorkingRanges";
import styles from "./StaffWeekCalendar.module.css";

type Snapshot = { month: string; revision: string; ranges: CrmAvailabilitySlot[] };
type Selection = { date: string; time: string; startAt: string; endAt: string; availableOwners?: string[] };
type Props = { session: Session; events: CrmCalendarEvent[]; jobs: CrmJob[]; anchorDate: string; onDateChange: (date: string) => void; onSelectSlot: (slot: Selection) => void; onOpenEvent: (event: CrmCalendarEvent) => void; onClose: () => void };

export function StaffWeekCalendar({ session, events, jobs, anchorDate, onDateChange, onSelectSlot, onOpenEvent, onClose }: Props) {
  const month = anchorDate.slice(0, 7);
  const days = weekCalendarDays(anchorDate, 1);
  const week = days[0];
  const monthsKey = [...new Set(days.map(date => date.slice(0, 7)))].join(",");
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showWeekends, setShowWeekends] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState(false);
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
      if (section.current) section.current.style.setProperty("--calendar-height", `${Math.max(160, window.innerHeight - section.current.getBoundingClientRect().top - 8)}px`);
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
      const ranges = minute === null
        ? available ? changeCalendarDayHours(snapshot.ranges, events, date, slots, staffCalendarIntervalMinutes) : changeCalendarDay(snapshot.ranges, date, false, "", "")
        : changeCalendarSlot(snapshot.ranges, date, minute, available);
      const body = await request("/api/crm/availability", { method: "PUT", body: JSON.stringify({ month, revision: snapshot.revision, ranges }) });
      if (activeWeek.current === week) {
        setSnapshots(current => ({ ...current, [month]: { ...body, month } }));
        setNotice(`${date}${minute === null ? "" : ` ${calendarSlot(date, minute).time}`}: ${available ? minute === null ? "unbooked half-hours published for public booking" : "half-hour published for public booking" : minute === null ? "day blocked for new public bookings; existing appointments stay scheduled" : "half-hour blocked for new public bookings"}.`);
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
    const slot = calendarSlot(date, minute);
    onSelectSlot({ ...slot, endAt: new Date(Date.parse(slot.startAt) + bookingSlotDurationMinutes * 60000).toISOString() });
  }
  function availabilityToggle(date: string, minute: number | null, state: string, disabled = false) {
    const full = state === "available";
    const partial = state === "partial";
    const label = minute === null ? `${full ? "Block" : "Make available"} day ${date}` : `${full ? "Block" : "Make available"} ${date} ${calendarSlot(date, minute).time}`;
    return <button type="button" className={styles.availabilityToggle} data-scope={minute === null ? "day" : "slot"}
      disabled={!canChange || disabled} aria-label={label} aria-pressed={partial ? "mixed" : full}
      title={minute === null ? `${full ? "Block public booking for this day" : "Publish all displayed unbooked half-hours"}. Existing appointments stay scheduled.` : `${full ? "Block this half-hour" : partial ? "Publish the rest of this half-hour" : "Make this half-hour available"} for public booking`}
      onClick={() => void updateAvailability(date, minute, !full)}>
      {full ? <Check aria-hidden="true" /> : partial ? <Minus aria-hidden="true" /> : null}
    </button>;
  }
  const labelDate = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const visibleDays = showWeekends ? days : days.slice(0, 5);
  const weekLabel = `${labelDate(visibleDays[0])} – ${labelDate(visibleDays[visibleDays.length - 1])}, ${days[6].slice(0, 4)}`;
  const bounds = weekTimeBounds(events, days);
  const slots = Array.from({ length: (bounds.end - bounds.start) / staffCalendarIntervalMinutes }, (_, index) => bounds.start + index * staffCalendarIntervalMinutes);
  const timeLabel = (minute: number) => `${Math.floor(minute / 60) % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${minute < 720 ? "AM" : "PM"}`;
  return <section ref={section} className={styles.calendar} aria-label="Appointment calendar">
    <header className={styles.header}>
      <h2 className={styles.weekLabel}>{weekLabel}</h2>
      <div className={styles.navigation}>
        <button type="button" disabled={saving} onClick={() => onDateChange(shiftCalendarWeek(anchorDate, -1))} aria-label="Previous week"><ChevronLeft /></button>
        <button type="button" disabled={saving} onClick={() => onDateChange(losAngelesDateString())}>Today</button>
        <button type="button" disabled={saving} onClick={() => onDateChange(shiftCalendarWeek(anchorDate, 1))} aria-label="Next week"><ChevronRight /></button>
      </div>
      <div className={styles.headerActions}>
        <button className={styles.newBooking} type="button" disabled={!ready || saving || !!error} onClick={() => beginBooking(visibleDays.includes(anchorDate) ? anchorDate : visibleDays[0], bounds.start)}><CalendarPlus aria-hidden="true" />Book appointment</button>
        <button className={styles.hoursButton} type="button" aria-pressed={editingAvailability} disabled={saving || loading} onClick={() => setEditingAvailability(value => !value)}><Settings2 aria-hidden="true" />{editingAvailability ? "Done editing" : "Edit availability"}</button>
        <label className={styles.weekendSwitch}><input type="checkbox" role="switch" checked={showWeekends} onChange={event => setShowWeekends(event.target.checked)} /><span>Show weekends</span></label>
        <button className={styles.closeButton} type="button" aria-label="Return to CRM home" title="Return to CRM home" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
    </header>
    {editingAvailability && <div className={styles.editingBar}><span>Choose half-hours to publish or block for public booking.</span><button type="button" disabled={saving || loading} onClick={() => setShowHours(true)}>Working hours</button></div>}
    <div className={`${styles.status} ${error || hasDrafts ? styles.statusVisible : styles.statusQuiet}`} role={error ? "alert" : "status"}>
      <span>{loading ? "Loading public hours…" : error || (hasDrafts ? "Unpublished hours need review. Open Working hours before changing a slot." : notice || "Select an open half-hour to book at that time. Circles change public availability.")}</span>
      {error && <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)}>Reload calendar</button>}
    </div>
    <div className={styles.weekScroll}>
    <div className={styles.grid} style={{ "--day-count": visibleDays.length } as CSSProperties}>
      {visibleDays.map((date, index) => {
        const state = !ready ? "unknown" : "loaded";
        const dayState = ready ? calendarDayState(published, events, date, slots, staffCalendarIntervalMinutes) : "unknown";
        const layout = weekDayLayout(events, date, bounds);
        return <article key={date} className={styles.day} data-date={date} data-state={state} aria-label={`${date}, ${state}`}>
          <div className={styles.dayHead}>
            <button type="button" className={styles.date} aria-label={`Day details ${date}`} aria-current={date === losAngelesDateString() ? "date" : undefined} onClick={() => setSelectedDay(date)}><span><small>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</small> {Number(date.slice(-2))}</span></button>
            <span className={styles.dayCount} title={`${layout.length} appointments`}>{layout.length} {layout.length === 1 ? "appt" : "appts"}</span>
            <button type="button" className={styles.addDay} aria-label={`Add appointment ${date}`} title="Add appointment to this day" disabled={!ready || saving || !!error} onClick={() => beginBooking(date, bounds.start)}><Plus aria-hidden="true" /></button>
            {availabilityToggle(date, null, dayState, dayState === "booked")}
          </div>
          <div className={styles.dayScroll} tabIndex={0} role="region" aria-label={`Scroll appointments for ${date}`}>
          <div className={styles.timeline} style={{ "--slot-count": slots.length } as CSSProperties}>
          <div className={styles.timeAxis} aria-hidden="true">{slots.map((minute, index) => <span key={minute} style={{ top: `${index / slots.length * 100}%` }}>{timeLabel(minute)}</span>)}</div>
          {slots.map(minute => {
            const slot = calendarSlot(date, minute);
            const occupied = calendarHourOccupied(events, date, slot.startAt, slot.endAt);
            const state = !ready ? "unknown" : calendarHourState(published, slot.startAt, slot.endAt);
            return <div key={minute} className={styles.hourSlot} data-time={slot.time} data-state={state} data-occupied={occupied} style={{ top: `${(minute - bounds.start) / (bounds.end - bounds.start) * 100}%`, height: `${staffCalendarIntervalMinutes / (bounds.end - bounds.start) * 100}%` }} aria-label={`${date} ${slot.time}, ${occupied ? "appointment" : state}`}>
              {!occupied && <>
                <button type="button" className={styles.bookSlot} disabled={!ready || saving || !!error} aria-label={`Book Appointment ${date} ${slot.time}`} onClick={() => beginBooking(date, minute)}><span>+ Book {timeLabel(minute)}</span></button>
                {availabilityToggle(date, minute, state)}
                {editingAvailability && (state === "available" || state === "partial") && <span className={styles.slotStatus}>{state === "available" ? "Available" : "Partly available"}</span>}
              </>}
            </div>;
          })}
          {layout.map(({ event, top, height, overlap }) => {
            const details = monthAppointmentDetails(event, jobs);
            const sale = calendarEventSalePresentation(event);
            const saleLabel = sale.tone === "sold" ? "SOLD" : sale.tone === "unsold" ? "NOT SOLD" : "";
            const time = `${losAngelesTimeString(new Date(event.start_at))}–${losAngelesTimeString(new Date(event.end_at))}`;
            return <button type="button" key={event.id} className={styles.appointment} data-sale={sale.tone || "pending"} data-short={height / 100 * slots.length < 1.5} style={{ top: `calc(${top}% + 3px)`, height: `calc(${height}% - 6px)` }} aria-label={`${details.name}, ${date} ${time}.${saleLabel ? ` ${saleLabel}.` : ""} City: ${details.city}. Product: ${details.product}. Lead Type: ${details.leadType}.${overlap ? " Overlapping appointment times." : ""} Open appointment`} title={`${time} · ${details.name}\nCity: ${details.city}\nProduct: ${details.product}\nLead Type: ${details.leadType}`} onClick={() => onOpenEvent(event)}>
              <span className={styles.eventTime}>{time}{saleLabel ? ` · ${saleLabel}` : ""}</span><strong>{details.name}</strong><span>{details.city} · {details.product}</span>
            </button>;
          })}
          </div>
          </div>
        </article>;
      })}
    </div>
    </div>
    <footer className={styles.footer}><div className={styles.legend}><span><i />Available</span><span><i />Booked</span><span><i />Unavailable for public booking</span></div><span>30-minute starts · Pacific · Circle: availability · Scroll each day independently</span></footer>
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

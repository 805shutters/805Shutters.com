"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  availabilitySlotKey,
  bookingAvailabilityOwner,
  bookingSlotTimes,
  losAngelesDateString,
  slotKey,
  type BookingAvailabilitySlot
} from "@/lib/booking/availability";

type AvailabilityResponse = {
  month: string;
  owner: string;
  durationMinutes: number;
  slotTimes: string[];
  slots: BookingAvailabilitySlot[];
  busySlotKeys: string[];
};

type AvailabilityDay = {
  dateKey: string;
  day: number;
  today: boolean;
};

type CrmAvailabilityCalendarProps = {
  session: Session;
};

function monthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function currentMonthKey() {
  return losAngelesDateString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const start = monthStart(month);
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonthTitle(month: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(monthStart(month));
}

function buildAvailabilityDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const today = losAngelesDateString();

  return Array.from({ length: daysInMonth }, (_item, index): AvailabilityDay => {
    const day = index + 1;
    const dateKey = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      dateKey,
      day,
      today: dateKey === today
    };
  });
}

function startOffset(month: string) {
  return monthStart(month).getUTCDay();
}

function formatSlotLabel(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const end = new Date(Date.UTC(2026, 0, 1, hour, minute + 120, 0));
  return `${formatHour(hour, minute)}-${formatHour(end.getUTCHours(), end.getUTCMinutes())}`;
}

function formatHour(hour: number, minute: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}` : `${displayHour} ${suffix}`;
}

async function crmFetch<T>(session: Session, path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "CRM request failed.");
  }

  return body as T;
}

export function CrmAvailabilityCalendar({ session }: CrmAvailabilityCalendarProps) {
  const [month, setMonth] = useState(currentMonthKey());
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const days = useMemo(() => buildAvailabilityDays(month), [month]);
  const selectedKeys = useMemo(
    () => new Set((availability?.slots || []).map((slot) => availabilitySlotKey(slot))),
    [availability]
  );
  const busyKeys = useMemo(() => new Set(availability?.busySlotKeys || []), [availability]);
  const today = losAngelesDateString();
  const availableCount = days.reduce(
    (count, day) =>
      count +
      bookingSlotTimes.filter((time) => {
        const key = slotKey(day.dateKey, time);
        return day.dateKey >= today && selectedKeys.has(key) && !busyKeys.has(key);
      }).length,
    0
  );
  const bookedCount = days.reduce(
    (count, day) => count + bookingSlotTimes.filter((time) => busyKeys.has(slotKey(day.dateKey, time))).length,
    0
  );

  async function loadAvailability(nextMonth = month) {
    setLoading(true);
    setMessage(null);

    try {
      const result = await crmFetch<AvailabilityResponse>(
        session,
        `/api/crm/availability?month=${encodeURIComponent(nextMonth)}&owner=${encodeURIComponent(bookingAvailabilityOwner)}`
      );
      setAvailability(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Availability could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability(month);
  }, [month, session]);

  async function toggleSlot(date: string, time: string) {
    const key = slotKey(date, time);
    const selected = selectedKeys.has(key);
    const busy = busyKeys.has(key);

    if (date < today || (busy && !selected)) return;

    setSavingKey(key);
    setMessage(null);

    try {
      await crmFetch(
        session,
        "/api/crm/availability",
        {
          method: selected ? "DELETE" : "POST",
          body: JSON.stringify({
            owner: bookingAvailabilityOwner,
            date,
            time
          })
        }
      );
      await loadAvailability(month);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Availability could not be saved.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="crm-ledger crm-availability-ledger">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Jessica Availability</p>
          <h2>{formatMonthTitle(month)}</h2>
        </div>
        <div className="crm-calendar-controls">
          <button type="button" className="crm-ghost-button" onClick={() => setMonth((value) => shiftMonth(value, -1))}>
            Previous
          </button>
          <button type="button" className="crm-ghost-button" onClick={() => setMonth(currentMonthKey())}>
            Today
          </button>
          <button type="button" className="crm-ghost-button" onClick={() => setMonth((value) => shiftMonth(value, 1))}>
            Next
          </button>
          <button type="button" className="crm-ghost-button" onClick={() => loadAvailability(month)}>
            Refresh
          </button>
        </div>
      </div>

      <div className="crm-availability-summary" aria-label="Jessica availability summary">
        <span>
          <strong>{availableCount}</strong>
          Published
        </span>
        <span>
          <strong>{bookedCount}</strong>
          Booked / Busy
        </span>
        <span>
          <strong>{bookingSlotTimes.length}</strong>
          Two-hour slots per day
        </span>
        <span>
          <strong>8 AM-6 PM</strong>
          Homepage window
        </span>
      </div>

      {message ? <p className="crm-alert">{message}</p> : null}
      {loading ? <p className="crm-empty">Loading availability.</p> : null}

      <div className="crm-availability-board" aria-label="Jessica availability month">
        <div className="crm-calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="crm-availability-grid">
          {Array.from({ length: startOffset(month) }, (_item, index) => (
            <span className="crm-availability-day empty" key={`empty-${index}`} />
          ))}
          {days.map((day) => (
            <article className={`crm-availability-day ${day.today ? "today" : ""}`} key={day.dateKey}>
              <header>
                <span>{day.day}</span>
              </header>
              <div className="crm-availability-slots">
                {bookingSlotTimes.map((time) => {
                  const key = slotKey(day.dateKey, time);
                  const selected = selectedKeys.has(key);
                  const busy = busyKeys.has(key);
                  const past = day.dateKey < today;
                  const saving = savingKey === key;
                  const status = past ? "Past" : busy ? "Booked" : selected ? "Available" : "Closed";

                  return (
                    <button
                      type="button"
                      key={time}
                      className={[
                        "crm-availability-slot",
                        selected ? "available" : "",
                        busy ? "busy" : "",
                        past ? "past" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={past || saving || (busy && !selected)}
                      onClick={() => toggleSlot(day.dateKey, time)}
                    >
                      <span>{formatSlotLabel(time)}</span>
                      <strong>{saving ? "Saving" : status}</strong>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

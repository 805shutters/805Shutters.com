"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { CrmAvailabilitySlot } from "@/lib/crm/types";
import {
  losAngelesDateString,
  losAngelesTimeString,
  zonedTimeToUtc,
} from "@/lib/booking/availability";
import { AddressAutocomplete } from "@/components/address/AddressAutocomplete";
import styles from "./JessicaWorkingRanges.module.css";

type Range = { date: string; start: string; end: string };
type Preview = {
  revision: string;
  days: Array<{
    date: string;
    slots: Array<{
      time: string;
      label: string;
      available: boolean;
      reason: string | null;
    }>;
  }>;
};
const reasons: Record<string, string> = {
  closed_hours: "Outside published hours",
  past: "Past date",
  notice: "Four-hour notice",
  daily_limit: "Daily limit reached",
  appointment_conflict: "Appointment or busy block",
  missing_information: "Address, calendar, or route needs attention",
  driving_time: "Driving time + 15 minutes does not fit",
};
export function editableWorkingRanges(slots: CrmAvailabilitySlot[]): Range[] {
  const merged: Array<{ start: number; end: number }> = [];
  for (const slot of slots
    .filter((s) => s.status !== "canceled")
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))) {
    const start = Date.parse(slot.start_at),
      end = Date.parse(slot.end_at),
      previous = merged.at(-1);
    if (
      previous &&
      start <= previous.end &&
      losAngelesDateString(new Date(start)) ===
        losAngelesDateString(new Date(previous.start))
    )
      previous.end = Math.max(previous.end, end);
    else merged.push({ start, end });
  }
  return merged.map((r) => ({
    date: losAngelesDateString(new Date(r.start)),
    start: losAngelesTimeString(new Date(r.start)),
    end: losAngelesTimeString(new Date(r.end)),
  }));
}
export function JessicaWorkingRanges({ session }: { session: Session }) {
  const [month, setMonth] = useState(() => losAngelesDateString().slice(0, 7));
  const [ranges, setRanges] = useState<Range[]>([]),
    [revision, setRevision] = useState("");
  const [draft, setDraft] = useState(false),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(""),
    [address, setAddress] = useState(""),
    [count, setCount] = useState("5"),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewLoading, setPreviewLoading] = useState(false);
  const generation = useRef(0);
  const [reload, setReload] = useState(0);
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message || "Calendar could not be loaded.");
      return body;
    },
    [session.access_token],
  );
  useEffect(() => {
    let current = true;
    setLoading(true);
    setMessage("");
    setPreview(null);
    generation.current++;
    setPreviewLoading(false);
    request(`/api/crm/availability?month=${month}`)
      .then((body) => {
        if (!current) return;
        setRanges(editableWorkingRanges(body.ranges));
        setRevision(body.revision);
        setDraft(
          body.ranges.some((s: CrmAvailabilitySlot) => s.status === "draft"),
        );
        setDirty(false);
      })
      .catch((e) => {
        if (current) {
          setMessage(e.message);
          setRevision("");
          setRanges([]);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [month, request, reload]);
  async function save() {
    setSaving(true);
    setMessage("");
    generation.current++;
    setPreviewLoading(false);
    setPreview(null);
    try {
      if (
        ranges.some(
          (r) =>
            !r.date.startsWith(month) || !r.start || !r.end || r.end <= r.start,
        )
      )
        throw new Error(
          "Each range must end after it starts, on a day in this month.",
        );
      const body = await request("/api/crm/availability", {
        method: "PUT",
        body: JSON.stringify({
          month,
          revision,
          ranges: ranges.map((r) => ({
            start_at: zonedTimeToUtc(r.date, r.start).toISOString(),
            end_at: zonedTimeToUtc(r.date, r.end).toISOString(),
          })),
        }),
      });
      setRevision(body.revision);
      setDraft(false);
      setDirty(false);
      setMessage(
        ranges.length
          ? "Jessica's working ranges are published. Customer availability also checks appointments and driving time."
          : "This month is closed to new public bookings. Existing appointments remain scheduled.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Publication failed. Reload and try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  const previewInFlight = useRef(false);
  const showPreview = useCallback(async () => {
    const version = ++generation.current;
    previewInFlight.current = true;
    setPreviewLoading(true);
    setMessage("");
    try {
      const q = new URLSearchParams({
        month,
        address,
        windowCount: count,
        preview: "true",
      });
      const body = await request(`/api/crm/availability?${q}`);
      if (generation.current === version) setPreview(body);
    } catch (e) {
      if (generation.current === version) {
        setPreview(null);
        setMessage(e instanceof Error ? e.message : "Preview unavailable.");
      }
    } finally {
      if (generation.current === version) setPreviewLoading(false);
      previewInFlight.current = false;
    }
  }, [month, address, count, request]);
  useEffect(() => {
    if (!preview || dirty || draft) return;
    const refresh = () => {
      if (!previewInFlight.current) void showPreview();
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [Boolean(preview), dirty, draft, showPreview]);
  function edit(next: Range[]) {
    setRanges(next);
    setDirty(true);
    setPreview(null);
    generation.current++;
    setPreviewLoading(false);
  }
  return (
    <section className={styles.workspace} aria-label="Jessica's working ranges">
      <header>
        <p className={styles.eyebrow}>Customer consultation availability</p>
        <h2>Jessica’s working hours</h2>
        <p>
          Publish the ranges when customer visits can take place. Each visit
          must fit completely, with Google driving time plus 15 minutes between
          appointments.
        </p>
      </header>
      <div className={styles.toolbar}>
        <label>
          Month
          <input
            type="month"
            value={month}
            disabled={saving || dirty}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <span>America/Los_Angeles · Jessica only</span>
      </div>
      {draft && (
        <p className={styles.notice}>
          Previous open-time buttons have been converted to drafts. Review these
          ranges and publish them before customers can book.
        </p>
      )}
      {dirty && (
        <p className={styles.notice}>
          Unsaved changes. The customer site continues to use the last published
          ranges.
        </p>
      )}
      {message && (
        <p role="status" className={styles.notice}>
          {message}
        </p>
      )}
      {loading ? (
        <p>Loading working ranges…</p>
      ) : (
        <>
          {!ranges.length && (
            <p className={styles.empty}>
              No working ranges. This month is closed unless you add and publish
              hours.
            </p>
          )}
          <div className={styles.ranges}>
            {ranges.map((range, index) => (
              <div className={styles.range} key={index}>
                <label>
                  Day
                  <input
                    type="date"
                    aria-label={`Day ${index + 1}`}
                    value={range.date}
                    disabled={saving}
                    onChange={(e) =>
                      edit(
                        ranges.map((r, i) =>
                          i === index ? { ...r, date: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Start
                  <input
                    type="time"
                    step="1800"
                    aria-label={`Start ${index + 1}`}
                    value={range.start}
                    disabled={saving}
                    onChange={(e) =>
                      edit(
                        ranges.map((r, i) =>
                          i === index ? { ...r, start: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  End
                  <input
                    type="time"
                    step="1800"
                    aria-label={`End ${index + 1}`}
                    value={range.end}
                    disabled={saving}
                    onChange={(e) =>
                      edit(
                        ranges.map((r, i) =>
                          i === index ? { ...r, end: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => edit(ranges.filter((_, i) => i !== index))}
                >
                  Remove range
                </button>
              </div>
            ))}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={saving || !revision}
              onClick={() =>
                edit([
                  ...ranges,
                  { date: `${month}-01`, start: "09:00", end: "17:00" },
                ])
              }
            >
              Add working range
            </button>
            <button
              className={styles.primary}
              type="button"
              disabled={saving || !revision || (!dirty && !draft)}
              onClick={save}
            >
              {saving ? "Publishing…" : "Publish working ranges"}
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  setDirty(false);
                  setReload((n) => n + 1);
                }}
              >
                Discard edits and reload
              </button>
            )}
          </div>
        </>
      )}
      <section
        className={styles.preview}
        aria-label="Customer availability preview"
      >
        <h3>See what a customer can book</h3>
        <p>
          This preview uses the same published calendar, address, visit length,
          and driving checks as every public consultation button.
        </p>
        <label>
          Customer service address
          <AddressAutocomplete
            aria-label="Customer service address"
            value={address}
            onChange={(value) => {
              setAddress(value.target.value);
              setPreview(null);
              generation.current++;
              setPreviewLoading(false);
            }}
            onResolved={(value) => {
              setAddress(value.fullAddress);
              setPreview(null);
              generation.current++;
              setPreviewLoading(false);
            }}
          />
        </label>
        <label>
          Windows
          <select
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              setPreview(null);
              generation.current++;
              setPreviewLoading(false);
            }}
          >
            <option value="5">1–5 · 1 hour</option>
            <option value="20">6–20 · 2 hours</option>
            <option value="21">21+ · 3 hours</option>
          </select>
        </label>
        <button
          type="button"
          disabled={
            !address.trim() || loading || previewLoading || dirty || draft
          }
          onClick={showPreview}
        >
          {previewLoading
            ? "Checking road travel…"
            : "Check customer availability"}
        </button>
        {preview && (
          <div className={styles.results}>
            {preview.days
              .filter((d) => d.date >= losAngelesDateString())
              .map((day) => (
                <details key={day.date}>
                  <summary>
                    {day.date} · {day.slots.filter((s) => s.available).length}{" "}
                    available starts
                  </summary>
                  <ul>
                    {day.slots.map((slot) => (
                      <li key={slot.time}>
                        <strong>{slot.label}</strong>
                        <span>
                          {slot.available
                            ? "Available"
                            : reasons[slot.reason || ""] || "Unavailable"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </div>
        )}
      </section>
    </section>
  );
}

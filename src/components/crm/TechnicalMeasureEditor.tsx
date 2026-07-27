"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, FileSignature, FileText, Loader2, Mail, MapPin, MessageSquare, Phone, Plus, Ruler, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { losAngelesDateString, zonedTimeToUtc } from "@/lib/booking/availability";
import type { SignatureStroke, TechnicalMeasureForm, TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";
import { MeasurementGridModal } from "@mts/components/crm/quote-builder/MeasurementGridModal";
import {
  FRACTIONS,
  ONYX_COLORS,
  ONYX_HINGE_COLORS,
  ONYX_PANEL_CONFIGS,
  ONYX_POLY_FRAME_TYPES,
  ONYX_SIZE_TYPES,
  ONYX_STANDARD_MATERIALS,
  ONYX_TILT_TYPES,
  ONYX_WOOD_FRAME_TYPES,
  NORMAN_WOODLORE_FRAME_TYPES,
  PRODUCT_TYPES,
  ROOM_PRESETS,
  SHUTTER_HINGE_COLORS,
  SHUTTER_LOUVER_SIZES,
  SHUTTER_MATERIALS,
  SHUTTER_PANEL_CONFIGS,
  SHUTTER_TILT_TYPES,
} from "@mts/lib/quoteConstants";
import type { MeasurementStep } from "@mts/stores/quoteBuilderStore";
import { PortalContainerContext } from "@mts/lib/portal-container";
import { NormanRollerMeasureFields, NORMAN_ROLLER_MEASURE_DETAIL_KEYS } from "@/components/crm/NormanRollerMeasureFields";

type EditableLine = TechnicalMeasureForm["lines"][number] & { current_values: TechnicalMeasureLineValues };
type FutureMeasureDraft = { room: string; width_in: number | null; height_in: number | null; notes: string };
type ScheduleDraft = { formId: string; customerName: string; date: string; time: string; durationMinutes: number; scheduled: boolean };

const scheduleTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function measureScheduleLabel(scheduling: Record<string, unknown> | null) {
  const startAt = typeof scheduling?.scheduled_start_at === "string" ? scheduling.scheduled_start_at : "";
  const endAt = typeof scheduling?.scheduled_end_at === "string" ? scheduling.scheduled_end_at : "";
  if (!startAt || !endAt) return "Scheduled measure";
  return `${scheduleTimeFormatter.format(new Date(startAt))} – ${scheduleTimeFormatter.format(new Date(endAt))}`;
}

const PRODUCT_IDS: Record<(typeof PRODUCT_TYPES)[number], string> = {
  "Shutters": "norman_shutters",
  "Roller Shades": "roller",
  "Roman Shades": "roman",
  "Honeycomb Shades": "honeycomb",
  "Sheer Shades": "perfectsheer",
  "Mini Blinds": "mini_blinds",
  "Faux Wood Blinds": "faux_wood",
  "Wood Blinds": "wood_blinds",
  "Vertical Blinds": "synchrony_vertical",
  "Smart Drapes": "smartdrape",
  "Drapery Tracks": "drapery_tracks",
  "Tension Shades": "tension_shades",
  "Retractable Screens": "retractable_screens",
  "Awnings": "awnings",
  "Vinyl Blinds": "vinyl_blinds",
};

const SHUTTER_MEASURE_PRIORITY_KEYS = [
  "folding_direction",
  "panel_config",
  "panel_configuration",
  "measurement_basis",
  "measurement_type",
  "measure_type",
  "size_type",
  "split_tilt",
  "split_tilt_location",
  "split_tilt_height",
  "divider_rail",
  "divider_rail_location",
  "divider_rail_height",
] as const;
const SHADE_MEASURE_PRIORITY_KEYS = ["mount_type", "control_side"] as const;
const HEADER_DETAIL_KEYS = new Set(["supplier", "manufacturer"]);

function isShutterProduct(productId: string) {
  return productId.toLowerCase().includes("shutter");
}

function detailText(details: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = details[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function isOnyxShutter(productId: string, details: Record<string, unknown>) {
  return productId.toLowerCase().includes("onyx") || detailText(details, "supplier", "manufacturer").toLowerCase().includes("onyx");
}

function shutterMeasurementBasis(details: Record<string, unknown>) {
  const candidates = [
    details.measurement_basis,
    details.measurement_type,
    details.measure_type,
    details.size_type,
  ].map((value) => String(value || "").toLowerCase().replaceAll("-", "_").replaceAll(" ", "_"));
  if (candidates.some((value) => value.includes("window_size"))) return "window_size";
  if (candidates.some((value) => value.includes("frame_to_frame"))) return "frame_to_frame";
  if (details.frame_type || details.frame_style || details.frame_sides) return "window_size";
  return "frame_to_frame";
}

function shutterMeasurementBasisOptions(onyx: boolean) {
  return onyx
    ? [
        { value: "window_size", label: ONYX_SIZE_TYPES[0] },
        { value: "frame_to_frame", label: ONYX_SIZE_TYPES[1] },
      ]
    : [
        { value: "window_size", label: "Window Size" },
        { value: "frame_to_frame", label: "Frame-to-Frame Size" },
      ];
}

function shutterDetailOptions(key: string, onyx: boolean): readonly string[] | null {
  if (["panel_config", "panel_configuration", "folding_direction"].includes(key)) {
    return onyx
      ? ONYX_PANEL_CONFIGS.filter((option) => ["L", "R", "LR", "LL", "RR", "LLRR"].includes(option))
      : SHUTTER_PANEL_CONFIGS;
  }
  if (["tilt_type", "tilt", "tilt_rod"].includes(key)) return onyx ? ONYX_TILT_TYPES : SHUTTER_TILT_TYPES;
  if (["louver_size", "louver_size_inches"].includes(key)) return SHUTTER_LOUVER_SIZES;
  if (key === "color") return ONYX_COLORS;
  if (key === "hinge_color") return onyx ? ONYX_HINGE_COLORS : SHUTTER_HINGE_COLORS;
  if (["frame_type", "frame_style"].includes(key)) return onyx ? [...ONYX_POLY_FRAME_TYPES, ...ONYX_WOOD_FRAME_TYPES] : NORMAN_WOODLORE_FRAME_TYPES;
  if (["mount_type", "onyx_mount"].includes(key)) return onyx ? ["IM", "OM"] : ["Inside Mount", "Outside Mount"];
  if (key === "astragal") return ["Yes", "No"];
  if (key === "t_post") return ["None", "T1", "T2", "Custom"];
  return null;
}

function productLabel(productId: string) {
  return Object.entries(PRODUCT_IDS).find(([, id]) => id === productId)?.[0] || fieldName(productId);
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "CRM request failed.");
  return body as T;
}

function wholeFraction(value: number | null) {
  const total = Math.round(Number(value || 0) * 16);
  return { whole: Math.floor(total / 16), fraction: FRACTIONS[total % 16] || "0" };
}

function decimal(whole: number, fraction: string) {
  const index = FRACTIONS.indexOf(fraction as (typeof FRACTIONS)[number]);
  return whole + Math.max(0, index) / 16;
}

function inches(value: number | null) {
  if (!value) return "Select";
  const parsed = wholeFraction(value);
  return `${parsed.whole}${parsed.fraction === "0" ? "" : ` ${parsed.fraction}`}\"`;
}

function changed(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function fieldName(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function orderPreparation(form: TechnicalMeasureForm | null) {
  const value = form?.meta.vendor_order_preparation;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as { status?: string; message?: string; issueCount?: number; taskId?: string | null; portalDraftId?: string | null }
    : null;
}

function SignaturePad({ value, onChange }: { value: SignatureStroke[]; onChange: (value: SignatureStroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<SignatureStroke | null>(null);

  function draw(strokes: SignatureStroke[]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * scale || canvas.height !== height * scale) {
      canvas.width = width * scale;
      canvas.height = height * scale;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#101010";
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.length < 2) continue;
      context.beginPath();
      context.moveTo(stroke[0].x * width, stroke[0].y * height);
      for (const point of stroke.slice(1)) context.lineTo(point.x * width, point.y * height);
      context.stroke();
    }
  }

  useEffect(() => {
    draw(value);
    const onResize = () => draw(value);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  return (
    <div className="technical-measure-signature">
      <canvas
        ref={canvasRef}
        aria-label="Customer signature"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          activeRef.current = [point(event)];
        }}
        onPointerMove={(event) => {
          if (!activeRef.current) return;
          activeRef.current.push(point(event));
          draw([...value, activeRef.current]);
        }}
        onPointerUp={(event) => {
          if (!activeRef.current) return;
          activeRef.current.push(point(event));
          const next = [...value, activeRef.current];
          activeRef.current = null;
          onChange(next);
        }}
      />
      <button type="button" onClick={() => onChange([])} aria-label="Clear signature"><X size={16} /> Clear</button>
    </div>
  );
}

export function TechnicalMeasureEditor({ formId }: { formId: string }) {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [form, setForm] = useState<TechnicalMeasureForm | null>(null);
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [measurePicker, setMeasurePicker] = useState<{ lineId: string; step: MeasurementStep } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<SignatureStroke[]>([]);
  const [scopeElement, setScopeElement] = useState<HTMLElement | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(0);
  const [measureStarted, setMeasureStarted] = useState(false);
  const [choiceField, setChoiceField] = useState<{ lineId: string; field: "room" } | null>(null);
  const [detailChoice, setDetailChoice] = useState<{ lineId: string; key: string } | null>(null);
  const [locationPicker, setLocationPicker] = useState<{
    lineId: string;
    label: string;
    valueKey: "split_tilt_height" | "divider_rail_height";
    step: "width_whole" | "width_fraction";
  } | null>(null);
  const [futureMeasureOpen, setFutureMeasureOpen] = useState(false);
  const [futureMeasure, setFutureMeasure] = useState<FutureMeasureDraft>({ room: "Future Window", width_in: null, height_in: null, notes: "" });
  const [futurePicker, setFuturePicker] = useState<MeasurementStep | null>(null);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setAuthLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  async function load(activeSession = session) {
    if (!activeSession) return;
    setLoading(true);
    try {
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(activeSession, `/api/crm/technical-measures/${formId}`);
      setForm(result.form);
      setLines(result.form.lines);
      setActiveLineIndex((current) => Math.min(current, Math.max(result.form.lines.length - 1, 0)));
      setSignerName(result.form.customer_snapshot.name || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Technical measure could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session?.access_token, formId]);

  function updateLine(lineId: string, patch: Partial<TechnicalMeasureLineValues>) {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, current_values: { ...line.current_values, ...patch } } : line));
  }

  function updateDetail(lineId: string, key: string, value: string | boolean) {
    setLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      current_values: { ...line.current_values, details: { ...line.current_values.details, [key]: value } },
    } : line));
  }

  async function saveDraft() {
    if (!session) throw new Error("CRM session is unavailable.");
    const result = await crmFetch<{ form: TechnicalMeasureForm }>(session, `/api/crm/technical-measures/${formId}`, {
      method: "PATCH",
      body: JSON.stringify({ lines: lines.map((line) => ({ id: line.id, currentValues: line.current_values })) }),
    });
    setForm(result.form);
    setLines(result.form.lines);
    return result.form;
  }

  async function handleSave() {
    setBusy(true); setMessage(null);
    try { const saved = await saveDraft(); setMessage(saved.requiresAddendum ? "Draft saved. Customer signature is required for the highlighted contract changes." : "Technical measure draft saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Technical measure could not be saved."); }
    finally { setBusy(false); }
  }

  async function handleSubmit() {
    if (!session) return;
    setBusy(true); setMessage(null);
    try {
      const saved = await saveDraft();
      if (saved.requiresAddendum) {
        setMessage("Review the changes with the customer and collect their signature below.");
        setMeasureStarted(false);
        window.setTimeout(() => document.getElementById("technical-measure-addendum")?.scrollIntoView({ behavior: "smooth" }), 0);
        return;
      }
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(session, `/api/crm/technical-measures/${formId}/submit`, { method: "POST", body: "{}" });
      setForm(result.form); setLines(result.form.lines);
      setMessage("Measure submitted");
      setSubmitSuccess(true);
      window.setTimeout(() => window.location.assign("/crm/mobile"), 1300);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Technical measure could not be submitted."); }
    finally { setBusy(false); }
  }

  async function handleSign() {
    if (!session) return;
    setBusy(true); setMessage(null);
    try {
      await saveDraft();
      const result = await crmFetch<{ form: TechnicalMeasureForm; email: { sent: boolean; error?: string; skipped?: string } }>(session, `/api/crm/technical-measures/${formId}/sign`, {
        method: "POST",
        body: JSON.stringify({ acknowledged, signerName, signatureStrokes: signature }),
      });
      setForm(result.form); setLines(result.form.lines);
      setMessage(result.email.sent ? "Change order signed, emailed to the customer, and saved to Customer Files." : `Change order signed and saved. Email needs retry: ${result.email.error || result.email.skipped || "delivery unavailable"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The change order could not be signed."); }
    finally { setBusy(false); }
  }

  async function retryEmail() {
    if (!session) return;
    setBusy(true); setMessage(null);
    try {
      const result = await crmFetch<{ email: { sent: boolean; error?: string; skipped?: string } }>(session, `/api/crm/technical-measures/${formId}/email`, { method: "POST", body: "{}" });
      await load(session);
      setMessage(result.email.sent ? "Signed change order emailed to the customer." : `Email still unavailable: ${result.email.error || result.email.skipped}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Email could not be retried."); }
    finally { setBusy(false); }
  }

  async function handleFutureMeasure() {
    if (!session || !futureMeasure.width_in || !futureMeasure.height_in) {
      setMessage("Select both width and height for the future window.");
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(
        session,
        `/api/crm/technical-measures/${formId}/future-measures`,
        { method: "POST", body: JSON.stringify(futureMeasure) },
      );
      setForm(result.form);
      setFutureMeasure({ room: "Future Window", width_in: null, height_in: null, notes: "" });
      setFutureMeasureOpen(false);
      setMessage("Future measure saved to the customer file.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The future measure could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function openAddendumPdf() {
    if (!session) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/crm/technical-measures/${formId}/addendum.pdf`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("Signed change order PDF could not be opened.");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Signed change order PDF could not be opened."); }
    finally { setBusy(false); }
  }

  const activePickerLine = lines.find((line) => line.id === measurePicker?.lineId) || null;
  const pendingWidth = activePickerLine ? wholeFraction(activePickerLine.current_values.width_in) : null;
  const pendingHeight = activePickerLine ? wholeFraction(activePickerLine.current_values.height_in) : null;
  const readOnly = form?.status === "submitted";
  const vendorOrderPreparation = orderPreparation(form);
  const activeLineNumber = Math.min(activeLineIndex + 1, Math.max(lines.length, 1));
  const futureMeasures = form?.futureMeasures || [];

  function showLine(index: number) {
    setActiveLineIndex(Math.min(Math.max(index, 0), Math.max(lines.length - 1, 0)));
    document.getElementById("technical-measure-progress")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (authLoading || loading) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><Loader2 className="spin" /><p>Loading technical measure...</p></main>;
  if (!session) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical Measure</h1><p>Sign in with an approved CRM account.</p><a className="technical-measure-primary" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent(`/crm/technical-measures/${formId}`)}`}>Continue with Google</a></main>;
  if (!form) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical measure unavailable</h1>{message ? <p>{message}</p> : null}<a href="/crm/technical-measures">Return to measures</a></main>;

  return (
    <PortalContainerContext.Provider value={scopeElement}>
    <main ref={setScopeElement} className={`mts-quote-scope technical-measure-shell${measureStarted ? " technical-measure-shell--active" : ""}`}>
      {!measureStarted ? <>
      <header className="technical-measure-header">
        <a href="/crm/technical-measures" aria-label="Back to technical measures"><ArrowLeft /></a>
        <div><span>{form.quote_snapshot.quoteNumber || "Sold contract"}</span><h1>Technical Measure</h1><p>{form.customer_snapshot.name}</p></div>
        <strong data-status={form.status}>{form.status.replaceAll("_", " ")}</strong>
      </header>

      <nav className="technical-measure-workspaces" aria-label="Mobile CRM workspaces">
        <a href="/crm/mobile"><CalendarDays />Appointments</a>
        <a className="active" href="/crm/technical-measures" aria-current="page"><Ruler />Measures</a>
        <a href="/crm/mobile/quotes"><FileText />Quotes</a>
      </nav>

      {message ? <div className="technical-measure-alert" role="status">{message}</div> : null}
      {vendorOrderPreparation ? (
        <section className="technical-measure-order-status" data-status={vendorOrderPreparation.status}>
          <div><span>Norman Roller order preparation</span><strong>{String(vendorOrderPreparation.status || "needs_input").replaceAll("_", " ")}</strong></div>
          <p>{vendorOrderPreparation.message}</p>
          {vendorOrderPreparation.issueCount ? <small>{vendorOrderPreparation.issueCount} item{vendorOrderPreparation.issueCount === 1 ? "" : "s"} must be corrected before Norman portal entry.</small> : null}
          {vendorOrderPreparation.portalDraftId ? <small>Norman draft: {vendorOrderPreparation.portalDraftId}</small> : null}
          <b>Review-only: the automation cannot place or submit the order.</b>
        </section>
      ) : null}

      <section className="technical-measure-customer">
        <div><span>Customer</span><strong>{form.customer_snapshot.name}</strong></div>
        <div><span>Phone</span><strong>{form.customer_snapshot.phone || "Not provided"}</strong></div>
        <div><span>Email</span><strong>{form.customer_snapshot.email || "Not provided"}</strong></div>
        <div><span>Project</span><strong>{[form.customer_snapshot.address, form.customer_snapshot.city].filter(Boolean).join(", ") || "Not provided"}</strong></div>
      </section>

      <section className="technical-measure-progress" id="technical-measure-progress">
        <div>
          <span>Measure progress</span>
          <strong>Line {activeLineNumber} of {lines.length}</strong>
        </div>
        <div className="technical-measure-progress-track" aria-hidden="true">
          <span style={{ width: `${lines.length ? (activeLineNumber / lines.length) * 100 : 0}%` }} />
        </div>
      </section>
      <button className="technical-measure-launch" type="button" onClick={() => setMeasureStarted(true)}>
        <Ruler /> Start Measure <ChevronRight />
      </button>
      </> : null}

      {measureStarted ? <section className="technical-measure-lines technical-measure-workspace">
        {lines.map((line, index) => {
          const baseline = line.baseline;
          const current = line.current_values;
          const isExpandedWindow = (line.source_quantity || 1) > 1;
          const normanRoller = current.product_id === "roller" && String(current.details.supplier || "Norman").toLowerCase() === "norman";
          const shutterProduct = isShutterProduct(current.product_id);
          const onyxShutter = shutterProduct && isOnyxShutter(current.product_id, current.details);
          const measurementBasis = shutterMeasurementBasis(current.details);
          const measurementBasisOptions = shutterMeasurementBasisOptions(onyxShutter);
          const panelConfiguration = detailText(current.details, "panel_config", "panel_configuration", "folding_direction");
          const supplier = detailText(current.details, "supplier", "manufacturer");
          const splitTiltLocation = detailText(current.details, "split_tilt_location")
            || (/^(yes|true)$/i.test(detailText(current.details, "split_tilt")) ? "Center" : "None");
          const dividerRailLocation = detailText(current.details, "divider_rail_location")
            || (/^(yes|true)$/i.test(detailText(current.details, "divider_rail")) ? "Center" : "None");
          const priorityDetailKeys: readonly string[] = shutterProduct ? SHUTTER_MEASURE_PRIORITY_KEYS : SHADE_MEASURE_PRIORITY_KEYS;
          const detailKeys = Array.from(new Set([...Object.keys(baseline.details), ...Object.keys(current.details)]))
            .filter((key) => (!normanRoller || !NORMAN_ROLLER_MEASURE_DETAIL_KEYS.has(key)) && !priorityDetailKeys.includes(key) && !HEADER_DETAIL_KEYS.has(key));
          return (
            <article className={`technical-measure-line${index === activeLineIndex ? " technical-measure-line--active" : " technical-measure-line--inactive"}`} key={line.id}>
              <div className="technical-measure-line-head">
                <div>
                  <span>Line {index + 1} of {lines.length}{isExpandedWindow ? ` · Window ${line.source_quantity_index} of ${line.source_quantity}` : ""}</span>
                  <div className="technical-measure-line-meta"><strong>{money(line.current_unit_price)} each</strong><b>{productLabel(current.product_id)}{supplier ? ` (${supplier})` : ""}</b></div>
                </div>
                <button type="button" aria-label="Return to customer summary" onClick={() => setMeasureStarted(false)}><X /></button>
              </div>
              <div className="technical-measure-opening-row technical-measure-opening-row--priority">
                  <div className={`technical-measure-choice-field ${changed(baseline.room, current.room) ? "changed" : ""}`}>
                    <span>Room</span>
                    <button type="button" disabled={readOnly} onClick={() => setChoiceField(choiceField?.lineId === line.id && choiceField.field === "room" ? null : { lineId: line.id, field: "room" })}>{current.room || "Select room"}<ChevronRight /></button>
                    {choiceField?.lineId === line.id && choiceField.field === "room" ? (
                      <div className="technical-measure-choice-grid">
                        {ROOM_PRESETS.map((room) => <button type="button" aria-pressed={current.room === room} key={room} onClick={() => { updateLine(line.id, { room }); setChoiceField(null); }}>{room}</button>)}
                      </div>
                    ) : null}
                  </div>
                  <label className={changed(baseline.opening_label, current.opening_label) ? "changed" : ""}>
                    <span>Opening</span>
                    <input
                      aria-label="Opening identifier"
                      disabled={readOnly}
                      maxLength={24}
                      placeholder="A, B, 1, 2…"
                      value={current.opening_label}
                      onChange={(event) => updateLine(line.id, { opening_label: event.target.value })}
                    />
                  </label>
              </div>
              <div className={`technical-measure-dimensions${shutterProduct ? " technical-measure-dimensions--with-basis" : ""}`}>
                <button type="button" aria-label="Select width" disabled={readOnly} className={changed(baseline.width_in, current.width_in) ? "changed" : ""} onClick={() => setMeasurePicker({ lineId: line.id, step: "width_whole" })}><span aria-hidden="true">W</span><strong>{inches(current.width_in)}</strong></button>
                {shutterProduct ? <div className="technical-measure-dimension-basis" aria-label={onyxShutter ? "W/F" : "Measurement type"}>
                  <button type="button" disabled={readOnly} aria-label="Window size" aria-pressed={measurementBasis === "window_size"} onClick={() => updateDetail(line.id, onyxShutter ? "size_type" : "measurement_basis", measurementBasisOptions[0].label)}>WS</button>
                  <button type="button" disabled={readOnly} aria-label="Frame to frame" aria-pressed={measurementBasis === "frame_to_frame"} onClick={() => updateDetail(line.id, onyxShutter ? "size_type" : "measurement_basis", measurementBasisOptions[1].label)}>F2F</button>
                </div> : null}
                <button type="button" aria-label="Select height" disabled={readOnly} className={changed(baseline.height_in, current.height_in) ? "changed" : ""} onClick={() => setMeasurePicker({ lineId: line.id, step: "height_whole" })}><span aria-hidden="true">H</span><strong>{inches(current.height_in)}</strong></button>
              </div>
              {shutterProduct ? <div className="technical-measure-priority-grid">
                <div className="technical-measure-quick-field technical-measure-quick-field--wide technical-measure-folding">
                  <span>Folding direction</span>
                  <button className="technical-measure-current-choice" type="button" disabled={readOnly} aria-expanded={detailChoice?.lineId === line.id && detailChoice.key === "__panel_config"} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__panel_config" ? null : { lineId: line.id, key: "__panel_config" })}>{panelConfiguration || "Select"}<ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__panel_config" ? <div className="technical-measure-choice-grid technical-measure-folding-options">{shutterDetailOptions("panel_config", onyxShutter)?.map((option) => <button type="button" aria-pressed={panelConfiguration === option} key={option} onClick={() => { updateDetail(line.id, "panel_config", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                </div>
                <div className="technical-measure-quick-field">
                  <span>Split tilt</span>
                  <div className="technical-measure-quick-options">
                    <button type="button" disabled={readOnly} aria-pressed={splitTiltLocation === "None"} onClick={() => { updateDetail(line.id, "split_tilt", "No"); updateDetail(line.id, "split_tilt_location", "None"); }}>None</button>
                    <button type="button" disabled={readOnly} aria-pressed={splitTiltLocation === "Center"} onClick={() => { updateDetail(line.id, "split_tilt", "Yes"); updateDetail(line.id, "split_tilt_location", "Center"); }}>Center</button>
                    <button type="button" disabled={readOnly} aria-pressed={splitTiltLocation === "Custom"} onClick={() => { updateDetail(line.id, "split_tilt", "Yes"); updateDetail(line.id, "split_tilt_location", "Custom"); setLocationPicker({ lineId: line.id, label: "Split Tilt Location", valueKey: "split_tilt_height", step: "width_whole" }); }}>Custom{current.details.split_tilt_height ? ` · ${inches(Number(current.details.split_tilt_height))}` : ""}</button>
                  </div>
                </div>
                <div className="technical-measure-quick-field">
                  <span>Divider rail</span>
                  <div className="technical-measure-quick-options">
                    <button type="button" disabled={readOnly} aria-pressed={dividerRailLocation === "None"} onClick={() => { updateDetail(line.id, "divider_rail", "No"); updateDetail(line.id, "divider_rail_location", "None"); }}>None</button>
                    <button type="button" disabled={readOnly} aria-pressed={dividerRailLocation === "Center"} onClick={() => { updateDetail(line.id, "divider_rail", "Yes"); updateDetail(line.id, "divider_rail_location", "Center"); }}>Center</button>
                    <button type="button" disabled={readOnly} aria-pressed={dividerRailLocation === "Custom"} onClick={() => { updateDetail(line.id, "divider_rail", "Yes"); updateDetail(line.id, "divider_rail_location", "Custom"); setLocationPicker({ lineId: line.id, label: "Divider Rail Location", valueKey: "divider_rail_height", step: "width_whole" }); }}>Custom{current.details.divider_rail_height ? ` · ${inches(Number(current.details.divider_rail_height))}` : ""}</button>
                  </div>
                </div>
              </div> : <div className="technical-measure-priority-grid technical-measure-priority-grid--shade">
                <div className="technical-measure-basis"><span>Mount</span><div><button type="button" disabled={readOnly} aria-pressed={current.details.mount_type === "Inside Mount"} onClick={() => updateDetail(line.id, "mount_type", "Inside Mount")}>Inside</button><button type="button" disabled={readOnly} aria-pressed={current.details.mount_type === "Outside Mount"} onClick={() => updateDetail(line.id, "mount_type", "Outside Mount")}>Outside</button></div></div>
                <div className="technical-measure-basis"><span>Control side</span><div><button type="button" disabled={readOnly} aria-pressed={String(current.details.control_side || "").toLowerCase() === "left"} onClick={() => updateDetail(line.id, "control_side", "Left")}>Left</button><button type="button" disabled={readOnly} aria-pressed={String(current.details.control_side || "").toLowerCase() === "right"} onClick={() => updateDetail(line.id, "control_side", "Right")}>Right</button></div></div>
              </div>}
              <div className="technical-measure-secondary">
                <div className="technical-measure-fields">
                <label className={changed(baseline.program_id, current.program_id) ? "changed" : ""}><span>Program / Operating System</span><input disabled={readOnly} value={current.program_id || ""} onChange={(event) => updateLine(line.id, { program_id: event.target.value || null })} /></label>
                {shutterProduct ? <div className={`technical-measure-choice-field ${changed(baseline.fabric, current.fabric) ? "changed" : ""}`}>
                  <span>Material</span>
                  <button type="button" disabled={readOnly} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__material" ? null : { lineId: line.id, key: "__material" })}>{current.fabric || "Select"}<ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__material" ? <div className="technical-measure-choice-grid technical-measure-detail-options">{(onyxShutter ? ONYX_STANDARD_MATERIALS : SHUTTER_MATERIALS).map((option) => <button type="button" aria-pressed={current.fabric === option} key={option} onClick={() => { updateLine(line.id, { fabric: option }); updateDetail(line.id, "material", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                </div> : <label className={changed(baseline.fabric, current.fabric) ? "changed" : ""}><span>Color / Fabric</span><input disabled={readOnly} value={current.fabric || ""} onChange={(event) => updateLine(line.id, { fabric: event.target.value || null })} /></label>}
                {normanRoller ? (
                  <NormanRollerMeasureFields
                    details={current.details}
                    disabled={readOnly}
                    onDetail={(key, value) => updateDetail(line.id, key, value)}
                    onFabric={({ fabric, programId }) => updateLine(line.id, { fabric, program_id: programId })}
                  />
                ) : null}
                {detailKeys.map((key) => {
                  const value = current.details[key];
                  const isBoolean = typeof value === "boolean" || typeof baseline.details[key] === "boolean";
                  const options = shutterProduct ? shutterDetailOptions(key, onyxShutter) : null;
                  if (options?.length) return (
                    <div className={`technical-measure-choice-field ${changed(baseline.details[key], value) ? "changed" : ""}`} key={key}>
                      <span>{fieldName(key)}</span>
                      <button type="button" disabled={readOnly} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === key ? null : { lineId: line.id, key })}>{value == null || value === "" ? "Select" : String(value)}<ChevronRight /></button>
                      {detailChoice?.lineId === line.id && detailChoice.key === key ? <div className="technical-measure-choice-grid technical-measure-detail-options">{options.map((option) => <button type="button" aria-pressed={String(value || "") === option} key={option} onClick={() => { updateDetail(line.id, key, option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                    </div>
                  );
                  return isBoolean ? (
                    <div className={`technical-measure-quick-field ${changed(baseline.details[key], value) ? "changed" : ""}`} key={key}><span>{fieldName(key)}</span><div className="technical-measure-quick-options"><button type="button" disabled={readOnly} aria-pressed={value === true} onClick={() => updateDetail(line.id, key, true)}>Yes</button><button type="button" disabled={readOnly} aria-pressed={value !== true} onClick={() => updateDetail(line.id, key, false)}>No</button></div></div>
                  ) : (
                    <label className={changed(baseline.details[key], value) ? "changed" : ""} key={key}><span>{fieldName(key)}</span><input disabled={readOnly} value={value == null ? "" : String(value)} onChange={(event) => updateDetail(line.id, key, event.target.value)} /></label>
                  );
                })}
                <label className={`technical-measure-notes ${changed(baseline.notes, current.notes) ? "changed" : ""}`}><span>Technician Notes</span><textarea disabled={readOnly} rows={3} value={current.notes} onChange={(event) => updateLine(line.id, { notes: event.target.value })} /></label>
                </div>
              </div>
              <div className="technical-measure-line-navigation">
                <button type="button" disabled={index === 0} onClick={() => showLine(index - 1)}><ChevronLeft />Previous</button>
                <span>{current.width_in && current.height_in ? "Measurements entered" : "Width and height required"}</span>
                <button type="button" disabled={index === lines.length - 1} onClick={() => showLine(index + 1)}>Next<ChevronRight /></button>
              </div>
            </article>
          );
        })}
      </section> : null}
      {measureStarted && message && !submitSuccess ? <div className="technical-measure-alert technical-measure-alert--active" role="alert">{message}</div> : null}

      {!measureStarted && form.requiresAddendum && !readOnly ? (
        <section id="technical-measure-addendum" className="technical-measure-addendum">
          <div className="technical-measure-addendum-head"><FileSignature /><div><span>Customer acknowledgment required</span><h2>Contract Change Order</h2></div></div>
          <div className="technical-measure-change-list">
            {form.contractChanges.map((change, index) => <div key={`${change.lineId}-${change.field}-${index}`}><strong>{change.room} - {change.label}</strong><span>{change.original}</span><b>to</b><span>{change.revised}</span></div>)}
          </div>
          <div className="technical-measure-price-change"><div><span>Original contract</span><strong>{money(form.baseline_total)}</strong></div><div><span>Revised contract</span><strong>{money(form.current_total)}</strong></div><div><span>Difference</span><strong>{money(form.current_total - form.baseline_total)}</strong></div></div>
          <label className="technical-measure-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I acknowledge and approve all changes listed above. This change order updates those details of the original contract.</span></label>
          <label className="technical-measure-signer"><span>Customer printed name</span><input value={signerName} onChange={(event) => setSignerName(event.target.value)} /></label>
          <div><span className="technical-measure-signature-label">Customer signature</span><SignaturePad value={signature} onChange={setSignature} /></div>
          <button className="technical-measure-primary" type="button" disabled={busy || !acknowledged || !signerName.trim() || !signature.length} onClick={handleSign}>{busy ? <Loader2 className="spin" /> : <FileSignature />} Sign and Finalize Change Order</button>
        </section>
      ) : null}

      {form.addendum?.signed_at ? (
        <section className="technical-measure-complete"><Check /><div><strong>Signed change order on file</strong><span>{form.addendum.status === "emailed" ? `Emailed to ${form.addendum.email_recipient}` : "Customer email delivery needs attention"}</span></div><button type="button" onClick={openAddendumPdf} disabled={busy}>View PDF</button>{form.addendum.status === "email_failed" ? <button type="button" onClick={retryEmail} disabled={busy}><Mail /> Retry email</button> : null}</section>
      ) : null}

      {!measureStarted ? <section className="technical-measure-future" id="future-measures">
        <div className="technical-measure-future-head">
          <div><span>Customer file</span><h2>Future Measures</h2><p>Save extra windows for a future quote or phase.</p></div>
          <strong>{futureMeasures.length}</strong>
        </div>
        {futureMeasures.length ? (
          <div className="technical-measure-future-list">
            {futureMeasures.map((entry) => <div key={entry.id}><strong>{entry.room}</strong><span>{inches(entry.width_in)} × {inches(entry.height_in)}</span>{entry.notes ? <small>{entry.notes}</small> : null}</div>)}
          </div>
        ) : null}
        {futureMeasureOpen ? (
          <div className="technical-measure-future-form">
            <div>
              <span>Room</span>
              <div className="technical-measure-choice-grid">
                {ROOM_PRESETS.map((room) => <button type="button" aria-pressed={futureMeasure.room === room} key={room} onClick={() => setFutureMeasure((current) => ({ ...current, room }))}>{room}</button>)}
              </div>
            </div>
            <div className="technical-measure-dimensions technical-measure-future-dimensions">
              <button type="button" aria-label="Select future width" onClick={() => setFuturePicker("width_whole")}><span aria-hidden="true">W</span><strong>{inches(futureMeasure.width_in)}</strong></button>
              <button type="button" aria-label="Select future height" onClick={() => setFuturePicker("height_whole")}><span aria-hidden="true">H</span><strong>{inches(futureMeasure.height_in)}</strong></button>
            </div>
            <label><span>Future-job notes</span><textarea rows={2} value={futureMeasure.notes} onChange={(event) => setFutureMeasure((current) => ({ ...current, notes: event.target.value }))} /></label>
            <div className="technical-measure-future-actions">
              <button type="button" onClick={() => setFutureMeasureOpen(false)}>Cancel</button>
              <button className="technical-measure-primary" type="button" disabled={busy || !futureMeasure.width_in || !futureMeasure.height_in} onClick={handleFutureMeasure}>{busy ? <Loader2 className="spin" /> : <Save />} Save to Customer File</button>
            </div>
          </div>
        ) : <button className="technical-measure-add-future" type="button" onClick={() => setFutureMeasureOpen(true)}><Plus /> Add Future Measure</button>}
      </section> : null}

      {!readOnly && measureStarted ? <footer className="technical-measure-actions"><button type="button" disabled={busy} onClick={handleSave}><Save /> Save Draft</button><button className="technical-measure-primary" type="button" disabled={busy} onClick={handleSubmit}>{busy ? <Loader2 className="spin" /> : <Check />} Complete Measure</button></footer> : null}

      {measurePicker && activePickerLine ? (
        <MeasurementGridModal
          open
          showDirectEntry={false}
          onClose={() => setMeasurePicker(null)}
          step={measurePicker.step}
          pendingWidth={pendingWidth}
          pendingHeight={pendingHeight}
          onWidthWhole={(whole) => { updateLine(activePickerLine.id, { width_in: decimal(whole, "0") }); setMeasurePicker({ ...measurePicker, step: "width_fraction" }); }}
          onWidthFraction={(fraction) => { updateLine(activePickerLine.id, { width_in: decimal(wholeFraction(activePickerLine.current_values.width_in).whole, fraction) }); setMeasurePicker({ ...measurePicker, step: "height_whole" }); }}
          onHeightWhole={(whole) => { updateLine(activePickerLine.id, { height_in: decimal(whole, "0") }); setMeasurePicker({ ...measurePicker, step: "height_fraction" }); }}
          onHeightFraction={(fraction) => { updateLine(activePickerLine.id, { height_in: decimal(wholeFraction(activePickerLine.current_values.height_in).whole, fraction) }); setMeasurePicker(null); }}
          onDirectMeasurements={(width, height) => { updateLine(activePickerLine.id, { width_in: decimal(width.whole, width.fraction), height_in: decimal(height.whole, height.fraction) }); setMeasurePicker(null); }}
        />
      ) : null}
      {futurePicker ? (
        <MeasurementGridModal
          open
          showDirectEntry={false}
          onClose={() => setFuturePicker(null)}
          step={futurePicker}
          pendingWidth={futureMeasure.width_in ? wholeFraction(futureMeasure.width_in) : null}
          pendingHeight={futureMeasure.height_in ? wholeFraction(futureMeasure.height_in) : null}
          onWidthWhole={(whole) => { setFutureMeasure((current) => ({ ...current, width_in: decimal(whole, "0") })); setFuturePicker("width_fraction"); }}
          onWidthFraction={(fraction) => { setFutureMeasure((current) => ({ ...current, width_in: decimal(wholeFraction(current.width_in).whole, fraction) })); setFuturePicker("height_whole"); }}
          onHeightWhole={(whole) => { setFutureMeasure((current) => ({ ...current, height_in: decimal(whole, "0") })); setFuturePicker("height_fraction"); }}
          onHeightFraction={(fraction) => { setFutureMeasure((current) => ({ ...current, height_in: decimal(wholeFraction(current.height_in).whole, fraction) })); setFuturePicker(null); }}
          onDirectMeasurements={(width, height) => { setFutureMeasure((current) => ({ ...current, width_in: decimal(width.whole, width.fraction), height_in: decimal(height.whole, height.fraction) })); setFuturePicker(null); }}
        />
      ) : null}
      {locationPicker ? (() => {
        const pickerLine = lines.find((line) => line.id === locationPicker.lineId);
        const pickerValue = pickerLine ? Number(pickerLine.current_values.details[locationPicker.valueKey] || 0) : 0;
        return pickerLine ? <MeasurementGridModal
          open
          showDirectEntry={false}
          singleDimensionLabel={locationPicker.label}
          wholeStart={1}
          onClose={() => setLocationPicker(null)}
          step={locationPicker.step}
          pendingWidth={pickerValue ? wholeFraction(pickerValue) : null}
          pendingHeight={null}
          onWidthWhole={(whole) => { updateDetail(pickerLine.id, locationPicker.valueKey, String(decimal(whole, "0"))); setLocationPicker({ ...locationPicker, step: "width_fraction" }); }}
          onWidthFraction={(fraction) => { updateDetail(pickerLine.id, locationPicker.valueKey, String(decimal(wholeFraction(pickerValue).whole, fraction))); setLocationPicker(null); }}
          onHeightWhole={() => undefined}
          onHeightFraction={() => undefined}
          onDirectMeasurements={() => undefined}
        /> : null;
      })() : null}
      {submitSuccess ? <div className="technical-measure-submit-success" role="status" aria-live="assertive">
        <div><Check aria-hidden="true" /><strong>Measure submitted</strong><span>Returning to the mobile dashboard…</span></div>
      </div> : null}
    </main>
    </PortalContainerContext.Provider>
  );
}

export function TechnicalMeasureList() {
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [forms, setForms] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [schedulingFormId, setSchedulingFormId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        const jobId = new URLSearchParams(window.location.search).get("jobId");
        const path = jobId ? `/api/crm/technical-measures?jobId=${encodeURIComponent(jobId)}` : "/api/crm/technical-measures";
        try {
          setLoadError(null);
          setForms((await crmFetch<{ forms: Array<Record<string, unknown>> }>(data.session, path)).forms);
        } catch (error) {
          setLoadError(error instanceof Error ? error.message : "Technical measures could not be loaded.");
        } finally {
          setLoading(false);
        }
      } else setLoading(false);
    });
  }, [supabase]);
  if (loading) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><Loader2 className="spin" /></main>;
  if (!session) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical Measures</h1><a className="technical-measure-primary" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent("/crm/technical-measures")}`}>Continue with Google</a></main>;
  const pendingForms = forms.filter((form) => form.status !== "submitted");
  const unscheduledForms = pendingForms.filter((form) => {
    const meta = form.meta as Record<string, unknown> | null;
    const scheduling = meta?.measure_scheduling as Record<string, unknown> | null;
    return scheduling?.status !== "scheduled";
  });
  const scheduledForms = pendingForms.filter((form) => {
    const meta = form.meta as Record<string, unknown> | null;
    const scheduling = meta?.measure_scheduling as Record<string, unknown> | null;
    return scheduling?.status === "scheduled";
  });
  const completedForms = forms.filter((form) => form.status === "submitted");
  async function updateScheduling(formId: string, scheduled: boolean, startAt?: string, endAt?: string) {
    if (!session) return;
    setSchedulingFormId(formId);
    setQueueMessage(null);
    try {
      const result = await crmFetch<{ form: Record<string, unknown> }>(
        session,
        `/api/crm/technical-measures/${formId}/schedule`,
        { method: "POST", body: JSON.stringify({ scheduled, startAt, endAt }) },
      );
      setForms((current) => current.map((form) => String(form.id) === formId ? result.form : form));
      setScheduleDraft(null);
      setQueueMessage(scheduled ? "Technical measure scheduled for Mike and added to the CRM calendar." : "Technical measure moved back to Needs Scheduling and removed from the calendar.");
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : "The scheduling status could not be updated.");
    } finally {
      setSchedulingFormId(null);
    }
  }
  function openScheduleDraft(form: Record<string, unknown>) {
    const meta = form.meta as Record<string, unknown> | null;
    const scheduling = meta?.measure_scheduling as Record<string, unknown> | null;
    const startAt = typeof scheduling?.scheduled_start_at === "string" ? new Date(scheduling.scheduled_start_at) : null;
    const endAt = typeof scheduling?.scheduled_end_at === "string" ? new Date(scheduling.scheduled_end_at) : null;
    const validStart = startAt && Number.isFinite(startAt.getTime());
    const durationMinutes = validStart && endAt && Number.isFinite(endAt.getTime())
      ? Math.max(30, Math.round((endAt.getTime() - startAt.getTime()) / 60000))
      : 90;
    const localParts = validStart
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(startAt).reduce<Record<string, string>>((parts, part) => {
          if (part.type !== "literal") parts[part.type] = part.value;
          return parts;
        }, {})
      : null;
    const customer = form.customer_snapshot as Record<string, unknown>;
    setScheduleDraft({
      formId: String(form.id),
      customerName: String(customer?.name || "Customer"),
      date: localParts ? `${localParts.year}-${localParts.month}-${localParts.day}` : losAngelesDateString(),
      time: localParts ? `${localParts.hour}:${localParts.minute}` : "09:00",
      durationMinutes,
      scheduled: scheduling?.status === "scheduled",
    });
  }
  async function saveScheduleDraft() {
    if (!scheduleDraft) return;
    const start = zonedTimeToUtc(scheduleDraft.date, scheduleDraft.time);
    const end = new Date(start.getTime() + scheduleDraft.durationMinutes * 60000);
    await updateScheduling(scheduleDraft.formId, true, start.toISOString(), end.toISOString());
  }
  const formLink = (form: Record<string, unknown>) => {
    const customer = form.customer_snapshot as Record<string, unknown>;
    const quote = form.quote_snapshot as Record<string, unknown>;
    const status = String(form.status);
    const meta = form.meta as Record<string, unknown> | null;
    const scheduling = meta?.measure_scheduling as Record<string, unknown> | null;
    const isScheduled = scheduling?.status === "scheduled";
    const address = String(customer?.address || "").trim();
    const phone = String(customer?.phone || "").trim();
    const mapUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
    const formId = String(form.id);
    return (
      <article className="technical-measure-queue-card" key={formId}>
        <a className="technical-measure-queue-main" href={`/crm/technical-measures/${form.id}`}>
          <div>
            <strong>{String(customer?.name || "Customer")}</strong>
            <small>{quote?.quoteNumber ? `Contract ${quote.quoteNumber}` : "Sold contract"}</small>
          </div>
          <ChevronRight aria-hidden="true" />
        </a>
        {mapUrl ? (
          <a className="technical-measure-address" href={mapUrl} target="_blank" rel="noreferrer">
            <MapPin /><span>{address}</span>
          </a>
        ) : <div className="technical-measure-address technical-measure-address--disabled"><MapPin /><span>Address not provided</span></div>}
        {status !== "submitted" ? (
          <div className="technical-measure-queue-actions">
            {phone ? <a href={`tel:${phone}`}><Phone />Call</a> : null}
            {phone ? <a href={`sms:${phone}`}><MessageSquare />Text</a> : null}
            <button
              type="button"
              data-scheduled={isScheduled}
              disabled={schedulingFormId === formId}
              onClick={() => openScheduleDraft(form)}
            >
              {schedulingFormId === formId ? <Loader2 className="spin" /> : <Check />}
              {isScheduled ? "Change Schedule" : "Mark Scheduled"}
            </button>
          </div>
        ) : null}
        <em data-status={status}>{status === "awaiting_signature" ? "Needs signature" : status === "submitted" ? "Completed" : isScheduled ? measureScheduleLabel(scheduling) : "Needs scheduling"}</em>
      </article>
    );
  };
  return (
    <main className="mts-quote-scope technical-measure-shell technical-measure-queue">
      <header className="technical-measure-header"><a href="/crm/mobile"><ArrowLeft /></a><div><span>805 Shutters CRM</span><h1>Measures</h1><p>{unscheduledForms.length} need scheduling · {scheduledForms.length} scheduled</p></div></header>
      <nav className="technical-measure-workspaces" aria-label="Mobile CRM workspaces">
        <a href="/crm/mobile"><CalendarDays />Appointments</a>
        <a className="active" href="/crm/technical-measures" aria-current="page"><Ruler />Measures</a>
        <a href="/crm/mobile/quotes"><FileText />Quotes</a>
      </nav>
      {loadError ? <div className="technical-measure-alert" role="alert">{loadError}</div> : null}
      {queueMessage ? <div className="technical-measure-alert" role="status">{queueMessage}</div> : null}
      <section className="technical-measure-list-section">
        <div className="technical-measure-list-heading"><div><span>Action required</span><h2>Needs Scheduling</h2></div><strong>{unscheduledForms.length}</strong></div>
        <div className="technical-measure-list">{unscheduledForms.map(formLink)}{!unscheduledForms.length ? <p>Every open technical measure has been scheduled.</p> : null}</div>
      </section>
      {scheduledForms.length ? <section className="technical-measure-list-section technical-measure-list-section--scheduled"><div className="technical-measure-list-heading"><div><span>Upcoming work</span><h2>Scheduled</h2></div><strong>{scheduledForms.length}</strong></div><div className="technical-measure-list">{scheduledForms.map(formLink)}</div></section> : null}
      {completedForms.length ? <section className="technical-measure-list-section technical-measure-list-section--completed"><div className="technical-measure-list-heading"><div><span>Customer file</span><h2>Completed</h2></div><strong>{completedForms.length}</strong></div><div className="technical-measure-list">{completedForms.map(formLink)}</div></section> : null}
      {scheduleDraft ? (
        <div className="technical-measure-schedule-backdrop" role="presentation" onClick={() => setScheduleDraft(null)}>
          <section className="technical-measure-schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="technical-measure-schedule-title" onClick={(event) => event.stopPropagation()}>
            <div className="technical-measure-schedule-head">
              <div><span>Mike’s calendar</span><h2 id="technical-measure-schedule-title">Schedule Technical Measure</h2><p>{scheduleDraft.customerName}</p></div>
              <button type="button" aria-label="Close scheduling" onClick={() => setScheduleDraft(null)}><X /></button>
            </div>
            <div className="technical-measure-schedule-fields">
              <label><span>Date</span><input type="date" min={losAngelesDateString()} value={scheduleDraft.date} onChange={(event) => setScheduleDraft((current) => current ? { ...current, date: event.target.value } : current)} /></label>
              <label><span>Start time</span><input type="time" step="900" value={scheduleDraft.time} onChange={(event) => setScheduleDraft((current) => current ? { ...current, time: event.target.value } : current)} /></label>
              <label><span>Duration</span><select value={scheduleDraft.durationMinutes} onChange={(event) => setScheduleDraft((current) => current ? { ...current, durationMinutes: Number(event.target.value) } : current)}><option value={60}>1 hour</option><option value={90}>1½ hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option></select></label>
            </div>
            <p className="technical-measure-schedule-note">This will be saved in the customer’s CRM file and shown as a green technical-measure appointment on Mike’s calendar.</p>
            <div className="technical-measure-schedule-actions">
              {scheduleDraft.scheduled ? <button type="button" className="technical-measure-schedule-remove" disabled={schedulingFormId === scheduleDraft.formId} onClick={() => void updateScheduling(scheduleDraft.formId, false)}>Move to Needs Scheduling</button> : null}
              <button type="button" onClick={() => setScheduleDraft(null)}>Cancel</button>
              <button type="button" className="technical-measure-primary" disabled={schedulingFormId === scheduleDraft.formId || !scheduleDraft.date || !scheduleDraft.time} onClick={() => void saveScheduleDraft()}>{schedulingFormId === scheduleDraft.formId ? <Loader2 className="spin" /> : <CalendarDays />} Save to Mike’s Calendar</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

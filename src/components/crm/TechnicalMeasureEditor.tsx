"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import "./technical-measure-ipad.css";
import { quoteProductDetails } from "@/lib/crm/customer-quote-details";
import type { Session } from "@supabase/supabase-js";
import { Archive, ArrowLeft, CalendarDays, Check, ChevronRight, ExternalLink, FileSignature, FileText, Loader2, Mail, MapPin, MessageSquare, Phone, Plus, Ruler, Save, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { losAngelesDateString, zonedTimeToUtc } from "@/lib/booking/availability";
import type {
  SignatureStroke,
  TechnicalMeasureForm,
  TechnicalMeasureLineValues,
} from "@/lib/crm/technical-measures";
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
import { ManufacturerTechnicalMeasureFields } from "@/components/crm/ManufacturerTechnicalMeasureFields";
import {
  compactTechnicalMeasureCompletionSummary,
  technicalMeasureCompletionIssues,
  type TechnicalMeasureCompletionIssue,
} from "@/lib/crm/technical-measure-completion";
import {
  applyOfflineTechnicalMeasureDraft,
  cacheTechnicalMeasureDraft,
  cacheTechnicalMeasureForm,
  cacheTechnicalMeasureList,
  flushTechnicalMeasureQueue,
  lastOfflineMeasureOwner,
  queueTechnicalMeasureOperation,
  readCachedTechnicalMeasureDraft,
  readCachedTechnicalMeasureForm,
  readCachedTechnicalMeasureList,
  rememberOfflineMeasureOwner,
  removeCachedTechnicalMeasureDraft,
  removeQueuedTechnicalMeasureOperation,
  queuedTechnicalMeasureOperations,
  reconcileTechnicalMeasureDraftResponse,
  technicalMeasureDraftPayload,
  type OfflineMeasureQueueEntry,
} from "@/lib/crm/technical-measure-offline";
import {
  commitTechnicalMeasureDetail,
  selectTechnicalMeasureInches,
  shouldQueueTechnicalMeasureSave,
} from "@/lib/crm/technical-measure-edits";

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

function technicalMeasureFormIsArchived(form: TechnicalMeasureForm) {
  return typeof form.meta.archived_at === "string" && Boolean(form.meta.archived_at.trim());
}

const PRODUCT_IDS: Record<string, string> = {
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
  "frame_type",
  "frame_style",
  "tilt_type",
  "tilt",
  "tilt_rod",
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
const OPENING_LABELS = ["A", "B", "C", "D", "E"] as const;
const FIELD_MEASURE_FRACTIONS = ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"] as const;
const FIELD_MEASURE_ROOMS = ["Living Room", "Family Room", "Dining Room", "Bathroom", "Bedroom", "Primary", "Primary Bath", "Office", "Den", "Laundry", "Loft", "Kitchen", "Garage", "Custom"] as const;
const FIELD_MEASURE_FRAME_SIDES = ["4", "3 SP", "3 SPL", "3 SBT", "3 SPR", "3", "2 SP", "T", "B"] as const;
const INSTALLATION_DURATION_CHOICES = Array.from({ length: 32 }, (_, index) => (index + 1) * 15);

function installationDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} minutes`;
  if (!remainder) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours}h ${remainder}m`;
}

function persistedInstallationDuration(form: TechnicalMeasureForm) {
  const duration = Number(form.meta.installation_duration_minutes);
  return Number.isInteger(duration)
    && duration >= 15
    && duration <= 480
    && duration % 15 === 0
    ? duration
    : null;
}

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

function fieldMeasureRoomLabel(values: TechnicalMeasureLineValues) {
  if (values.room === "Custom") return detailText(values.details, "field_measure_custom_room") || "Custom room";
  if (values.room === "Bedroom" && values.details.field_measure_bedroom) return `Bedroom ${values.details.field_measure_bedroom}`;
  return values.room || "Choose room";
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
  return "";
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
  if (!response.ok) throw new CrmRequestError(
    typeof body.message === "string" ? body.message : "CRM request failed.",
    response.status,
  );
  return body as T;
}

class CrmRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function shouldQueueCrmError(error: unknown) {
  return !(error instanceof CrmRequestError) || error.status >= 500 || error.status === 408 || error.status === 429;
}

async function downloadTechnicalMeasureForms(
  session: Session,
  owner: string,
  forms: Array<Record<string, unknown>>,
) {
  const ids = forms.map((form) => String(form.id || "")).filter(Boolean);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (cursor < ids.length) {
      const formId = ids[cursor++];
      try {
        const result = await crmFetch<{ form: TechnicalMeasureForm }>(session, `/api/crm/technical-measures/${formId}`);
        const draft = await readCachedTechnicalMeasureDraft(owner, formId);
        await cacheTechnicalMeasureForm(owner, applyOfflineTechnicalMeasureDraft(result.form, draft));
      } catch {
        // A previously downloaded copy remains available. One inaccessible form must
        // not prevent the rest of the technician's route from downloading.
      }
    }
  });
  await Promise.all(workers);
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

function orderPreparations(form: TechnicalMeasureForm | null) {
  const plural = form?.meta.vendor_order_preparations;
  const values = Array.isArray(plural)
    ? plural
    : form?.meta.vendor_order_preparation
      ? [form.meta.vendor_order_preparation]
      : [];
  return values.flatMap((value) => value && typeof value === "object" && !Array.isArray(value)
    ? [value as {
        status?: string;
        message?: string;
        issueCount?: number;
        taskId?: string | null;
        portalDraftId?: string | null;
        manufacturer?: string;
        productType?: string;
        lineCount?: number;
        orderPacketUrl?: string | null;
      }]
    : []);
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

export function TechnicalMeasureEditor({ formId, workspace = "mobile" }: { formId: string; workspace?: "mobile" | "desktop" }) {
  const desktopWorkspace = workspace === "desktop";
  const workspaceHome = desktopWorkspace ? "/crm" : "/crm/mobile";
  const measurePath = desktopWorkspace ? `/crm/measure/${formId}` : `/crm/technical-measures/${formId}`;
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
  const [measureView, setMeasureView] = useState<"ledger" | "line">("ledger");
  const [mobilePane, setMobilePane] = useState<"contract" | "measure">("measure");
  const fieldPaneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(min-width: 744px)").matches) setMeasureStarted(true);
  }, []);
  useEffect(() => { fieldPaneRef.current?.scrollTo({ top: 0 }); }, [activeLineIndex, measureStarted, measureView]);
  const [choiceField, setChoiceField] = useState<{ lineId: string; field: "room" } | null>(null);
  const [customOpeningLineId, setCustomOpeningLineId] = useState<string | null>(null);
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
  const [offlineMode, setOfflineMode] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [completionIssues, setCompletionIssues] = useState<TechnicalMeasureCompletionIssue[]>([]);
  const [installationDurationMinutes, setInstallationDurationMinutes] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedPayloadRef = useRef("");
  const draftSyncPromiseRef = useRef<Promise<{ form: TechnicalMeasureForm; queued: boolean }> | null>(null);
  const linesRef = useRef<EditableLine[]>([]);
  const hydratedFormIdRef = useRef("");
  const userSelectedRef = useRef(false);
  const measurePickerAdvanceRef = useRef(false);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setAuthLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [supabase]);

  function owner(activeSession = session) {
    return rememberOfflineMeasureOwner(activeSession?.user.email || lastOfflineMeasureOwner());
  }

  function hydrate(nextForm: TechnicalMeasureForm, fromOffline: boolean) {
    setForm(nextForm);
    setLines(nextForm.lines);
    linesRef.current = nextForm.lines;
    if (desktopWorkspace && nextForm.status === "submitted") setMeasureStarted(true);
    setActiveLineIndex((current) => Math.min(current, Math.max(nextForm.lines.length - 1, 0)));
    setSignerName(nextForm.customer_snapshot.name || "");
    const persistedDuration = persistedInstallationDuration(nextForm);
    setInstallationDurationMinutes((current) =>
      hydratedFormIdRef.current === nextForm.id && persistedDuration === null
        ? current
        : persistedDuration
    );
    hydratedFormIdRef.current = nextForm.id;
    setOfflineMode(fromOffline);
    lastSyncedPayloadRef.current = fromOffline ? "" : JSON.stringify(technicalMeasureDraftPayload(nextForm.lines));
    hydratedRef.current = true;
  }

  async function load(activeSession = session) {
    setLoading(true);
    const activeOwner = owner(activeSession);
    try {
      const cached = activeOwner ? await readCachedTechnicalMeasureForm(activeOwner, formId) : null;
      const cachedDraft = activeOwner ? await readCachedTechnicalMeasureDraft(activeOwner, formId) : null;
      if (cached) hydrate(applyOfflineTechnicalMeasureDraft(cached, cachedDraft), true);
      if (!activeSession) return;
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(activeSession, `/api/crm/technical-measures/${formId}`);
      if (desktopWorkspace) {
        hydrate(result.form, false);
        await cacheTechnicalMeasureForm(activeOwner, result.form);
        return;
      }
      const localDraft = await readCachedTechnicalMeasureDraft(activeOwner, formId);
      const hydrated = applyOfflineTechnicalMeasureDraft(result.form, localDraft);
      hydrate(hydrated, Boolean(localDraft));
      await cacheTechnicalMeasureForm(activeOwner, hydrated);
      if (localDraft) {
        await queueTechnicalMeasureOperation(activeOwner, formId, "draft", localDraft);
        setPendingSync(true);
      }
    } catch (error) {
      const cached = activeOwner ? await readCachedTechnicalMeasureForm(activeOwner, formId) : null;
      if (cached) {
        setOfflineMode(true);
        setMessage("Offline mode · this measure is saved on this phone.");
      } else {
        setMessage(error instanceof Error ? error.message : "Technical measure could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session?.access_token, formId]);

  useEffect(() => {
    if (!hydratedRef.current || !form || form.status === "submitted" || !lines.length) return;
    linesRef.current = lines;
    const activeOwner = owner();
    const payload = technicalMeasureDraftPayload(lines);
    const serialized = JSON.stringify(payload);
    if (!shouldQueueTechnicalMeasureSave(serialized, lastSyncedPayloadRef.current, userSelectedRef.current)) return;
    userSelectedRef.current = false;
    void Promise.all([
      cacheTechnicalMeasureDraft(activeOwner, form, lines),
      queueTechnicalMeasureOperation(activeOwner, formId, "draft", payload),
    ]);
    setPendingSync(true);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void flushLatestDraft();
    }, 700);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [lines, form?.id, form?.status]);

  useEffect(() => {
    const preserve = () => {
      if (!form || form.status === "submitted" || !linesRef.current.length) return;
      const activeOwner = owner();
      const payload = technicalMeasureDraftPayload(linesRef.current);
      if (!shouldQueueTechnicalMeasureSave(
        JSON.stringify(payload),
        lastSyncedPayloadRef.current,
        userSelectedRef.current,
      )) return;
      userSelectedRef.current = false;
      void Promise.all([
        cacheTechnicalMeasureDraft(activeOwner, form, linesRef.current),
        queueTechnicalMeasureOperation(activeOwner, formId, "draft", payload),
      ]);
    };
    window.addEventListener("pagehide", preserve);
    document.addEventListener("visibilitychange", preserve);
    return () => {
      window.removeEventListener("pagehide", preserve);
      document.removeEventListener("visibilitychange", preserve);
    };
  }, [form, session?.user.email]);

  useEffect(() => {
    if (desktopWorkspace) return;
    async function synchronize() {
      if (!session || !navigator.onLine) return;
      const activeOwner = owner(session);
      const completed = await flushTechnicalMeasureQueue(activeOwner, async (entry) => {
        const path = entry.operation === "draft"
          ? `/api/crm/technical-measures/${entry.formId}`
          : `/api/crm/technical-measures/${entry.formId}/submit`;
        const method = entry.operation === "draft" ? "PATCH" : "POST";
        return (await crmFetch<{ form: TechnicalMeasureForm }>(session, path, {
          method,
          body: JSON.stringify(entry.payload),
        })).form;
      });
      const current = completed.filter(({ entry }) => entry.formId === formId).at(-1);
      if (current) {
        hydrate(current.form, false);
        if (current.entry.operation === "submit") {
          setMessage("Measure submitted");
          setSubmitSuccess(true);
          window.setTimeout(() => window.location.assign(workspaceHome), 1300);
        } else {
          setMessage("Saved changes uploaded.");
        }
      }
      setPendingSync((await queuedTechnicalMeasureOperations(activeOwner)).some((entry) => entry.formId === formId));
      setOfflineMode(false);
    }
    const onOnline = () => void synchronize();
    const onOffline = () => setOfflineMode(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (navigator.onLine) void synchronize();
    else setOfflineMode(true);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [desktopWorkspace, session?.access_token, formId, workspaceHome]);

  function markTechnicalMeasureSelection() {
    userSelectedRef.current = true;
  }

  function updateLine(lineId: string, patch: Partial<TechnicalMeasureLineValues>) {
    markTechnicalMeasureSelection();
    setMessage(null);
    setCompletionIssues((current) => current.filter((issue) => issue.lineId !== lineId));
    setLines((current) => {
      const next = current.map((line) => line.id === lineId ? {
        ...line,
        current_values: {
          ...line.current_values,
          ...patch,
          measure_complete: Object.prototype.hasOwnProperty.call(patch, "measure_complete")
            ? Boolean(patch.measure_complete)
            : false,
        },
      } : line);
      linesRef.current = next;
      return next;
    });
  }

  function updateDetail(lineId: string, key: string, value: string | boolean) {
    markTechnicalMeasureSelection();
    setMessage(null);
    setCompletionIssues((current) => current.filter((issue) => issue.lineId !== lineId));
    setLines((current) => {
      const next = current.map((line) => {
        if (line.id !== lineId) return line;
        const committed = commitTechnicalMeasureDetail(line.current_values.details, key, value);
        return {
          ...line,
          current_values: {
            ...line.current_values,
            details: committed.details as TechnicalMeasureLineValues["details"],
            measure_complete: false,
          },
        };
      });
      linesRef.current = next;
      return next;
    });
  }

  function selectLineInches(
    lineId: string,
    field: "width_in" | "height_in",
    whole: number,
    fraction: string,
    currentValue: number | null,
  ) {
    const selection = selectTechnicalMeasureInches(currentValue, whole, fraction, FIELD_MEASURE_FRACTIONS);
    updateLine(lineId, {
      [field]: selection.inches,
      [field === "width_in" ? "width_confirmed" : "height_confirmed"]: true,
    });
    return selection;
  }

  function beginMeasurePickerAdvance() {
    measurePickerAdvanceRef.current = true;
    window.setTimeout(() => {
      measurePickerAdvanceRef.current = false;
    }, 0);
  }

  function closeMeasurePicker() {
    if (measurePickerAdvanceRef.current) {
      measurePickerAdvanceRef.current = false;
      return;
    }
    setMeasurePicker(null);
  }

  async function persistDraftOnce(sourceLines: EditableLine[]) {
    if (!form) throw new Error("Technical measure is unavailable.");
    const activeOwner = owner();
    const payload = technicalMeasureDraftPayload(sourceLines);
    await cacheTechnicalMeasureDraft(activeOwner, form, sourceLines);
    if (!session || !navigator.onLine) {
      await queueTechnicalMeasureOperation(activeOwner, formId, "draft", payload);
      setOfflineMode(true);
      setPendingSync(true);
      return {
        form: applyOfflineTechnicalMeasureDraft(form, payload),
        queued: true,
        superseded: false,
      };
    }
    try {
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(session, `/api/crm/technical-measures/${formId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const latestLines = linesRef.current;
      const latestPayload = technicalMeasureDraftPayload(latestLines);
      const reconciled = reconcileTechnicalMeasureDraftResponse(
        result.form,
        payload,
        latestPayload,
      );
      if (reconciled.hasNewerDraft) {
        await Promise.all([
          cacheTechnicalMeasureDraft(activeOwner, result.form, latestLines),
          queueTechnicalMeasureOperation(activeOwner, formId, "draft", latestPayload),
        ]);
        setPendingSync(true);
        return { form: reconciled.form, queued: false, superseded: true };
      }
      hydrate(result.form, false);
      await Promise.all([
        cacheTechnicalMeasureForm(activeOwner, result.form),
        removeQueuedTechnicalMeasureOperation(activeOwner, formId, "draft"),
        removeCachedTechnicalMeasureDraft(activeOwner, formId),
      ]);
      setPendingSync(false);
      return { form: result.form, queued: false, superseded: false };
    } catch (error) {
      if (!shouldQueueCrmError(error)) throw error;
      await queueTechnicalMeasureOperation(activeOwner, formId, "draft", payload);
      setOfflineMode(true);
      setPendingSync(true);
      return {
        form: applyOfflineTechnicalMeasureDraft(form, payload),
        queued: true,
        superseded: false,
      };
    }
  }

  async function flushLatestDraft() {
    if (draftSyncPromiseRef.current) return draftSyncPromiseRef.current;

    const pending = (async () => {
      while (true) {
        const sourceLines = linesRef.current;
        const serialized = JSON.stringify(technicalMeasureDraftPayload(sourceLines));
        const result = await persistDraftOnce(sourceLines);
        if (result.queued) return { form: result.form, queued: true };
        if (!result.superseded) {
          lastSyncedPayloadRef.current = serialized;
          return { form: result.form, queued: false };
        }
        // The technician changed another measurement while the request was in
        // flight. Immediately persist the newest snapshot instead of letting
        // the older response reset the form.
      }
    })();
    draftSyncPromiseRef.current = pending;
    try {
      return await pending;
    } finally {
      if (draftSyncPromiseRef.current === pending) draftSyncPromiseRef.current = null;
    }
  }

  async function handleSave() {
    setBusy(true); setMessage(null);
    try {
      const saved = await flushLatestDraft();
      setMessage(saved.queued ? "Saved on this phone · it will upload automatically when service returns." : "Technical measure draft saved.");
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Technical measure could not be saved."); }
    finally { setBusy(false); }
  }

  async function handleSubmitLine(index: number) {
    if (!form) return;
    const currentLines = linesRef.current;
    const line = currentLines[index];
    if (!line) return;
    const issues = technicalMeasureCompletionIssues({ ...form, lines: currentLines });
    const lineIssues = issues.filter((issue) => issue.lineId === line.id);
    setCompletionIssues(lineIssues);
    if (lineIssues.length) {
      setMessage(compactTechnicalMeasureCompletionSummary(lineIssues));
      return;
    }

    markTechnicalMeasureSelection();
    const nextLines = currentLines.map((candidate) => candidate.id === line.id
      ? { ...candidate, current_values: { ...candidate.current_values, measure_complete: true } }
      : candidate);
    linesRef.current = nextLines;
    setLines(nextLines);
    setBusy(true);
    setMessage(null);
    try {
      const saved = await persistDraftOnce(nextLines);
      setMeasureView("ledger");
      setCompletionIssues([]);
      setMessage(saved.queued
        ? `Opening ${index + 1} saved on this iPad.`
        : `Opening ${index + 1} submitted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This opening could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!form) return;
    if (!linesRef.current.length || linesRef.current.some((line) => !line.current_values.measure_complete)) {
      setMeasureView("ledger");
      setMessage("Submit every opening before completing the order.");
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const saved = await flushLatestDraft();
      const issues = technicalMeasureCompletionIssues(saved.form);
      setCompletionIssues(issues);
      if (issues.length) {
        setActiveLineIndex(issues[0].lineIndex);
        setMeasureView("line");
        setMessage(compactTechnicalMeasureCompletionSummary(issues));
        return;
      }
      if (saved.form.requiresAddendum) {
        setMessage("Review the changes with the customer and collect their signature below.");
        setMeasureStarted(false);
        window.setTimeout(() => document.getElementById("technical-measure-addendum")?.scrollIntoView({ behavior: "smooth" }), 0);
        return;
      }
      if (saved.queued || !navigator.onLine || !session) {
        if (!installationDurationMinutes) {
          setMessage("Choose the installation duration before completing the measure.");
          return;
        }
        await queueTechnicalMeasureOperation(owner(), formId, "submit", {
          installationDurationMinutes,
        });
        setPendingSync(true);
        setOfflineMode(true);
        setMessage("Measure saved on this phone · it will submit automatically when service returns.");
        return;
      }
      let result: { form: TechnicalMeasureForm };
      try {
        if (!installationDurationMinutes) {
          setMessage("Choose the installation duration before completing the measure.");
          return;
        }
        result = await crmFetch<{ form: TechnicalMeasureForm }>(session, `/api/crm/technical-measures/${formId}/submit`, {
          method: "POST",
          body: JSON.stringify({ installationDurationMinutes }),
        });
      } catch (error) {
        if (!shouldQueueCrmError(error)) throw error;
        if (!installationDurationMinutes) {
          setMessage("Choose the installation duration before completing the measure.");
          return;
        }
        await queueTechnicalMeasureOperation(owner(), formId, "submit", {
          installationDurationMinutes,
        });
        setPendingSync(true);
        setOfflineMode(true);
        setMessage("Measure saved on this phone · it will submit automatically when service returns.");
        return;
      }
      hydrate(result.form, false);
      await cacheTechnicalMeasureForm(owner(), result.form);
      setMessage("Measure submitted");
      setSubmitSuccess(true);
      window.setTimeout(() => window.location.assign(workspaceHome), 1300);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Technical measure could not be submitted."); }
    finally { setBusy(false); }
  }

  async function handleSign() {
    if (!session) return;
    if (!installationDurationMinutes) {
      setMessage("Choose the installation duration before signing the measure.");
      return;
    }
    setBusy(true); setMessage(null);
    try {
      await flushLatestDraft();
      const result = await crmFetch<{ form: TechnicalMeasureForm; email: { sent: boolean; error?: string; skipped?: string } }>(session, `/api/crm/technical-measures/${formId}/sign`, {
        method: "POST",
        body: JSON.stringify({
          acknowledged,
          signerName,
          signatureStrokes: signature,
          installationDurationMinutes,
        }),
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

  async function backfillVendorOrder(force = false) {
    if (!session) return;
    setBusy(true); setMessage(null);
    try {
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(
        session,
        `/api/crm/technical-measures/${formId}/vendor-order-backfill`,
        { method: "POST", body: JSON.stringify({ force }) },
      );
      hydrate(result.form, false);
      setMessage(force
        ? "Manufacturer orders rebuilt from all submitted measurement lines."
        : "Manufacturer orders added to the CRM order-entry queue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The submitted measure could not be queued for order entry.");
    } finally {
      setBusy(false);
    }
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

  async function restoreArchivedForm() {
    if (!session || !form) return;
    setBusy(true); setMessage(null);
    try {
      const result = await crmFetch<{ form: TechnicalMeasureForm }>(
        session,
        `/api/crm/technical-measures/${form.id}/archive`,
        { method: "POST", body: JSON.stringify({ archived: false }) },
      );
      setForm(result.form);
      setMessage("Technical measure restored to the technician list.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The technical measure could not be restored.");
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
  const vendorOrderPreparations = orderPreparations(form);
  const canBackfillVendorOrders = readOnly && vendorOrderPreparations.length === 0 && lines.length > 0;
  const queuedLineCount = vendorOrderPreparations.reduce(
    (total, preparation) => total + Math.max(0, Number(preparation.lineCount) || 0),
    0,
  );
  const canRebuildVendorOrders = readOnly
    && vendorOrderPreparations.length > 0
    && lines.length > 0
    && (
      queuedLineCount !== lines.length
      || vendorOrderPreparations.some((preparation) => !preparation.orderPacketUrl)
    );
  const activeLineNumber = Math.min(activeLineIndex + 1, Math.max(lines.length, 1));
  const completedLineCount = readOnly
    ? lines.length
    : lines.filter((line) => line.current_values.measure_complete).length;
  const allLinesComplete = lines.length > 0 && completedLineCount === lines.length;
  const futureMeasures = form?.futureMeasures || [];

  function showLine(index: number) {
    setActiveLineIndex(Math.min(Math.max(index, 0), Math.max(lines.length - 1, 0)));
    setMeasureView("line");
    setCompletionIssues([]);
    setMessage(null);
  }

  if (authLoading || loading) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><Loader2 className="spin" /><p>Loading technical measure...</p></main>;
  if (!session && !form) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical Measure</h1><p>Sign in once while connected to download your measures for offline access.</p><a className="technical-measure-primary" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent(measurePath)}`}>Continue with Google</a></main>;
  if (!form) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical measure unavailable</h1>{message ? <p>{message}</p> : null}<a href={desktopWorkspace ? "/crm" : "/crm/technical-measures"}>Return to {desktopWorkspace ? "CRM" : "measures"}</a></main>;

  return (
    <PortalContainerContext.Provider value={scopeElement}>
    <main ref={setScopeElement} className={`mts-quote-scope technical-measure-shell tm805-split${desktopWorkspace ? " technical-measure-shell--desktop" : ""}${measureStarted ? " technical-measure-shell--active" : ""}`}>
      <header className="tm805-header">
        <a href={workspaceHome} aria-label="Return to CRM"><ArrowLeft /></a>
        <div className="tm805-brand" aria-label="805 Shutters"><strong>805</strong><span>SHUTTERS</span></div>
        <div className="tm805-title"><h1>Technical Measure</h1><p>{form.customer_snapshot.name} · {form.quote_snapshot.quoteNumber}</p></div>
        <span className="tm805-status">{offlineMode ? "Offline" : pendingSync ? "Syncing…" : busy ? "Saving…" : form.status.replaceAll("_", " ")}</span>
      </header>
      <nav className="tm805-mobile-tabs" aria-label="Measure workspace view">
        <button type="button" aria-pressed={mobilePane === "contract"} onClick={() => setMobilePane("contract")}>Contract</button>
        <button type="button" aria-pressed={mobilePane === "measure"} onClick={() => setMobilePane("measure")}>Field measure</button>
      </nav>
      <div className="tm805-panes" data-mobile-pane={mobilePane}>
        <aside className="tm805-contract" aria-label="Customer contract reference">
          <header className="tm805-pane-heading"><h2><FileText />Customer contract</h2>{form.contractUrl && <a href={form.contractUrl} target="_blank" rel="noopener noreferrer" aria-label="Open original customer contract"><ExternalLink /></a>}</header>
          {form.contractUrl ? <iframe className="tm805-contract-document" title="Original customer contract" src={form.contractUrl} /> : <div className="tm805-contract-unavailable"><FileText /><h3>Contract unavailable</h3><p>{offlineMode ? "Reconnect to view the original customer contract. Your field measure is still available." : "The original contract link is missing from this customer file."}</p></div>}
        </aside>
        <section className="tm805-field" aria-label="Technician field measure">
          <header className="tm805-pane-heading"><h2><Ruler />Technician field measure</h2><span>{measureView === "ledger" ? `${completedLineCount} of ${lines.length} complete` : `Opening ${activeLineNumber} of ${lines.length}`}</span></header>
          <div className="tm805-field-scroll" ref={fieldPaneRef}>
      {(offlineMode || pendingSync) ? (
        <div className="technical-measure-offline-status" data-offline={offlineMode}>
          <span>{offlineMode ? "Offline" : "Saving"}</span>
          <strong>{!session ? "Saved on phone · sign in when connected to upload" : offlineMode ? "Saved on this phone" : "Uploading saved changes…"}</strong>
        </div>
      ) : null}
      {!measureStarted ? <>
      <header className="technical-measure-header">
        <a href={desktopWorkspace ? "/crm" : "/crm/technical-measures"} aria-label={desktopWorkspace ? "Back to desktop CRM" : "Back to technical measures"}><ArrowLeft /></a>
        <div><span>{form.quote_snapshot.quoteNumber || "Sold contract"}</span><h1>Technical Measure</h1><p>{form.customer_snapshot.name}</p></div>
        <strong data-status={form.status}>{form.status.replaceAll("_", " ")}</strong>
      </header>

      {desktopWorkspace ? (
        <nav className="technical-measure-workspaces" aria-label="Desktop CRM workspace">
          <a href="/crm"><ArrowLeft />CRM Command</a>
          <a className="active" href={measurePath} aria-current="page"><Ruler />Technical Measure</a>
        </nav>
      ) : (
        <nav className="technical-measure-workspaces" aria-label="Mobile CRM workspaces">
          <a href="/crm/mobile"><CalendarDays />Appointments</a>
          <a className="active" href="/crm/technical-measures" aria-current="page"><Ruler />Measures</a>
          <a href="/crm/mobile/quotes"><FileText />Quotes</a>
        </nav>
      )}

      {message ? <div className="technical-measure-alert" role="status">{message}</div> : null}
      {technicalMeasureFormIsArchived(form) ? (
        <div className="technical-measure-alert" role="status">
          Archived · retained in this customer file for audit history. <button type="button" disabled={busy} onClick={() => void restoreArchivedForm()}>Restore to technician list</button>
        </div>
      ) : null}
      {vendorOrderPreparations.map((preparation) => (
        <section className="technical-measure-order-status" data-status={preparation.status} key={`${preparation.manufacturer}:${preparation.taskId}`}>
          <div><span>{String(preparation.manufacturer || "Vendor")} {String(preparation.productType || "order")} preparation</span><strong>{String(preparation.status || "needs_input").replaceAll("_", " ")}</strong></div>
          <p>{preparation.message}</p>
          {preparation.issueCount ? <small>{preparation.issueCount} item{preparation.issueCount === 1 ? "" : "s"} must be corrected before vendor portal entry.</small> : null}
          {preparation.portalDraftId ? <small>Norman draft: {preparation.portalDraftId}</small> : null}
          <b>Review every line before placing or submitting the order.</b>
        </section>
      ))}
      {canBackfillVendorOrders ? (
        <section className="technical-measure-order-status" data-status="needs_input">
          <div><span>Manufacturer order preparation</span><strong>Not queued</strong></div>
          <p>This submitted measure predates the manufacturer-separated CRM order queue.</p>
          <button type="button" className="technical-measure-primary" disabled={busy} onClick={() => void backfillVendorOrder()}>
            Queue Manufacturer Orders
          </button>
        </section>
      ) : null}
      {canRebuildVendorOrders ? (
        <section className="technical-measure-order-status" data-status="needs_input">
          <div><span>Manufacturer order preparation</span><strong>Reset required</strong></div>
          <p>The queued order no longer matches all submitted measurement lines. Rebuild it from the submitted technical measure before portal entry.</p>
          <button type="button" className="technical-measure-primary" disabled={busy} onClick={() => void backfillVendorOrder(true)}>
            Rebuild Manufacturer Orders
          </button>
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
      <button className="technical-measure-launch" type="button" onClick={() => { setMeasureStarted(true); setMeasureView("ledger"); }}>
        <Ruler /> Start Measure <ChevronRight />
      </button>
      </> : null}

      {measureStarted ? <section className="technical-measure-lines technical-measure-workspace">
        {desktopWorkspace && form.status === "submitted" ? (
          <div className="technical-measure-alert technical-measure-alert--active" role="status">
            <strong>Saved Technical Measure</strong>
            <span data-status="submitted">Submitted</span>
          </div>
        ) : null}
        {measureView === "ledger" ? (
          <section className="technical-measure-ledger" aria-label="Technical measure line items">
            <header>
              <div><span>Field measure</span><h2>Line items</h2></div>
              <strong>{completedLineCount}/{lines.length}</strong>
            </header>
            {message ? <div className="technical-measure-alert technical-measure-alert--active" role="status">{message}</div> : null}
            <div className="technical-measure-ledger-list">
              {lines.map((line, index) => {
                const complete = readOnly || line.current_values.measure_complete;
                const supplier = detailText(line.current_values.details, "supplier", "manufacturer");
                return (
                  <button type="button" onClick={() => showLine(index)} data-complete={complete} key={line.id}>
                    <span className="technical-measure-ledger-number">{index + 1}</span>
                    <span className="technical-measure-ledger-copy">
                      <strong>{fieldMeasureRoomLabel(line.current_values)}{line.current_values.opening_label ? ` · ${line.current_values.opening_label}` : ""}</strong>
                      <small>{productLabel(line.current_values.product_id)}{supplier ? ` · ${supplier}` : ""}</small>
                    </span>
                    <span className="technical-measure-ledger-size">{inches(line.current_values.width_in)} × {inches(line.current_values.height_in)}</span>
                    <span className="technical-measure-ledger-status">{complete ? <><Check />Done</> : <>Needs measure<ChevronRight /></>}</span>
                  </button>
                );
              })}
            </div>
            {!readOnly ? <button className="technical-measure-add-future" type="button" onClick={() => { setMeasureStarted(false); setFutureMeasureOpen(true); window.setTimeout(() => document.getElementById("future-measures")?.scrollIntoView({ behavior: "smooth" }), 0); }}><Plus /> Add future window</button> : null}
          </section>
        ) : null}
        {measureView === "line" ? lines.map((line, index) => {
          const baseline = line.baseline;
          const contractOptions = quoteProductDetails("", [
            ...Object.entries(baseline.details)
              .filter(([key, value]) => !HEADER_DETAIL_KEYS.has(key) && !key.startsWith("field_measure_") && value != null && value !== "" && typeof value !== "object")
              .map(([key, value]) => `${fieldName(key)}: ${typeof value === "boolean" ? value ? "Yes" : "No" : value}`),
          ]);
          const current = line.current_values;
          const isExpandedWindow = (line.source_quantity || 1) > 1;
          const normanRoller = current.product_id === "roller"
            && detailText(current.details, "supplier", "manufacturer", "catalog_manufacturer").toLowerCase() === "norman";
          const shutterProduct = isShutterProduct(current.product_id);
          const onyxShutter = shutterProduct && isOnyxShutter(current.product_id, current.details);
          const measurementBasis = shutterMeasurementBasis(current.details);
          const measurementBasisOptions = shutterMeasurementBasisOptions(onyxShutter);
          const panelConfiguration = detailText(current.details, "panel_config", "panel_configuration", "folding_direction");
          const frameType = detailText(current.details, "frame_type", "frame_style");
          const tiltType = detailText(current.details, "tilt_type", "tilt", "tilt_rod");
          const baselineTiltType = detailText(baseline.details, "tilt_type", "tilt", "tilt_rod");
          const supplier = detailText(current.details, "supplier", "manufacturer");
          const measureSchema = line.measure_schema;
          const customOpening = customOpeningLineId === line.id
            || (!!current.opening_label && !OPENING_LABELS.includes(current.opening_label as (typeof OPENING_LABELS)[number]));
          const splitTiltLocation = detailText(current.details, "split_tilt_location")
            || (/^(yes|true)$/i.test(detailText(current.details, "split_tilt")) ? "Center" : "None");
          const dividerRailLocation = detailText(current.details, "divider_rail_location")
            || (/^(yes|true)$/i.test(detailText(current.details, "divider_rail")) ? "Center" : "None");
          const priorityDetailKeys: readonly string[] = shutterProduct ? SHUTTER_MEASURE_PRIORITY_KEYS : SHADE_MEASURE_PRIORITY_KEYS;
          const detailKeys = Array.from(new Set([...Object.keys(baseline.details), ...Object.keys(current.details)]))
            .filter((key) => (!normanRoller || !NORMAN_ROLLER_MEASURE_DETAIL_KEYS.has(key))
              && !priorityDetailKeys.includes(key)
              && !HEADER_DETAIL_KEYS.has(key)
              && !["frame_sides", "field_measure_custom_room", "field_measure_bedroom"].includes(key));
          const lineCompletionIssues = completionIssues.filter((issue) => issue.lineId === line.id);
          return (
            <article className={`technical-measure-line${index === activeLineIndex ? " technical-measure-line--active" : " technical-measure-line--inactive"}`} key={line.id}>
              <div className="technical-measure-line-top">
                <div className="technical-measure-line-head">
                  <div>
                    <span>Line {index + 1} of {lines.length}{isExpandedWindow ? ` · Window ${line.source_quantity_index} of ${line.source_quantity}` : ""}</span>
                    <div className="technical-measure-line-meta"><b>{productLabel(current.product_id)}</b><strong>{money(line.current_unit_price)} each</strong></div>
                    {supplier ? <small className="tm805-line-supplier">{supplier}</small> : null}
                  </div>
                  <button type="button" aria-label="Back to line items" onClick={() => setMeasureView("ledger")}><ArrowLeft /></button>
                </div>
                {(message || lineCompletionIssues.length) ? (
                  <div className="technical-measure-alert technical-measure-alert--active" role={lineCompletionIssues.length ? "alert" : "status"}>
                    {lineCompletionIssues.length ? (
                      <>
                        <strong>Complete this opening</strong>
                        <ul>
                          {lineCompletionIssues.map((issue) => (
                            <li key={`${issue.lineId}-${issue.field}`}>
                              <b>{issue.label}:</b> {issue.instruction}
                            </li>
                          ))}
                        </ul>
                        {message ? <small>{message}</small> : null}
                      </>
                    ) : message}
                  </div>
                ) : null}
              </div>
              <button className="tm805-contract-jump" type="button" onClick={() => document.getElementById(`contract-options-${line.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}><FileText />View contract options<ChevronRight /></button>
              <div className="technical-measure-opening-row technical-measure-opening-row--priority">
                  <div className={`technical-measure-choice-field ${changed(baseline.room, current.room) ? "changed" : ""}`}>
                    <span>1. Room name</span>
                    <button type="button" disabled={readOnly} onClick={() => setChoiceField(choiceField?.lineId === line.id && choiceField.field === "room" ? null : { lineId: line.id, field: "room" })}>{current.room === "Custom" ? detailText(current.details, "field_measure_custom_room") || "Custom" : current.room === "Bedroom" && current.details.field_measure_bedroom ? `Bedroom ${current.details.field_measure_bedroom}` : current.room || "Select room"}<ChevronRight /></button>
                    {choiceField?.lineId === line.id && choiceField.field === "room" ? (
                      <div className="technical-measure-choice-grid">
                        {FIELD_MEASURE_ROOMS.map((room) => <button type="button" aria-pressed={current.room === room} key={room} onClick={() => { updateLine(line.id, { room }); setChoiceField(null); }}>{room}</button>)}
                      </div>
                    ) : null}
                    {current.room === "Bedroom" ? <div className="technical-measure-choice-grid technical-measure-bedroom-choices" aria-label="Bedroom number">{["1", "2", "3", "4", "5"].map((bedroom) => <button type="button" disabled={readOnly} aria-pressed={String(current.details.field_measure_bedroom || "") === bedroom} key={bedroom} onClick={() => updateDetail(line.id, "field_measure_bedroom", bedroom)}>{bedroom}</button>)}</div> : null}
                    {current.room === "Custom" ? <input disabled={readOnly} aria-label="Custom room name" placeholder="Enter room name" value={detailText(current.details, "field_measure_custom_room")} onChange={(event) => updateDetail(line.id, "field_measure_custom_room", event.target.value)} /> : null}
                  </div>
                  <div className={`technical-measure-opening-choice ${changed(baseline.opening_label, current.opening_label) ? "changed" : ""}`}>
                    <span>Opening letter</span>
                    <div aria-label="Opening identifier">
                      {OPENING_LABELS.map((opening) => <button type="button" disabled={readOnly} aria-pressed={current.opening_label === opening} key={opening} onClick={() => { updateLine(line.id, { opening_label: opening }); setCustomOpeningLineId((active) => active === line.id ? null : active); }}>{opening}</button>)}
                      <button className="technical-measure-opening-custom-button" type="button" disabled={readOnly} aria-pressed={customOpening} onClick={() => { setCustomOpeningLineId(line.id); if (OPENING_LABELS.includes(current.opening_label as (typeof OPENING_LABELS)[number])) updateLine(line.id, { opening_label: "" }); }}>Custom</button>
                    </div>
                    {customOpening ? <input className="technical-measure-custom-opening" aria-label="Custom opening identifier" disabled={readOnly} autoFocus placeholder="Enter custom opening" value={current.opening_label} onChange={(event) => updateLine(line.id, { opening_label: event.target.value })} /> : null}
                  </div>
              </div>
              <div className="technical-measure-section-label">2. {shutterProduct ? "Measurement type" : "Mount"}</div>
              {shutterProduct ? <div className="technical-measure-basis technical-measure-field-basis"><span>W = window size · F = frame to frame</span><div>
                <button type="button" disabled={readOnly} aria-label="Window size" aria-pressed={measurementBasis === "window_size"} onClick={() => updateDetail(line.id, onyxShutter ? "size_type" : "measurement_basis", measurementBasisOptions[0].label)}>W</button>
                <button type="button" disabled={readOnly} aria-label="Frame to frame" aria-pressed={measurementBasis === "frame_to_frame"} onClick={() => updateDetail(line.id, onyxShutter ? "size_type" : "measurement_basis", measurementBasisOptions[1].label)}>F</button>
              </div></div> : <div className="technical-measure-basis technical-measure-field-basis"><span>I = inside mount · O = outside mount</span><div>
                <button type="button" disabled={readOnly} aria-pressed={current.details.mount_type === "Inside Mount"} onClick={() => updateDetail(line.id, "mount_type", "Inside Mount")}>I</button>
                <button type="button" disabled={readOnly} aria-pressed={current.details.mount_type === "Outside Mount"} onClick={() => updateDetail(line.id, "mount_type", "Outside Mount")}>O</button>
              </div></div>}
              <div className="technical-measure-section-label">3. Width &amp; height</div>
              <div className="technical-measure-dimensions">
                <button type="button" aria-label="Select width" disabled={readOnly} className={changed(baseline.width_in, current.width_in) ? "changed" : ""} onClick={() => setMeasurePicker({ lineId: line.id, step: "width_whole" })}><span aria-hidden="true">W</span><strong>{inches(current.width_in)}</strong></button>
                <button type="button" aria-label="Select height" disabled={readOnly} className={changed(baseline.height_in, current.height_in) ? "changed" : ""} onClick={() => setMeasurePicker({ lineId: line.id, step: "height_whole" })}><span aria-hidden="true">H</span><strong>{inches(current.height_in)}</strong></button>
              </div>
              <div className="technical-measure-dimension-confirmations">
                <button type="button" disabled={readOnly || !current.width_in} data-confirmed={current.width_confirmed} onClick={() => updateLine(line.id, { width_confirmed: true })}>{current.width_confirmed ? <Check /> : null} Confirm width</button>
                <button type="button" disabled={readOnly || !current.height_in} data-confirmed={current.height_confirmed} onClick={() => updateLine(line.id, { height_confirmed: true })}>{current.height_confirmed ? <Check /> : null} Confirm height</button>
              </div>
              {shutterProduct ? <><div className="technical-measure-section-label">4. Shutter configuration</div><div className="technical-measure-priority-grid">
                <div className="technical-measure-quick-field technical-measure-frame-sides">
                  <span>Frame sides</span>
                  <button className="technical-measure-current-choice" type="button" disabled={readOnly} aria-expanded={detailChoice?.lineId === line.id && detailChoice.key === "__frame_sides"} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__frame_sides" ? null : { lineId: line.id, key: "__frame_sides" })}><span>{detailText(current.details, "frame_sides") || "Select"}</span><ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__frame_sides" ? <div className="technical-measure-choice-grid technical-measure-detail-options">{FIELD_MEASURE_FRAME_SIDES.map((option) => <button type="button" aria-pressed={current.details.frame_sides === option} key={option} onClick={() => { updateDetail(line.id, "frame_sides", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                </div>
                <div className="technical-measure-quick-field technical-measure-folding">
                  <span>Folding direction</span>
                  <button className="technical-measure-current-choice" type="button" disabled={readOnly} aria-expanded={detailChoice?.lineId === line.id && detailChoice.key === "__panel_config"} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__panel_config" ? null : { lineId: line.id, key: "__panel_config" })}><span>{panelConfiguration || "Select"}</span><ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__panel_config" ? <div className="technical-measure-choice-grid technical-measure-folding-options">{shutterDetailOptions("panel_config", onyxShutter)?.map((option) => <button type="button" aria-pressed={panelConfiguration === option} key={option} onClick={() => { updateDetail(line.id, "panel_config", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                </div>
                <div className="technical-measure-quick-field technical-measure-frame">
                  <span>Frame type</span>
                  <button className="technical-measure-current-choice" type="button" disabled={readOnly} aria-expanded={detailChoice?.lineId === line.id && detailChoice.key === "__frame_type"} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__frame_type" ? null : { lineId: line.id, key: "__frame_type" })}><span>{frameType || "Select"}</span><ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__frame_type" ? <div className="technical-measure-choice-grid technical-measure-detail-options">{shutterDetailOptions("frame_type", onyxShutter)?.map((option) => <button type="button" aria-pressed={frameType === option} key={option} onClick={() => { updateDetail(line.id, "frame_type", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
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
              </div></> : <div className="technical-measure-priority-grid technical-measure-priority-grid--shade">
                <div className="technical-measure-basis"><span>Control side</span><div><button type="button" disabled={readOnly} aria-pressed={String(current.details.control_side || "").toLowerCase() === "left"} onClick={() => updateDetail(line.id, "control_side", "Left")}>Left</button><button type="button" disabled={readOnly} aria-pressed={String(current.details.control_side || "").toLowerCase() === "right"} onClick={() => updateDetail(line.id, "control_side", "Right")}>Right</button></div></div>
              </div>}
              <div className="technical-measure-secondary">
                <div className="technical-measure-fields">
                {shutterProduct ? <div className={`technical-measure-choice-field ${changed(baselineTiltType, tiltType) ? "changed" : ""}`}>
                  <span>Tilt Type</span>
                  <button type="button" disabled={readOnly} onClick={() => setDetailChoice(detailChoice?.lineId === line.id && detailChoice.key === "__tilt_type" ? null : { lineId: line.id, key: "__tilt_type" })}>{tiltType || "Select"}<ChevronRight /></button>
                  {detailChoice?.lineId === line.id && detailChoice.key === "__tilt_type" ? <div className="technical-measure-choice-grid technical-measure-detail-options">{shutterDetailOptions("tilt_type", onyxShutter)?.map((option) => <button type="button" aria-pressed={tiltType === option} key={option} onClick={() => { updateDetail(line.id, "tilt_type", option); setDetailChoice(null); }}>{option}</button>)}</div> : null}
                </div> : <label className={changed(baseline.program_id, current.program_id) ? "changed" : ""}><span>Program / Operating System</span><input disabled={readOnly} value={current.program_id || ""} onChange={(event) => updateLine(line.id, { program_id: event.target.value || null })} /></label>}
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
                {!onyxShutter && !normanRoller && measureSchema ? (
                  <ManufacturerTechnicalMeasureFields
                    schema={measureSchema}
                    values={current}
                    disabled={readOnly}
                    onDetail={(key, value) => updateDetail(line.id, key, value)}
                  />
                ) : null}
                {!onyxShutter && !normanRoller && !measureSchema ? (
                  <div className="technical-measure-schema-blocked" role="alert">
                    <strong>Product-specific measure form unavailable</strong>
                    <span>The manufacturer and exact product/program must be resolved before this line can be measured for ordering.</span>
                  </div>
                ) : null}
                {(onyxShutter || normanRoller || !measureSchema) ? detailKeys.map((key) => {
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
                    <label className={changed(baseline.details[key], value) ? "changed" : ""} key={key}><span>{fieldName(key)}</span><input disabled={readOnly} value={value == null ? "" : String(value)} onChange={(event) => updateDetail(line.id, key, event.target.value)} onBlur={(event) => updateDetail(line.id, key, event.target.value)} /></label>
                  );
                }) : null}
                <label className={`technical-measure-notes ${changed(baseline.notes, current.notes) ? "changed" : ""}`}><span>Technician Notes</span><textarea disabled={readOnly} rows={3} value={current.notes} onChange={(event) => updateLine(line.id, { notes: event.target.value })} onBlur={(event) => updateLine(line.id, { notes: event.target.value })} /></label>
                </div>
              </div>
              <section className="tm805-contract-options" id={`contract-options-${line.id}`} aria-label="Original contract options">
                <header><div><span>Original selections</span><h3>Contract options</h3></div>{form.contractUrl ? <a href={form.contractUrl} target="_blank" rel="noopener noreferrer" aria-label="Open full contract">Full contract<ExternalLink /></a> : null}</header>
                <div className="tm805-contract-summary"><strong>{baseline.room}{baseline.opening_label ? ` · ${baseline.opening_label}` : ""}</strong><span>{inches(baseline.width_in)} × {inches(baseline.height_in)}</span></div>
                <dl>
                  <div><dt>Product</dt><dd>{productLabel(baseline.product_id)}</dd></div>
                  {detailText(baseline.details, "supplier", "manufacturer") ? <div><dt>Manufacturer</dt><dd>{detailText(baseline.details, "supplier", "manufacturer")}</dd></div> : null}
                  {baseline.program_id ? <div><dt>Program</dt><dd>{baseline.program_id}</dd></div> : null}
                  {baseline.fabric && !contractOptions.some((option) => option.value === baseline.fabric) ? <div><dt>Material / Fabric</dt><dd>{baseline.fabric}</dd></div> : null}
                  {contractOptions.map((option) => <div key={option.label}><dt>{option.label}</dt><dd>{option.value}</dd></div>)}
                  {baseline.notes && baseline.notes.trim() !== productLabel(baseline.product_id) ? <div className="tm805-contract-note"><dt>Contract notes</dt><dd>{baseline.notes}</dd></div> : null}
                </dl>
              </section>
              <div className="technical-measure-line-navigation technical-measure-line-submit">
                <button type="button" onClick={() => setMeasureView("ledger")}><ArrowLeft />Back to line items</button>
                <span>{current.measure_complete ? "Opening complete" : "Review every required field"}</span>
                <button type="button" disabled={readOnly || busy} onClick={() => void handleSubmitLine(index)}>{busy ? <Loader2 className="spin" /> : <Check />}Submit line item</button>
              </div>
            </article>
          );
        }) : null}
      </section> : null}

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

      </div>
      {!readOnly && measureStarted && measureView === "ledger" ? <footer className="technical-measure-actions">
        <label className="technical-measure-install-duration">
          <span>Installation duration</span>
          <select
            aria-label="Installation duration"
            value={installationDurationMinutes || ""}
            onChange={(event) => setInstallationDurationMinutes(
              event.target.value ? Number(event.target.value) : null,
            )}
          >
            <option value="">Choose…</option>
            {INSTALLATION_DURATION_CHOICES.map((minutes) => (
              <option value={minutes} key={minutes}>{installationDurationLabel(minutes)}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={handleSave}><Save /> Save Draft</button>
        <button className="technical-measure-primary" type="button" disabled={busy || !installationDurationMinutes || !allLinesComplete} onClick={handleSubmit}>{busy ? <Loader2 className="spin" /> : <Check />} Complete Measure</button>
      </footer> : null}

        </section>
      </div>

      {measurePicker && activePickerLine ? (
        <MeasurementGridModal
          open
          showDirectEntry={false}
          wholeEnd={125}
          fractions={FIELD_MEASURE_FRACTIONS}
          onClose={closeMeasurePicker}
          step={measurePicker.step}
          pendingWidth={pendingWidth}
          pendingHeight={pendingHeight}
          onWidthWhole={(whole) => { beginMeasurePickerAdvance(); selectLineInches(activePickerLine.id, "width_in", whole, "0", activePickerLine.current_values.width_in); setMeasurePicker({ ...measurePicker, step: "width_fraction" }); }}
          onWidthFraction={(fraction) => { beginMeasurePickerAdvance(); selectLineInches(activePickerLine.id, "width_in", wholeFraction(activePickerLine.current_values.width_in).whole, fraction, activePickerLine.current_values.width_in); setMeasurePicker({ ...measurePicker, step: "height_whole" }); }}
          onHeightWhole={(whole) => { beginMeasurePickerAdvance(); selectLineInches(activePickerLine.id, "height_in", whole, "0", activePickerLine.current_values.height_in); setMeasurePicker({ ...measurePicker, step: "height_fraction" }); }}
          onHeightFraction={(fraction) => { selectLineInches(activePickerLine.id, "height_in", wholeFraction(activePickerLine.current_values.height_in).whole, fraction, activePickerLine.current_values.height_in); setMeasurePicker(null); }}
          onDirectMeasurements={(width, height) => { selectLineInches(activePickerLine.id, "width_in", width.whole, width.fraction, activePickerLine.current_values.width_in); selectLineInches(activePickerLine.id, "height_in", height.whole, height.fraction, activePickerLine.current_values.height_in); setMeasurePicker(null); }}
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
          onWidthWhole={(whole) => { const selection = selectTechnicalMeasureInches(pickerValue || null, whole, "0", FRACTIONS); updateDetail(pickerLine.id, locationPicker.valueKey, String(selection.inches)); setLocationPicker({ ...locationPicker, step: "width_fraction" }); }}
          onWidthFraction={(fraction) => { const selection = selectTechnicalMeasureInches(pickerValue || null, wholeFraction(pickerValue).whole, fraction, FRACTIONS); updateDetail(pickerLine.id, locationPicker.valueKey, String(selection.inches)); setLocationPicker(null); }}
          onHeightWhole={() => undefined}
          onHeightFraction={() => undefined}
          onDirectMeasurements={() => undefined}
        /> : null;
      })() : null}
      {submitSuccess ? <div className="technical-measure-submit-success" role="status" aria-live="assertive">
        <div><Check aria-hidden="true" /><strong>Measure submitted</strong><span>Returning to the {desktopWorkspace ? "desktop CRM" : "mobile dashboard"}…</span></div>
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
  const [offlineMode, setOfflineMode] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [schedulingFormId, setSchedulingFormId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [archivingFormId, setArchivingFormId] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      void (async () => {
        const cached = await readCachedTechnicalMeasureList(lastOfflineMeasureOwner());
        setForms(cached);
        setDownloadedCount(cached.length);
        setOfflineMode(true);
        setLoading(false);
      })();
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      const activeOwner = rememberOfflineMeasureOwner(data.session?.user.email || lastOfflineMeasureOwner());
      const cached = activeOwner ? await readCachedTechnicalMeasureList(activeOwner) : [];
      if (cached.length) {
        setForms(cached);
        setDownloadedCount(cached.length);
      }
      if (!data.session) {
        setOfflineMode(!navigator.onLine);
        setLoading(false);
        return;
      }
      const jobId = new URLSearchParams(window.location.search).get("jobId");
      const path = jobId ? `/api/crm/technical-measures?jobId=${encodeURIComponent(jobId)}` : "/api/crm/technical-measures";
      try {
        setLoadError(null);
        if (navigator.onLine) {
          await flushTechnicalMeasureQueue(activeOwner, async (entry) => {
            const endpoint = entry.operation === "draft"
              ? `/api/crm/technical-measures/${entry.formId}`
              : `/api/crm/technical-measures/${entry.formId}/submit`;
            return (await crmFetch<{ form: TechnicalMeasureForm }>(data.session!, endpoint, {
              method: entry.operation === "draft" ? "PATCH" : "POST",
              body: JSON.stringify(entry.payload),
            })).form;
          });
        }
        const nextForms = (await crmFetch<{ forms: Array<Record<string, unknown>> }>(data.session, path)).forms;
        setForms(nextForms);
        await cacheTechnicalMeasureList(activeOwner, nextForms);
        await downloadTechnicalMeasureForms(data.session, activeOwner, nextForms);
        setDownloadedCount(nextForms.length);
        navigator.serviceWorker?.controller?.postMessage({
          type: "CACHE_MEASURE_ROUTES",
          urls: nextForms.map((form) => `/crm/technical-measures/${String(form.id)}`),
        });
        setOfflineMode(false);
      } catch (error) {
        if (cached.length) {
          setOfflineMode(true);
          setLoadError("Offline mode · downloaded measures are available on this phone.");
        } else {
          setLoadError(error instanceof Error ? error.message : "Technical measures could not be loaded.");
        }
      } finally {
        setLoading(false);
      }
    });
  }, [supabase]);
  useEffect(() => {
    const onOnline = () => window.location.reload();
    const onOffline = () => setOfflineMode(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  if (loading) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><Loader2 className="spin" /></main>;
  if (!session && !forms.length) return <main className="mts-quote-scope technical-measure-shell technical-measure-centered"><h1>Technical Measures</h1><p>Sign in once while connected to download measures for offline use.</p><a className="technical-measure-primary" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent("/crm/technical-measures")}`}>Continue with Google</a></main>;
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
  async function archiveForm(formId: string) {
    if (!session || !window.confirm("Archive this technical measure? It will stay in the customer file and can be restored later.")) return;
    setArchivingFormId(formId);
    setQueueMessage(null);
    try {
      await crmFetch(session, `/api/crm/technical-measures/${formId}/archive`, {
        method: "POST",
        body: JSON.stringify({ archived: true }),
      });
      setForms((current) => current.filter((form) => String(form.id) !== formId));
      setQueueMessage("Technical measure archived. It remains available in the customer file.");
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : "The technical measure could not be archived.");
    } finally {
      setArchivingFormId(null);
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
            <button type="button" disabled={archivingFormId === formId} onClick={() => void archiveForm(formId)}>
              {archivingFormId === formId ? <Loader2 className="spin" /> : <Archive />}
              Archive
            </button>
          </div>
        ) : <div className="technical-measure-queue-actions"><button type="button" disabled={archivingFormId === formId} onClick={() => void archiveForm(formId)}>{archivingFormId === formId ? <Loader2 className="spin" /> : <Archive />}Archive</button></div>}
        <em data-status={status}>{status === "awaiting_signature" ? "Needs signature" : status === "submitted" ? "Completed" : isScheduled ? measureScheduleLabel(scheduling) : "Needs scheduling"}</em>
      </article>
    );
  };
  return (
    <main className="mts-quote-scope technical-measure-shell technical-measure-queue">
      {(offlineMode || downloadedCount > 0) ? (
        <div className="technical-measure-offline-status" data-offline={offlineMode}>
          <span>{offlineMode ? "Offline" : "Offline ready"}</span>
          <strong>{!session ? `${downloadedCount} saved · sign in when connected to sync` : `${downloadedCount} measure${downloadedCount === 1 ? "" : "s"} saved on this phone`}</strong>
        </div>
      ) : null}
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

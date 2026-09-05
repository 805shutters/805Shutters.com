"use client";

import "@/mts-quote/mts-quote.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, CloudOff, FileImage, Grid3X3, List, Plus, Search } from "lucide-react";
import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import type { CrmCalendarEvent } from "@/lib/crm/types";
import {
  addMobileQuoteWindow, appendMobileQuotePhoto, beginMobileQuoteGridSelection, chooseMobileQuoteGridWhole, commitMobileQuoteGridSelection, createMobileQuoteDraft, emptyMobileQuoteDesign, isManualQuoteEditorHandoffReady,
  isMobileQuoteDraftAccessible, isQuoteEditorHandoffReady, mobileQuoteFingerprint, mobileQuoteLine, mobileQuotePreflightOutcome, removeMobileQuoteWindow,
  selectMobileQuoteBedroomNumber, selectMobileQuoteProduct, selectMobileQuoteRoom, selectMobileQuoteWindowLetter, updateMobileQuoteCustomRoom, updateMobileQuoteDesign, validateMobileQuoteWindow,
  MOBILE_QUOTE_ACCOUNT_ID, MOBILE_QUOTE_FRACTIONS, type MobileQuoteCustomer, type MobileQuoteDraft, type MobileQuoteGridSelection, type MobileQuotePhoto, type MobileQuoteWindow,
} from "@/lib/crm/mobile-quote-draft";
import { loadMobileQuoteCatalog, loadMobileQuoteDrafts, saveMobileQuoteCatalog, saveMobileQuoteDraft } from "@/lib/crm/mobile-quote-storage";
import { buildCatalogSelectionPatch, DesignCard, loadQuoteBuilderCatalog } from "@mts/components/crm/quote-builder/DesignCard";
import { ManufacturerProductButtons } from "@mts/components/crm/quote-builder/ManufacturerProductButtons";
import { QuoteBuilderDatabaseProvider } from "@mts/integrations/supabase/quoteBuilderDatabase";
import { SelectQuickButtonsProvider } from "@mts/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@mts/components/ui/dialog";
import { supabase } from "@mts/integrations/supabase/client";
import { PortalContainerContext } from "@mts/lib/portal-container";
import { createQuoteV2Draft, mutateQuoteV2Structure, priceQuoteV2, quoteV2DesignPatch, quoteV2PreviewDesign, quoteV2PreviewLine, quoteV2PricingOutcome, type QuoteV2StructureOperation } from "@mts/lib/quoteV2ServerClient";
import { prepareMobileQuotePhoto } from "./mobileQuoteImage";
import { MobileRoomSelector } from "./MobileRoomSelector";
import styles from "./MobileQuoteWalkthrough.module.css";

type Tab = "scheduled" | "today" | "add" | "sold";
type ExistingCustomer = { jobId: string; name: string; phone: string; email: string; address: string };
type PreviewResponse = { backend: "authoritative_v2"; verifiedAt: string; status: "authoritative" | "partial"; total: number | null; authoritativeSubtotal: number; lines: Array<{ lineItemId: string; status: "authoritative" | "blocked" | "unpriceable"; price: { total?: number }; blockedReason?: string | null; requiresManualPricing: boolean }> };

function laDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day") + offset, 12)).toISOString().slice(0, 10);
}

function laDateForInstant(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateAndTime(value: string) {
  return new Date(value).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function time(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function PhotoThumbnail({ photo, onRemove }: { photo: MobileQuotePhoto; onRemove?: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(photo.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.blob]);
  return <figure>{url && <img src={url} alt={photo.name} />}{onRemove && <button type="button" onClick={onRemove}>Remove</button>}</figure>;
}

export function MobileMeasurementGrid({
  selection,
  onChooseWhole,
  onCommit,
  onClose,
  onCloseAutoFocus,
}: {
  selection: MobileQuoteGridSelection;
  onChooseWhole: (whole: number) => void;
  onCommit: (fraction: string) => void;
  onClose: () => void;
  onCloseAutoFocus?: () => void;
}) {
  const [page, setPage] = useState(() => Math.min(10, Math.max(0, Math.floor(selection.whole / 100))));
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const label = selection.side === "width" ? "Width" : "Height";
  const pageStart = page * 100;
  const pageEnd = Math.min(1000, pageStart + 99);
  const wholeNumbers = Array.from({ length: pageEnd - pageStart + 1 }, (_, index) => pageStart + index);
  const fractions = selection.whole === 1000 ? MOBILE_QUOTE_FRACTIONS.slice(0, 1) : MOBILE_QUOTE_FRACTIONS;

  useEffect(() => {
    selectedButton.current?.focus();
  }, [selection.step, page, portalContainer]);

  return <div className="mts-quote-scope" ref={setPortalContainer}>
    <PortalContainerContext.Provider value={portalContainer}>
      {portalContainer && <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className={styles.measurementDialog} onCloseAutoFocus={(event) => { event.preventDefault(); onCloseAutoFocus?.(); }}>
          <DialogHeader>
        <DialogTitle>{label} grid</DialogTitle>
        <DialogDescription>{selection.step === "whole" ? `Select whole inches for ${label.toLowerCase()}.` : `Select a fraction for ${selection.whole} inches.`}</DialogDescription>
      </DialogHeader>
      {selection.step === "whole" ? <>
        <div className={styles.gridRange} aria-label="Whole-inch range">
          <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}><ChevronLeft />Previous</button>
          <strong>{pageStart}–{pageEnd} inches</strong>
          <button type="button" onClick={() => setPage((value) => Math.min(10, value + 1))} disabled={page === 10}>Next<ChevronRight /></button>
        </div>
        <div className={styles.wholeGrid} role="group" aria-label={`${label} whole inches`}>
          {wholeNumbers.map((whole) => <button
            type="button"
            key={whole}
            ref={whole === selection.whole ? selectedButton : undefined}
            aria-pressed={whole === selection.whole}
            aria-label={`${whole} whole inches`}
            onClick={() => onChooseWhole(whole)}
          >{whole}</button>)}
        </div>
      </> : <div className={styles.gridFractions} role="group" aria-label={`${label} fraction`}>
        {fractions.map((fraction) => <button
          type="button"
          key={fraction}
          ref={fraction === selection.fraction ? selectedButton : undefined}
          aria-pressed={fraction === selection.fraction}
          onClick={() => onCommit(fraction)}
        >{fraction === "0" ? "0 (even)" : fraction}</button>)}
      </div>}
          <button type="button" className={styles.gridCancel} onClick={onClose}>Cancel</button>
        </DialogContent>
      </Dialog>}
    </PortalContainerContext.Provider>
  </div>;
}

export function MobileQuoteWalkthrough({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const owner = `${session.user.id}:${MOBILE_QUOTE_ACCOUNT_ID}`;
  const queryClient = useMemo(() => new QueryClient(), []);
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [appointments, setAppointments] = useState<CrmCalendarEvent[]>([]);
  const [customers, setCustomers] = useState<ExistingCustomer[]>([]);
  const [customerNextCursor, setCustomerNextCursor] = useState<string | null>(null);
  const [contracts, setContracts] = useState<Array<{ id: string; name: string; address: string | null; contracts: Array<{ id: string; status: string; number: string | null; label: string | null }> }>>([]);
  const [catalog, setCatalog] = useState<QuoteLabCatalogProduct[]>([]);
  const [drafts, setDrafts] = useState<MobileQuoteDraft[]>([]);
  const [draft, setDraft] = useState<MobileQuoteDraft | null>(null);
  const [screen, setScreen] = useState<"home" | "build" | "review" | "success">("home");
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const [productFamily, setProductFamily] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [saveState, setSaveState] = useState("Loading device drafts…");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [soldStatus, setSoldStatus] = useState("all");
  const [contact, setContact] = useState({ name: "", phone: "", email: "", address: "" });
  const [measurementGrid, setMeasurementGrid] = useState<MobileQuoteGridSelection | null>(null);
  const measurementGridTrigger = useRef<HTMLButtonElement | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const draftRef = useRef<MobileQuoteDraft | null>(null);
  const saveRevision = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  function persistDraft(next: MobileQuoteDraft, revision: number) {
    const write = saveQueue.current.catch(() => undefined).then(() => saveMobileQuoteDraft(next));
    saveQueue.current = write;
    return write.then(() => {
      if (revision !== saveRevision.current) return;
      setSaveState(navigator.onLine ? "Saved on device" : "Offline · saved on device");
      setDrafts((current) => [next, ...current.filter((item) => item.id !== next.id)]);
    }).catch(() => {
      if (revision === saveRevision.current) setSaveState("Not saved — keep this page open");
      throw new Error("Device storage did not commit the latest draft.");
    });
  }

  async function api<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(path.replace(/(\?|$)/, "/$1"), {
      ...init,
      headers: { Authorization: `Bearer ${session.access_token}`, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) onSessionExpired();
    if (!response.ok) throw new Error(body.message || "Request failed.");
    return body as T;
  }

  useEffect(() => {
    setOnline(navigator.onLine);
    const connected = () => {
      setOnline(true);
      loadQuoteBuilderCatalog().then((result) => {
        setCatalog(result.products);
        return saveMobileQuoteCatalog(owner, result.products);
      }).catch(() => setError("Using the last saved product catalog. Current catalog verification is unavailable."));
    };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected); window.addEventListener("offline", disconnected);
    loadMobileQuoteDrafts(owner).then(setDrafts).then(() => setSaveState("Saved on device")).catch(() => setSaveState("Device storage unavailable — changes are not saved"));
    loadMobileQuoteCatalog(owner).then((cached) => { if (cached?.products.length) setCatalog(cached.products); }).catch(() => undefined);
    if (navigator.onLine) {
      loadQuoteBuilderCatalog().then((result) => {
        setCatalog(result.products);
        void saveMobileQuoteCatalog(owner, result.products).catch(() => setSaveState("Catalog loaded, but could not be saved offline"));
      }).catch(() => setError("Using the last saved product catalog. Current catalog verification is unavailable."));
    }
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [owner]);

  useEffect(() => {
    draftRef.current = draft;
    if (!draft) return;
    const revision = ++saveRevision.current;
    setSaveState("Saving…");
    const timer = window.setTimeout(() => { void persistDraft(draft, revision).catch(() => undefined); }, 180);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    const saveBeforeLeave = () => {
      const latest = draftRef.current;
      if (!latest) return;
      const revision = ++saveRevision.current;
      void persistDraft(latest, revision).catch(() => undefined);
    };
    window.addEventListener("pagehide", saveBeforeLeave);
    return () => window.removeEventListener("pagehide", saveBeforeLeave);
  }, []);

  useEffect(() => {
    if (screen !== "home" || (tab !== "today" && tab !== "scheduled")) return;
    const start = laDate(tab === "today" ? 0 : 1);
    const end = laDate(tab === "today" ? 1 : 15);
    api<{ appointments: CrmCalendarEvent[] }>(`/api/crm/mobile/appointments?event_type=sales_consult&start=${start}&end=${end}&scope=my`)
      .then((result) => setAppointments(result.appointments.filter((event) => event.event_type === "sales_consult")))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Appointments unavailable."));
  }, [tab, screen, session.access_token]);

  useEffect(() => {
    if (screen !== "home" || query.trim().length < 2) { setCustomers([]); setCustomerNextCursor(null); setContracts([]); return; }
    const timer = window.setTimeout(() => {
      if (tab === "sold") api<{ results: typeof contracts }>(`/api/crm/mobile/quotes?q=${encodeURIComponent(query)}`).then((result) => setContracts(result.results)).catch((reason) => setError(reason.message));
      else api<{ results: ExistingCustomer[]; nextCursor: string | null }>(`/api/crm/mobile/quote-customers?q=${encodeURIComponent(query)}`).then((result) => { setCustomers(result.results); setCustomerNextCursor(result.nextCursor); }).catch((reason) => setError(reason.message));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tab, screen, session.access_token]);

  const active = draft?.windows.find((line) => line.id === draft.activeWindowId) || draft?.windows[0] || null;
  const activeFamily = active?.activeProductId ? active.families[active.activeProductId] : null;

  useEffect(() => {
    if (!active?.activeProductId) return;
    const product = catalog.find((item) => item.id === active.activeProductId);
    if (!product) return;
    setProductFamily(product.productType);
    setManufacturer(product.manufacturer || null);
  }, [active?.activeProductId, catalog]);

  async function loadMoreCustomers() {
    if (!customerNextCursor || query.trim().length < 2) return;
    try {
      const result = await api<{ results: ExistingCustomer[]; nextCursor: string | null }>(`/api/crm/mobile/quote-customers?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(customerNextCursor)}`);
      setCustomers((current) => [...current, ...result.results.filter((candidate) => !current.some((item) => item.jobId === candidate.jobId))]);
      setCustomerNextCursor(result.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "More customers could not be loaded.");
    }
  }

  function start(customer: MobileQuoteCustomer) {
    const existing = drafts.find((item) =>
      isMobileQuoteDraftAccessible(item) &&
      ((customer.jobId && item.customer.jobId === customer.jobId) ||
        (customer.sourceId && item.customer.sourceId === customer.sourceId)),
    );
    const next = existing || createMobileQuoteDraft(owner, customer);
    setDraft(next); setScreen(next.submission.snapshot ? "review" : "build"); setError(""); window.scrollTo(0, 0);
  }

  function updateWindow(patch: Partial<MobileQuoteWindow>) {
    if (!draft || !active) return;
    if (draft.submission.snapshot) { setError("Submission is in progress. This saved snapshot is frozen so retries cannot create duplicate or conflicting quotes."); return; }
    const next = structuredClone(draft);
    const line = next.windows.find((item) => item.id === active.id)!;
    Object.assign(line, patch, { saved: false, price: null });
    next.quotePrice = null;
    next.updatedAt = new Date().toISOString(); setDraft(next);
  }

  function openMeasurementGrid(side: "width" | "height", trigger: HTMLButtonElement) {
    if (!active || draft?.submission.snapshot) return;
    measurementGridTrigger.current = trigger;
    setMeasurementGrid(beginMobileQuoteGridSelection(active, side));
  }

  function commitMeasurementGrid(fraction: string) {
    if (!measurementGrid) return;
    setDraft((current) => current ? commitMobileQuoteGridSelection(current, measurementGrid, fraction) : current);
    setMeasurementGrid(null);
    setError("");
  }

  async function addPhoto(file: File | undefined) {
    if (!file || !draft || !active) return;
    const draftId = draft.id;
    const windowId = active.id;
    try {
      setSaveState("Compressing photo…");
      const photo = await prepareMobileQuotePhoto(file);
      setDraft((current) => current ? appendMobileQuotePhoto(current, draftId, windowId, photo) : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo could not be prepared.");
    }
  }

  function selectProduct(productId: string | null) {
    if (!draft || !active || !productId) return;
    if (draft.submission.snapshot) { setError("Submission is in progress. Product changes are frozen until this submission completes."); return; }
    const product = catalog.find((item) => item.id === productId);
    if (!product) return;
    const base = emptyMobileQuoteDesign(active.id, product.productType);
    const patch = buildCatalogSelectionPatch({}, product);
    setDraft(selectMobileQuoteProduct(draft, active.id, { productId: product.id, productType: product.productType, design: { ...base, ...patch, options_json: patch.options_json || {} } }));
  }

  async function refreshPrice(nextDraft = draft) {
    if (!nextDraft || !online) return;
    const priceableWindows = nextDraft.windows.filter((line) => !validateMobileQuoteWindow(line));
    if (!priceableWindows.length) return;
    const requestFingerprints = new Map(priceableWindows.map((line) => [line.id, mobileQuoteFingerprint(line)]));
    const quoteFingerprint = JSON.stringify([...requestFingerprints]);
    try {
      const lines = priceableWindows.map((window) => {
        const line = mobileQuoteLine(nextDraft, window);
        return { line: quoteV2PreviewLine(line), design: quoteV2PreviewDesign(window.families[window.activeProductId!].design) };
      });
      const preview = await api<PreviewResponse>("/api/crm/mobile/quote-preview", { method: "POST", body: JSON.stringify({ lines }) });
      setDraft((current) => {
        if (!current || current.id !== nextDraft.id) return current;
        const currentFingerprints = [...requestFingerprints].map(([id]) => {
          const line = current.windows.find((candidate) => candidate.id === id);
          return [id, line ? mobileQuoteFingerprint(line) : null];
        });
        if (JSON.stringify(currentFingerprints) !== quoteFingerprint) return current;
        const result = structuredClone(current);
        for (const linePrice of preview.lines) {
          const line = result.windows.find((item) => item.id === linePrice.lineItemId);
          const fingerprint = requestFingerprints.get(linePrice.lineItemId);
          if (!line || !fingerprint) continue;
          line.price = { amount: linePrice.status === "authoritative" ? Number(linePrice.price.total || 0) : 0, status: linePrice.status, fingerprint, verifiedAt: preview.verifiedAt, blockedReason: linePrice.blockedReason };
        }
        const statuses = preview.lines.map((line) => line.status);
        const completeCoverage = priceableWindows.length === nextDraft.windows.length && preview.lines.length === priceableWindows.length;
        const quoteAuthoritative = completeCoverage && preview.status === "authoritative" && preview.total !== null && statuses.every((status) => status === "authoritative");
        result.quotePrice = {
          amount: quoteAuthoritative ? preview.total! : preview.authoritativeSubtotal,
          status: quoteAuthoritative ? "authoritative" : statuses.includes("blocked") || !completeCoverage ? "blocked" : "unpriceable",
          fingerprint: quoteFingerprint,
          verifiedAt: preview.verifiedAt,
        };
        return result;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authoritative pricing is unavailable.");
    }
  }

  useEffect(() => {
    if (!draft || !online || screen !== "build" || draft.submission.snapshot) return;
    const timer = window.setTimeout(() => { void refreshPrice(draft); }, 650);
    return () => window.clearTimeout(timer);
    // Draft timestamps change only for user edits; accepted price responses keep them stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.updatedAt, online, screen]);

  function saveAndNext() {
    if (!draft || !active || draft.submission.snapshot || busy) return;
    const issue = validateMobileQuoteWindow(active);
    if (issue) { setError(issue); return; }
    let next = structuredClone(draft);
    next.windows.find((item) => item.id === active.id)!.saved = true;
    next = addMobileQuoteWindow(next); setDraft(next); setError(""); void refreshPrice(next); window.scrollTo(0, 0);
  }

  function removeWindow(windowId: string) {
    if (!draft || draft.submission.snapshot) return;
    const next = removeMobileQuoteWindow(draft, windowId);
    if (next === draft) return;
    setDraft(next);
    setError("");
    if (online) void refreshPrice(next);
  }

  function review() {
    if (!draft) return;
    const issueIndex = draft.windows.findIndex(validateMobileQuoteWindow);
    if (issueIndex >= 0) { setError(`Window ${issueIndex + 1}: ${validateMobileQuoteWindow(draft.windows[issueIndex])}`); return; }
    setScreen("review"); setError(""); void refreshPrice(draft); window.scrollTo(0, 0);
  }

  async function submit() {
    if (!draft || !online || busy) return;
    setBusy(true); setError("");
    let working = structuredClone(draft);
    let requiresManualPricing = working.submission.snapshot?.requiresManualPricing ?? false;
    const checkpoint = async () => {
      working.updatedAt = new Date().toISOString();
      const revision = ++saveRevision.current;
      await persistDraft(structuredClone(working), revision);
      draftRef.current = working;
      setDraft(structuredClone(working));
    };
    try {
      if (!working.submission.snapshot) {
        const invalidIndex = working.windows.findIndex(validateMobileQuoteWindow);
        if (invalidIndex >= 0) throw new Error(`Window ${invalidIndex + 1}: ${validateMobileQuoteWindow(working.windows[invalidIndex])}`);
        const preflightLines = working.windows.map((window) => {
          const line = mobileQuoteLine(working, window);
          return {
            line: quoteV2PreviewLine(line),
            design: quoteV2PreviewDesign(window.families[window.activeProductId!].design),
          };
        });
        const preflight = await api<PreviewResponse>("/api/crm/mobile/quote-preview", { method: "POST", body: JSON.stringify({ lines: preflightLines }) });
        const expectedWindowIds = working.windows.map((window) => window.id);
        const preflightOutcome = mobileQuotePreflightOutcome(expectedWindowIds, preflight.lines);
        const fullyAuthoritative =
          preflightOutcome.allowed &&
          !preflightOutcome.requiresManualPricing &&
          preflight.status === "authoritative" &&
          preflight.total !== null;
        if (!fullyAuthoritative && !(preflightOutcome.allowed && preflightOutcome.requiresManualPricing)) {
          const reason = preflight.lines.find((line) => line.status !== "authoritative")?.blockedReason;
          throw new Error(reason || "Complete every product configuration until all standard products have an authoritative preview before creating the draft.");
        }
        requiresManualPricing = preflightOutcome.requiresManualPricing;
      }
      if (!working.submission.snapshot) {
        working.submission.snapshot = {
          customer: structuredClone(working.customer),
          windows: structuredClone(working.windows),
          createdAt: new Date().toISOString(),
          requiresManualPricing,
        };
        await checkpoint();
      }
      const snapshot = working.submission.snapshot;
      if (!working.submission.quoteId || !working.submission.createRevision) {
        const created = await createQuoteV2Draft(supabase, {
          customerName: snapshot.customer.name, customerPhone: snapshot.customer.phone || null,
          customerEmail: snapshot.customer.email || null, customerAddress: snapshot.customer.address || null,
          appointmentDate: snapshot.customer.appointmentDate, createdJobId: snapshot.customer.jobId,
          idempotencyKey: working.submission.createKey,
        });
        working.submission.quoteId = created.quoteId;
        working.submission.quoteNumber = created.quoteNumber;
        working.submission.createRevision = created.revision;
        await checkpoint();
      }
      const quoteId = working.submission.quoteId;
      if (!quoteId) throw new Error("The created quote identity was not retained.");
      if (!working.submission.structureRevision) {
        const operations = snapshot.windows.flatMap<QuoteV2StructureOperation>((window, index) => {
          const family = window.families[window.activeProductId!];
          const designNotes = [family.design.notes, window.notes].filter(Boolean).join(" · ") || null;
          return [
            { type: "line.create", lineItemId: window.id, patch: { roomName: [window.room, window.position].filter(Boolean).join(" · "), productType: family.productType, widthWhole: window.widthWhole, widthFraction: window.widthFraction, heightWhole: window.heightWhole, heightFraction: window.heightFraction, quantity: 1, sortOrder: index } },
            { type: "design.upsert", lineItemId: window.id, designId: family.design.id, variant: "A", selectDesign: true, patch: { ...quoteV2DesignPatch(family.design), notes: designNotes } },
          ];
        });
        const structured = await mutateQuoteV2Structure(supabase, quoteId, working.submission.createRevision!, operations, { idempotencyKey: working.submission.structureKey });
        working.submission.structureRevision = structured.revision;
        await checkpoint();
      }
      for (const window of snapshot.windows) {
        for (const photo of window.photos) {
          if (working.submission.uploadedPhotoIds.includes(photo.id)) continue;
          const form = new FormData();
          form.set("quoteId", quoteId);
          form.set("lineItemId", window.id);
          form.set("photoId", photo.id);
          form.set("file", photo.blob, photo.name);
          await api("/api/crm/mobile/quote-photos", { method: "POST", body: form });
          working.submission.uploadedPhotoIds.push(photo.id);
          await checkpoint();
        }
      }
      if (snapshot.requiresManualPricing) {
        working.submission.priceStatus = "blocked";
        working.submission.finalTotal = null;
        working.submission.completedAt = new Date().toISOString();
        await checkpoint();
        throw new Error(`Draft ${working.submission.quoteNumber || "quote"} was created as Needs pricing. Open it in the quote editor to enter the supported manual quote.`);
      }
      if (working.submission.priceStatus !== "authoritative") {
        const expectedDesigns = snapshot.windows.map((window) => ({
          lineItemId: window.id,
          designId: window.families[window.activeProductId!].design.id,
        }));
        const first = expectedDesigns[0];
        const priced = await priceQuoteV2(supabase, quoteId, { lineItemId: first.lineItemId, designId: first.designId, expectedRevision: working.submission.structureRevision!, idempotencyKey: working.submission.priceKey });
        const outcome = quoteV2PricingOutcome(priced, expectedDesigns);
        working.submission.structureRevision = outcome.expectedRevision;
        working.submission.priceStatus = outcome.priceStatus;
        working.submission.finalTotal = outcome.finalTotal;
        if (!outcome.complete) working.submission.priceKey = `mobile-price:${crypto.randomUUID()}`;
        await checkpoint();
        if (!outcome.complete) throw new Error(`Draft ${working.submission.quoteNumber || "quote"} was created, but quote-wide authoritative pricing is incomplete. Retry pricing after resolving the blocked product in the quote editor.`);
      }
      working.submission.completedAt = new Date().toISOString();
      await checkpoint();
      setScreen("success"); setSaveState("Submitted · source retained on device"); window.scrollTo(0, 0);
    } catch (reason) {
      const retention = working.submission.snapshot
        ? "The immutable local submission is retained; retry continues from its last saved stage."
        : "No server draft was created; correct the selections and try again.";
      setError(`${reason instanceof Error ? reason.message : "Submission failed."} ${retention}`);
    } finally { setBusy(false); }
  }

  async function home() {
    if (busy) return;
    const latest = draftRef.current;
    if (latest) {
      const revision = ++saveRevision.current;
      try {
        await persistDraft(latest, revision);
      } catch {
        setError("This draft could not be saved on device. Keep this page open and try again.");
        return;
      }
    }
    draftRef.current = null;
    setScreen("home"); setDraft(null); setError(""); window.scrollTo(0, 0);
  }

  if (screen === "home") return (
    <main className={`mts-quote-scope ${styles.shell}`}>
      <header className={styles.header}><a href="/crm/mobile" aria-label="Back to mobile CRM"><ArrowLeft /></a><div><small>805 SHUTTERS CRM</small><h1>Quotes</h1></div></header>
      <label className={styles.search}><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers" aria-label="Search customers" /></label>
      <nav className={styles.tabs} aria-label="Quotes">
        {(["scheduled", "today", "add", "sold"] as Tab[]).map((value) => <button key={value} aria-current={tab === value} onClick={() => { setTab(value); setQuery(""); setError(""); }}>{value === "today" ? "Today’s Quotes" : value === "add" ? "Add Quote" : value === "sold" ? "Sold Quote" : "Scheduled"}</button>)}
      </nav>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.homeContent}>
        {drafts.some((item) => isMobileQuoteDraftAccessible(item)) && <div className={styles.resume}><div className={styles.sectionTitle}><small>SAVED ON THIS DEVICE</small><h2>Resume a draft</h2></div>{drafts.filter((item) => isMobileQuoteDraftAccessible(item)).map((item) => <button className={styles.customer} key={item.id} onClick={() => { setDraft(item); setScreen(item.submission.snapshot ? "review" : "build"); setError(""); }}><span><strong>{item.customer.name}</strong><small>{item.windows.length} window{item.windows.length === 1 ? "" : "s"} · saved {new Date(item.updatedAt).toLocaleString()}</small></span><ChevronRight /></button>)}</div>}
        {(tab === "today" || tab === "scheduled") && <>
          <div className={styles.sectionTitle}><small>{tab === "today" ? `${laDate()} · Pacific time` : "Next 14 days · Pacific time"}</small><h2>{tab === "today" ? "Today’s sales consultations" : "Scheduled consultations"}</h2></div>
          {query.trim().length >= 2 && <div className={styles.searchResults}><small>Customer search results</small>{customers.map((customer) => <button className={styles.customer} key={customer.jobId} onClick={() => start({ kind: "existing", ...customer, appointmentDate: null })}><span><strong>{customer.name}</strong><small>{customer.address || "Address unavailable"}</small></span><ChevronRight /></button>)}{customerNextCursor && <button type="button" className={styles.outline} onClick={() => void loadMoreCustomers()}>Load more customers</button>}</div>}
          {appointments.length ? appointments.map((event) => <article className={styles.visit} key={event.id}><div><span>{tab === "scheduled" ? dateAndTime(event.start_at) : time(event.start_at)}</span><span className={styles.badge}>{event.status}</span></div><h3>{event.customer_name || event.title}</h3><p>{event.customer_address || event.location || "Address unavailable"}</p>{event.product_interest && <p>{event.product_interest}</p>}<button onClick={() => start({ kind: "existing", jobId: event.job_id, sourceId: event.id, name: event.customer_name || event.title, phone: event.customer_phone || "", email: event.customer_email || "", address: event.customer_address || event.location || "", appointmentDate: laDateForInstant(event.start_at) })}>{drafts.some((item) => isMobileQuoteDraftAccessible(item) && ((event.job_id && item.customer.jobId === event.job_id) || item.customer.sourceId === event.id)) ? "Resume quote" : "Start quote"}<ChevronRight /></button></article>) : <p>No scheduled sales consultations in this period.</p>}
        </>}
        {tab === "add" && <>
          <div className={styles.sectionTitle}><small>Start a quote</small><h2>Choose a verified customer or enter a new contact.</h2></div>
          {!newContact ? <>
            <p>Search above by customer name, phone, email, or address.</p>
            {customers.map((customer) => <button className={styles.customer} key={customer.jobId} onClick={() => start({ kind: "existing", ...customer, appointmentDate: null })}><span><strong>{customer.name}</strong><small>{customer.address || "Address unavailable"}</small></span><ChevronRight /></button>)}{customerNextCursor && <button type="button" className={styles.outline} onClick={() => void loadMoreCustomers()}>Load more customers</button>}
            <button className={styles.outline} onClick={() => setNewContact(true)}><Plus />Enter a new contact</button>
          </> : <form onSubmit={(event) => { event.preventDefault(); if (!contact.name.trim()) return setError("Enter the customer name."); start({ kind: "new", jobId: null, ...contact, name: contact.name.trim(), appointmentDate: null }); }} className={styles.contactForm}>
            {(["name", "address", "phone", "email"] as const).map((field) => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input required={field === "name"} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={contact[field]} onChange={(event) => setContact({ ...contact, [field]: event.target.value })} /></label>)}
            <button className={styles.primary}>Start measuring</button><button type="button" className={styles.outline} onClick={() => setNewContact(false)}>Choose existing customer</button>
          </form>}
        </>}
        {tab === "sold" && <><div className={styles.sectionTitle}><small>Current contract records</small><h2>Sold quotes</h2></div><p>Search above to view current contract records.</p><div className={styles.quickButtons} aria-label="Contract status">{["all", "sold", "approved", "ordered", "received", "installed", "invoiced", "paid"].map((status) => <button type="button" key={status} aria-pressed={soldStatus === status} onClick={() => setSoldStatus(status)}>{status === "all" ? "All statuses" : status}</button>)}</div>{contracts.flatMap((customer) => customer.contracts.filter((contract) => ["sold", "approved", "ordered", "received", "installed", "invoiced", "paid"].includes(contract.status) && (soldStatus === "all" || contract.status === soldStatus)).map((contract) => <a className={styles.customer} key={contract.id} href={`/crm/mobile/contracts?q=${encodeURIComponent(customer.name)}&quote=${encodeURIComponent(contract.id)}`}><span><strong>{customer.name}</strong><small>{contract.number || contract.label || "Contract"} · {contract.status}</small></span><ChevronRight /></a>))}</>}
      </section>
    </main>
  );

  if (!draft || !active) return null;
  if (screen === "success") return <main className={`mts-quote-scope ${styles.shell}`}><header className={styles.header}><button disabled={busy} onClick={home}><ArrowLeft /></button><div><small>805 SHUTTERS CRM</small><h1>Quote created</h1></div></header><section className={styles.success}><Check /><small>AUTHORITATIVE V2 DRAFT</small><h2>{draft.submission.quoteNumber}</h2><p>{draft.customer.name} · {draft.windows.length} windows</p><p>The local source remains on this device for recovery.</p>{draft.submission.quoteId && <a className={styles.primary} href={`/crm/quote/${encodeURIComponent(draft.submission.quoteId)}/`}>Open quote</a>}<button className={styles.primary} onClick={home}>Back to today’s quotes</button></section></main>;

  if (screen === "review") {
    const firstIssueIndex = draft.windows.findIndex(validateMobileQuoteWindow);
    const canSubmit = firstIssueIndex < 0;
    const editorHandoff = isQuoteEditorHandoffReady(draft);
    const manualRecovery = isManualQuoteEditorHandoffReady(draft);
    return <main className={`mts-quote-scope ${styles.shell}`}><header className={styles.header}><button disabled={busy} onClick={() => { if (draft.submission.snapshot) void home(); else setScreen("build"); }}><ArrowLeft /></button><div><small>ONE LAST LOOK</small><h1>Review quote</h1></div></header><section className={styles.review}>{draft.windows.map((line, index) => { const family = line.activeProductId ? line.families[line.activeProductId] : null; const issue = validateMobileQuoteWindow(line); const product = family ? catalog.find((candidate) => candidate.id === family.productId) : null; return <article key={line.id}><div><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{line.room || `Window ${index + 1}`}{line.position ? ` · ${line.position}` : ""}</h3>{family ? <><p>{product?.name || family.productType} · {line.widthWhole} {line.widthFraction !== "0" ? line.widthFraction : ""}″ × {line.heightWhole} {line.heightFraction !== "0" ? line.heightFraction : ""}″</p><p>{[family.design.supplier, family.design.material, family.design.fabric].filter(Boolean).join(" · ") || "Product details not complete"}</p></> : <p>Product not selected</p>}{line.notes && <p>{line.notes}</p>}<p>{line.price?.status === "authoritative" && line.price.fingerprint === mobileQuoteFingerprint(line) ? `${money(line.price.amount)}${online ? " verified" : " last verified · stale"}` : line.price?.status === "blocked" ? "Pricing blocked" : line.price?.status === "unpriceable" ? "Pricing unavailable" : "Price unavailable"}</p>{issue && <p className={styles.error}>{issue}</p>}<div className={styles.reviewPhotos}>{line.photos.map((photo) => <PhotoThumbnail key={photo.id} photo={photo} />)}</div></div></div>{!draft.submission.snapshot && <div className={styles.windowActions}><button onClick={() => { setDraft({ ...draft, activeWindowId: line.id }); setScreen("build"); }}>Edit window</button>{draft.windows.length > 1 && <button onClick={() => removeWindow(line.id)}>Remove window</button>}</div>}</article>; })}<div className={styles.total}><span>{draft.quotePrice?.status === "authoritative" ? online ? "Verified quote total" : "Last verified total · stale" : "Quote total"}</span><strong>{draft.quotePrice?.status === "authoritative" ? money(draft.quotePrice.amount) : "Unavailable"}</strong></div>{!canSubmit && <p className={styles.notice}>Complete window {firstIssueIndex + 1} before creating the quote.</p>}{draft.submission.snapshot && <p className={styles.notice}>Submission snapshot locked{draft.submission.quoteNumber ? ` · ${draft.submission.quoteNumber}` : ""}.{draft.submission.priceStatus && draft.submission.priceStatus !== "authoritative" ? " Needs pricing; no total is confirmed." : ""}{editorHandoff ? " Pricing requires editor follow-up; all prerequisite server stages are complete." : " Retry safely continues with saved request keys, uploaded photos, and revisions."}</p>}{!online && <p className={styles.error}><CloudOff />Reconnect to submit. Your draft remains available offline.</p>}{error && <p className={styles.error}>{error}</p>}{editorHandoff ? <a className={styles.primary} href={`/crm/quote/${encodeURIComponent(draft.submission.quoteId!)}/`}>{manualRecovery ? "Open Needs pricing draft" : "Open quote in editor"}</a> : <button className={styles.primary} disabled={!online || busy || !canSubmit} onClick={() => void submit()}>{busy ? "Saving submission…" : draft.submission.snapshot ? "Retry submission" : "Create draft quote"}</button>}</section></main>;
  }

  return <QueryClientProvider client={queryClient}><QuoteBuilderDatabaseProvider database={supabase} authoritativeV2><main className={`mts-quote-scope ${styles.shell}`}><header className={styles.header}><button disabled={busy} onClick={home}><ArrowLeft /></button><div><small>ADD QUOTE</small><h1>{draft.customer.name}</h1></div><span className={styles.save}>{online ? <Check /> : <CloudOff />}{saveState}</span></header><div className={styles.builderBar}><strong>Window {draft.windows.findIndex((line) => line.id === active.id) + 1}{active.room ? ` · ${active.room}${active.position ? ` · ${active.position}` : ""}` : ""}</strong><button onClick={() => setScreen("review")}><List />All windows ({draft.windows.length})</button></div><section className={styles.builder}>
    <div className={styles.step}><ManufacturerProductButtons products={catalog} selectedManufacturer={manufacturer} selectedProductId={active.activeProductId} onSelectManufacturer={setManufacturer} onSelectProduct={selectProduct} loading={!catalog.length} mobileProductFamily={productFamily} onSelectMobileProductFamily={setProductFamily} compactMobile /></div>
    <div className={styles.step}><div className={styles.fields}><MobileRoomSelector
      window={active}
      onSelectRoom={(room) => { setDraft((current) => current ? selectMobileQuoteRoom(current, active.id, room) : current); setError(""); }}
      onSelectBedroom={(room) => { setDraft((current) => current ? selectMobileQuoteBedroomNumber(current, active.id, room) : current); setError(""); }}
      onCustomRoomChange={(room) => { setDraft((current) => current ? updateMobileQuoteCustomRoom(current, active.id, room) : current); setError(""); }}
      onSelectLetter={(letter) => { setDraft((current) => current ? selectMobileQuoteWindowLetter(current, active.id, letter) : current); setError(""); }}
    />{(["width", "height"] as const).map((side) => { const inputId = `mobile-quote-${active.id}-${side}`; return <div className={styles.dimension} key={side}><div className={styles.wholeEntry}><div className={styles.dimensionHeader}><label htmlFor={inputId}>{side}</label><button type="button" onClick={(event) => openMeasurementGrid(side, event.currentTarget)} aria-label={`Open ${side} measurement grid`}><Grid3X3 />Grid</button></div><input id={inputId} type="number" min="0" max="1000" inputMode="numeric" value={side === "width" ? active.widthWhole : active.heightWhole} onChange={(event) => updateWindow({ [side === "width" ? "widthWhole" : "heightWhole"]: Number(event.target.value) })} /></div><div><span className={styles.fieldLabel}>Fraction</span><div className={styles.fractions}>{MOBILE_QUOTE_FRACTIONS.map((fraction) => { const selected = (side === "width" ? active.widthFraction : active.heightFraction) === fraction; return <button type="button" key={fraction} aria-pressed={selected} onClick={() => updateWindow({ [side === "width" ? "widthFraction" : "heightFraction"]: fraction })}>{fraction === "0" ? "—" : fraction}</button>; })}</div></div></div>; })}</div><div className={styles.photos}><Camera /><h3>Window photos</h3><p>Keep the frame, trim, and surroundings in view. Photos stay attached only to this window.</p><div>{active.photos.map((photo) => <PhotoThumbnail key={photo.id} photo={photo} onRemove={() => updateWindow({ photos: active.photos.filter((item) => item.id !== photo.id) })} />)}</div><button type="button" onClick={() => camera.current?.click()}><Camera />Take photo</button><button type="button" onClick={() => library.current?.click()}><FileImage />Choose file</button><input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void addPhoto(file); }} /><input ref={library} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void addPhoto(file); }} /></div></div>
    <div className={styles.step}>{activeFamily ? <SelectQuickButtonsProvider><div className={styles.designCard}><DesignCard lineItem={mobileQuoteLine(draft, active)} lineNumber={draft.windows.findIndex((line) => line.id === active.id) + 1} designs={[activeFamily.design]} authoritativeV2 mobilePresentation catalogProducts={catalog} onUpdateDesign={(design) => { if (draft.submission.snapshot) { setError("Submission is in progress. Configuration is frozen until this submission completes."); return; } setDraft(updateMobileQuoteDesign(draft, active.id, design)); }} onCopyAll={() => undefined} onCopySome={() => undefined} onStack={() => undefined} copyMode="none" isCopyTarget={false} isSelectedTarget={false} onToggleCopyTarget={() => undefined} /></div></SelectQuickButtonsProvider> : <p className={styles.notice}>Choose an exact product above to load its current production configuration controls.</p>}<label className={styles.notes}>Window notes<textarea value={active.notes} onChange={(event) => updateWindow({ notes: event.target.value })} /></label></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section><footer className={styles.footer}><div><span>{online ? "Quote so far" : "Last verified · stale"}</span><strong>{draft.quotePrice?.status === "authoritative" ? money(draft.quotePrice.amount) : "Price unavailable"}</strong></div><button onClick={saveAndNext}><Plus />Save window & next</button><button className={styles.primary} onClick={review}>Review all<ChevronRight /></button></footer></main>{measurementGrid && <MobileMeasurementGrid selection={measurementGrid} onChooseWhole={(whole) => setMeasurementGrid((current) => current ? chooseMobileQuoteGridWhole(current, whole) : current)} onCommit={commitMeasurementGrid} onClose={() => setMeasurementGrid(null)} onCloseAutoFocus={() => measurementGridTrigger.current?.focus()} />}</QuoteBuilderDatabaseProvider></QueryClientProvider>;
}

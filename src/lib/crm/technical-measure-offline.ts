"use client";

import type { TechnicalMeasureForm, TechnicalMeasureLineValues } from "@/lib/crm/technical-measures";

export type OfflineMeasureDraftPayload = {
  lines: Array<{ id: string; currentValues: TechnicalMeasureLineValues }>;
};

export type OfflineMeasureQueueEntry = {
  key: string;
  owner: string;
  formId: string;
  operation: "draft" | "submit";
  payload: OfflineMeasureDraftPayload | Record<string, never>;
  updatedAt: string;
};

type StoredRecord<T> = {
  key: string;
  owner: string;
  updatedAt: string;
  value: T;
};

const DB_NAME = "805-technical-measures";
const DB_VERSION = 1;
const LAST_OWNER_KEY = "805-technical-measures:last-owner";
const STORES = ["forms", "lists", "drafts", "queue"] as const;

function browserReady() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function normalizeOwner(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function recordKey(owner: string, id: string) {
  return `${normalizeOwner(owner)}:${id}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!browserReady()) return reject(new Error("Offline storage is unavailable."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage could not be opened."));
  });
}

async function withStore<T>(
  storeName: (typeof STORES)[number],
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Offline storage transaction failed."));
    };
  });
}

async function putRecord<T>(store: (typeof STORES)[number], record: StoredRecord<T> | OfflineMeasureQueueEntry) {
  await withStore(store, "readwrite", (objectStore) => objectStore.put(record));
}

async function getRecord<T>(store: (typeof STORES)[number], key: string) {
  return withStore<StoredRecord<T> | undefined>(store, "readonly", (objectStore) => objectStore.get(key));
}

async function deleteRecord(store: (typeof STORES)[number], key: string) {
  await withStore(store, "readwrite", (objectStore) => objectStore.delete(key));
}

async function allRecords<T>(store: (typeof STORES)[number]) {
  return withStore<T[]>(store, "readonly", (objectStore) => objectStore.getAll());
}

export function rememberOfflineMeasureOwner(owner: string) {
  const normalized = normalizeOwner(owner);
  if (typeof window !== "undefined" && normalized) window.localStorage.setItem(LAST_OWNER_KEY, normalized);
  return normalized;
}

export function lastOfflineMeasureOwner() {
  if (typeof window === "undefined") return "";
  return normalizeOwner(window.localStorage.getItem(LAST_OWNER_KEY));
}

export async function cacheTechnicalMeasureForm(owner: string, form: TechnicalMeasureForm) {
  const normalized = rememberOfflineMeasureOwner(owner);
  if (!normalized || !browserReady()) return;
  await putRecord("forms", {
    key: recordKey(normalized, form.id),
    owner: normalized,
    updatedAt: new Date().toISOString(),
    value: form,
  });
}

export async function readCachedTechnicalMeasureForm(owner: string, formId: string) {
  if (!normalizeOwner(owner) || !browserReady()) return null;
  return (await getRecord<TechnicalMeasureForm>("forms", recordKey(owner, formId)))?.value || null;
}

export async function cacheTechnicalMeasureList(owner: string, forms: Array<Record<string, unknown>>) {
  const normalized = rememberOfflineMeasureOwner(owner);
  if (!normalized || !browserReady()) return;
  await putRecord("lists", {
    key: recordKey(normalized, "all"),
    owner: normalized,
    updatedAt: new Date().toISOString(),
    value: forms,
  });
}

export async function readCachedTechnicalMeasureList(owner: string) {
  if (!normalizeOwner(owner) || !browserReady()) return [];
  return (await getRecord<Array<Record<string, unknown>>>("lists", recordKey(owner, "all")))?.value || [];
}

export function technicalMeasureDraftPayload(
  lines: Array<{ id: string; current_values: TechnicalMeasureLineValues }>,
): OfflineMeasureDraftPayload {
  return { lines: lines.map((line) => ({ id: line.id, currentValues: line.current_values })) };
}

export function applyOfflineTechnicalMeasureDraft(
  form: TechnicalMeasureForm,
  draft: OfflineMeasureDraftPayload | null,
) {
  if (!draft) return form;
  const currentById = new Map(draft.lines.map((line) => [line.id, line.currentValues]));
  return {
    ...form,
    lines: form.lines.map((line) => {
      const currentValues = currentById.get(line.id);
      return currentValues ? { ...line, current_values: currentValues } : line;
    }),
  };
}

export async function cacheTechnicalMeasureDraft(
  owner: string,
  form: TechnicalMeasureForm,
  lines: Array<{ id: string; current_values: TechnicalMeasureLineValues }>,
) {
  const normalized = rememberOfflineMeasureOwner(owner);
  if (!normalized || !browserReady()) return;
  const snapshot: TechnicalMeasureForm = {
    ...form,
    lines: form.lines.map((line) => {
      const edited = lines.find((candidate) => candidate.id === line.id);
      return edited ? { ...line, current_values: edited.current_values } : line;
    }),
  };
  await Promise.all([
    cacheTechnicalMeasureForm(normalized, snapshot),
    putRecord("drafts", {
      key: recordKey(normalized, form.id),
      owner: normalized,
      updatedAt: new Date().toISOString(),
      value: technicalMeasureDraftPayload(lines),
    }),
  ]);
}

export async function readCachedTechnicalMeasureDraft(owner: string, formId: string) {
  if (!normalizeOwner(owner) || !browserReady()) return null;
  return (await getRecord<OfflineMeasureDraftPayload>("drafts", recordKey(owner, formId)))?.value || null;
}

export async function removeCachedTechnicalMeasureDraft(owner: string, formId: string) {
  if (!normalizeOwner(owner) || !browserReady()) return;
  await deleteRecord("drafts", recordKey(owner, formId));
}

export async function queueTechnicalMeasureOperation(
  owner: string,
  formId: string,
  operation: OfflineMeasureQueueEntry["operation"],
  payload: OfflineMeasureQueueEntry["payload"],
) {
  const normalized = rememberOfflineMeasureOwner(owner);
  if (!normalized || !browserReady()) return;
  await putRecord("queue", {
    key: recordKey(normalized, `${formId}:${operation}`),
    owner: normalized,
    formId,
    operation,
    payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function removeQueuedTechnicalMeasureOperation(
  owner: string,
  formId: string,
  operation: OfflineMeasureQueueEntry["operation"],
) {
  if (!normalizeOwner(owner) || !browserReady()) return;
  await deleteRecord("queue", recordKey(owner, `${formId}:${operation}`));
}

export function technicalMeasureQueuePlan(entries: OfflineMeasureQueueEntry[]) {
  const latest = new Map<string, OfflineMeasureQueueEntry>();
  for (const entry of entries) {
    const key = `${entry.owner}:${entry.formId}:${entry.operation}`;
    const existing = latest.get(key);
    if (!existing || existing.updatedAt <= entry.updatedAt) latest.set(key, entry);
  }
  return Array.from(latest.values()).sort((left, right) => {
    if (left.formId !== right.formId) return left.updatedAt.localeCompare(right.updatedAt);
    if (left.operation === right.operation) return left.updatedAt.localeCompare(right.updatedAt);
    return left.operation === "draft" ? -1 : 1;
  });
}

export async function queuedTechnicalMeasureOperations(owner: string) {
  if (!normalizeOwner(owner) || !browserReady()) return [];
  const entries = await allRecords<OfflineMeasureQueueEntry>("queue");
  return technicalMeasureQueuePlan(entries.filter((entry) => entry.owner === normalizeOwner(owner)));
}

export async function flushTechnicalMeasureQueue(
  owner: string,
  send: (entry: OfflineMeasureQueueEntry) => Promise<TechnicalMeasureForm>,
) {
  const completed: Array<{ entry: OfflineMeasureQueueEntry; form: TechnicalMeasureForm }> = [];
  for (const entry of await queuedTechnicalMeasureOperations(owner)) {
    try {
      const form = await send(entry);
      await cacheTechnicalMeasureForm(owner, form);
      await removeQueuedTechnicalMeasureOperation(owner, entry.formId, entry.operation);
      if (entry.operation === "draft") await deleteRecord("drafts", recordKey(owner, entry.formId));
      completed.push({ entry, form });
    } catch {
      break;
    }
  }
  return completed;
}

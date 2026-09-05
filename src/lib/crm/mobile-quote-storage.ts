"use client";

import type { QuoteLabCatalogProduct } from "@/lib/quote-lab/types";
import { normalizeMobileQuoteDraft, type MobileQuoteDraft } from "./mobile-quote-draft";

const DB_NAME = "805-mobile-quotes";
const DB_VERSION = 2;
const STORE = "drafts";
const CATALOG_STORE = "catalog";

type StoredDraft = { key: string; owner: string; updatedAt: string; value: MobileQuoteDraft };

function normalizedOwner(owner: string) {
  return owner.trim().toLowerCase();
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Device storage is unavailable."));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
      if (!request.result.objectStoreNames.contains(CATALOG_STORE)) request.result.createObjectStore(CATALOG_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Device storage could not be opened."));
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    let result: T;
    let requestSucceeded = false;
    request.onsuccess = () => {
      result = request.result;
      requestSucceeded = true;
    };
    request.onerror = () => reject(request.error || new Error("Device storage request failed."));
    tx.oncomplete = () => {
      database.close();
      if (requestSucceeded) resolve(result!);
      else reject(new Error("Device storage transaction completed without saving."));
    };
    tx.onerror = () => {
      database.close();
      reject(tx.error || new Error("Device storage transaction failed."));
    };
    tx.onabort = () => {
      database.close();
      reject(tx.error || new Error("Device storage transaction was aborted."));
    };
  });
}

export async function saveMobileQuoteDraft(draft: MobileQuoteDraft) {
  const owner = normalizedOwner(draft.owner);
  if (!owner) throw new Error("A signed-in owner is required for device storage.");
  await transaction(STORE, "readwrite", (store) => store.put({ key: `${owner}:${draft.id}`, owner, updatedAt: draft.updatedAt, value: draft } satisfies StoredDraft));
}

export async function loadMobileQuoteDrafts(owner: string) {
  const normalized = normalizedOwner(owner);
  if (!normalized) return [];
  const records = await transaction<StoredDraft[]>(STORE, "readonly", (store) => store.getAll());
  return records
    .filter((record) => record.owner === normalized)
    .map((record) => normalizeMobileQuoteDraft(record.value))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function removeMobileQuoteDraft(owner: string, draftId: string) {
  const normalized = normalizedOwner(owner);
  if (!normalized) throw new Error("A signed-in owner is required for device storage.");
  await transaction(STORE, "readwrite", (store) => store.delete(`${normalized}:${draftId}`));
}

export async function saveMobileQuoteCatalog(owner: string, products: QuoteLabCatalogProduct[]) {
  const normalized = normalizedOwner(owner);
  if (!normalized) throw new Error("A signed-in owner is required for catalog storage.");
  await transaction(CATALOG_STORE, "readwrite", (store) => store.put({ key: normalized, products, verifiedAt: new Date().toISOString() }));
}

export async function loadMobileQuoteCatalog(owner: string): Promise<{ products: QuoteLabCatalogProduct[]; verifiedAt: string } | null> {
  const normalized = normalizedOwner(owner);
  if (!normalized) return null;
  const record = await transaction<{ key: string; products: QuoteLabCatalogProduct[]; verifiedAt: string } | undefined>(CATALOG_STORE, "readonly", (store) => store.get(normalized));
  return record ? { products: record.products, verifiedAt: record.verifiedAt } : null;
}

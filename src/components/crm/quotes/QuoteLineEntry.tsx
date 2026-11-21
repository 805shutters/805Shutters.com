"use client";

import { useState } from "react";
import { supabase } from "@mts/integrations/supabase/client";
import type { QuoteButtonScreenField } from "@/lib/crm/quote-button-catalog";
import { quoteButtonProductIndex } from "@/lib/crm/quote-button-product-index";
import { QuoteLineButtons, type QuoteLineChoice } from "@/components/crm/quotes/QuoteLineButtons";
import styles from "./QuoteLineButtons.module.css";

type BatchNext = {
  phase: string;
  reason: string | null;
  fields: QuoteButtonScreenField[];
  sent: false;
};

type BatchResult = {
  saved: boolean;
  sent: false;
  message: string;
  accepted?: Record<string, unknown>;
  reask: Array<{ fieldKey: string; reason: string | null }>;
  lines: QuoteLineChoice[];
  next: BatchNext;
  quote: { id: string; status: "draft"; sent: false } | null;
};

type Props = {
  quoteId?: string;
  expectedRevision?: number;
};

const products = quoteButtonProductIndex;

export function QuoteLineEntry({ quoteId, expectedRevision = 1 }: Props = {}) {
  const [productKey, setProductKey] = useState<string | null>(null);
  const [fields, setFields] = useState<QuoteButtonScreenField[]>([]);
  const [reason, setReason] = useState<string | null>(null);
  const [lines, setLines] = useState<QuoteLineChoice[]>([
    { id: "1", label: "Line 1" },
    { id: "2", label: "Line 2" },
  ]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(["1"]);
  const [customerName, setCustomerName] = useState("");
  const [reask, setReask] = useState<Array<{ fieldKey: string; reason: string | null }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [spec, setSpec] = useState<{ answers: Record<string, unknown> }>({ answers: {} });
  const product = products.find((item) => `${item.manufacturer}:${item.category}` === productKey) ?? null;

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function loadScreen(nextProduct = product, answers = spec.answers) {
    if (!nextProduct) return;
    const response = await fetch("/api/crm/quote-front-door/batch-next-field", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
      body: JSON.stringify({
        manufacturer: nextProduct.manufacturer,
        category: nextProduct.category,
        spec: { answers },
      }),
    });
    const body = await response.json() as BatchNext;
    setFields(Array.isArray(body.fields) ? body.fields : []);
    setReason(body.reason ?? null);
    setReask([]);
  }

  async function chooseProduct(key: string) {
    const next = products.find((item) => `${item.manufacturer}:${item.category}` === key);
    setProductKey(key);
    setSpec({ answers: {} });
    setMessage(null);
    if (next) await loadScreen(next, {});
  }

  async function save(picks: Record<string, unknown>) {
    if (!product || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/crm/quote-front-door/batch-validate", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          manufacturer: product.manufacturer,
          category: product.category,
          spec,
          picks,
          lines,
          applyToLineIds: selectedLineIds,
          quoteId,
          expectedRevision,
          idempotencyKey: `front-door-${crypto.randomUUID()}`,
        }),
      });
      const body = await response.json() as BatchResult;
      setMessage(body.sent === false ? body.message : "Draft quote saved.");
      setReask(Array.isArray(body.reask) ? body.reask : []);
      if (Array.isArray(body.lines) && body.lines.length) setLines(body.lines);
      if (body.next) {
        setFields(Array.isArray(body.next.fields) ? body.next.fields : []);
        setReason(body.next.reason ?? null);
      }
      if (body.quote?.status === "draft") {
        setSpec((current) => ({ answers: { ...current.answers, ...(body.accepted ?? {}) } }));
      }
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.screen} aria-label="Quote line entry">
    <header className={styles.header}>
      <h1>Line options</h1>
      <p>Button entry saves a draft. Quotes are not sent from this screen.</p>
    </header>
    <label>
      Customer name
      <input aria-label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
    </label>
    <div className={styles.choices} aria-label="Products">
      {products.map((item) => {
        const key = `${item.manufacturer}:${item.category}`;
        return <button type="button" key={key} aria-pressed={productKey === key} onClick={() => void chooseProduct(key)}>{item.manufacturer} {item.productName}</button>;
      })}
    </div>
    {product && <QuoteLineButtons
      productLabel={`${product.manufacturer} ${product.productName}`}
      fields={reask.length ? fields.filter((field) => reask.some((item) => item.fieldKey === field.fieldKey)) : fields}
      lines={lines}
      selectedLineIds={selectedLineIds}
      onToggleLine={(id) => setSelectedLineIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
      onAddLine={() => setLines((current) => [...current, { id: String(current.length + 1), label: `Line ${current.length + 1}` }])}
      onSubmit={(picks) => void save(picks)}
      reask={reask}
      saving={saving}
      message={[message, reason].filter(Boolean).join(" ")}
    />}
  </section>;
}

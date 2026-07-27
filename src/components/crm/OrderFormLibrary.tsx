"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

type OrderFormTemplate = {
  routing_key: string;
  manufacturer: string;
  product_key: string;
  product_name: string;
  product_kind: string;
  workflow: string;
  source_url: string;
  source_reference: string;
  verification: string;
  template_version: number;
  docx_url: string;
  pdf_url: string;
  schema_url: string;
};

type GeneratedPacket = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  quote_id: string | null;
  customer_id: string | null;
  contract_url: string | null;
  customer_name: string | null;
  quote_number: string | null;
  authoritative_source: string | null;
  line_item_pages: number;
};

type LibraryResponse = {
  registry_version: number;
  packet_rule: string;
  templates: OrderFormTemplate[];
  packets: GeneratedPacket[];
};

const manufacturers = ["all", "Onyx", "Norman", "Lotus", "Polar"] as const;

function status(template: OrderFormTemplate) {
  const value = template.verification.toLowerCase();
  if (value.includes("portal_mapping_required")) {
    return { label: "Mapping review", tone: "blocked" };
  }
  if (value.includes("recheck_required")) {
    return { label: "Portal recheck", tone: "review" };
  }
  return { label: "Verified", tone: "ready" };
}

function sourceLabel(value: string | null) {
  if (value === "submitted_technical_measure") return "Technical measure";
  if (value === "signed_contract") return "Signed contract";
  return "Awaiting source";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function authenticatedJson<T>(session: Session, path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "The order document library could not be loaded.");
  return body as T;
}

export function OrderFormLibrary({ session }: { session: Session }) {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [query, setQuery] = useState("");
  const [manufacturer, setManufacturer] = useState<(typeof manufacturers)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    authenticatedJson<LibraryResponse>(session, "/api/crm/order-form-templates/")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : "The order document library could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.templates || []).filter((template) => {
      if (manufacturer !== "all" && template.manufacturer !== manufacturer) return false;
      if (!normalized) return true;
      return [
        template.manufacturer,
        template.product_name,
        template.product_kind,
        template.routing_key,
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [data, manufacturer, query]);

  const counts = useMemo(() => {
    const templates = data?.templates || [];
    return Object.fromEntries(
      manufacturers.slice(1).map((name) => [
        name,
        templates.filter((template) => template.manufacturer === name).length,
      ]),
    );
  }, [data]);

  async function downloadPacket(packet: GeneratedPacket) {
    if (!packet.quote_id) return;
    setMessage(null);
    try {
      const body = await authenticatedJson<Record<string, unknown>>(
        session,
        `/api/crm/vendor-order-packets/${encodeURIComponent(packet.quote_id)}/`,
      );
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${packet.quote_number || packet.quote_id}-agentic-order-packet.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The customer order packet could not be downloaded.");
    }
  }

  return (
    <section className="crm-workspace crm-workspace-wide order-form-library">
      <header className="order-form-library-head">
        <div>
          <p className="eyebrow">Agentic Ordering</p>
          <h2>Manufacturer Order Documents</h2>
          <p>
            One authoritative template per CRM product. Signed contracts seed the customer packet;
            submitted technical measures replace the affected order values.
          </p>
        </div>
        <div className="order-form-library-summary" aria-label="Order form library summary">
          <strong>{data?.templates.length || 43}</strong>
          <span>Dedicated forms</span>
          <small>Registry v{data?.registry_version || 1}</small>
        </div>
      </header>

      {message ? <p className="crm-alert">{message}</p> : null}

      <div className="order-form-library-counts">
        {manufacturers.slice(1).map((name) => (
          <button
            type="button"
            className={manufacturer === name ? "active" : ""}
            key={name}
            onClick={() => setManufacturer(manufacturer === name ? "all" : name)}
          >
            <strong>{counts[name] || 0}</strong>
            <span>{name}</span>
          </button>
        ))}
      </div>

      <div className="order-form-library-toolbar">
        <label>
          Search documents
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product, manufacturer, or routing key"
          />
        </label>
        <label>
          Manufacturer
          <select value={manufacturer} onChange={(event) => setManufacturer(event.target.value as typeof manufacturer)}>
            {manufacturers.map((name) => (
              <option value={name} key={name}>
                {name === "all" ? "All manufacturers" : name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="crm-empty">Loading the order document library…</p> : null}
      {!loading && !visible.length ? <p className="crm-empty">No order forms match that search.</p> : null}

      <div className="order-form-library-grid">
        {visible.map((template) => {
          const verification = status(template);
          return (
            <article className="order-form-card" key={template.routing_key}>
              <div className="order-form-card-head">
                <span>{template.manufacturer}</span>
                <em className={`order-form-status order-form-status--${verification.tone}`}>
                  {verification.label}
                </em>
              </div>
              <h3>{template.product_name}</h3>
              <p>{template.product_kind}</p>
              <code>{template.routing_key}</code>
              <dl>
                <div>
                  <dt>Workflow</dt>
                  <dd>{template.workflow}</dd>
                </div>
                <div>
                  <dt>Template</dt>
                  <dd>Version {template.template_version}</dd>
                </div>
              </dl>
              <div className="order-form-card-actions">
                <a href={template.pdf_url} target="_blank" rel="noreferrer">Open form</a>
                <a href={template.docx_url} download>Download DOCX</a>
                <a href={template.schema_url} target="_blank" rel="noreferrer">Schema</a>
              </div>
              <a className="order-form-source" href={template.source_url} target="_blank" rel="noreferrer">
                Manufacturer source
              </a>
            </article>
          );
        })}
      </div>

      <section className="order-form-packets">
        <div className="order-form-packets-head">
          <div>
            <p className="eyebrow">Customer Files</p>
            <h3>Generated Agentic Order Packets</h3>
          </div>
          <span>{data?.packets.length || 0} recent</span>
        </div>
        <p>{data?.packet_rule}</p>
        {data?.packets.length ? (
          <div className="order-form-packet-list">
            {data.packets.map((packet) => (
              <article key={packet.id}>
                <div>
                  <strong>{packet.customer_name || packet.title}</strong>
                  <span>{packet.quote_number || "No quote number"} · {packet.line_item_pages} line-item pages</span>
                </div>
                <div>
                  <strong>{sourceLabel(packet.authoritative_source)}</strong>
                  <span>{dateLabel(packet.updated_at)} · {packet.status}</span>
                </div>
                <button type="button" onClick={() => void downloadPacket(packet)}>
                  Download packet
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="crm-empty">
            Packets will appear here automatically when a contract is signed and will be revised when its technical measure is submitted.
          </p>
        )}
      </section>
    </section>
  );
}

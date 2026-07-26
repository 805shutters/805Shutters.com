"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  feedbackStatusLabel,
  type CrmFeedbackRequest
} from "@/lib/crm/feedback-types";

const JESSICA_EMAIL = "jessica@805shutters.com";

async function feedbackFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const normalized = path.endsWith("/") ? path : `${path}/`;
  const response = await fetch(normalized, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Feedback request failed.");
  return body as T;
}

function JsonSummary({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return null;
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}

function FeedbackTopic({
  request,
  session,
  canSubmit,
  onChanged
}: {
  request: CrmFeedbackRequest;
  session: Session;
  canSubmit: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await feedbackFetch(session, `/api/crm/feedback/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          details: String(form.get("details") || "")
        })
      });
      setEditing(false);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Resubmission failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="crm-feedback-topic">
      <header>
        <div>
          <span className="crm-feedback-pin">Pinned until completed</span>
          <h3>{request.title}</h3>
          <p>Topic {request.id.slice(0, 8)} · revision {request.revision}</p>
        </div>
        <strong data-status={request.status}>{feedbackStatusLabel(request.status)}</strong>
      </header>

      <p className="crm-feedback-description">{request.description}</p>

      <div className="crm-feedback-thread" aria-label={`Hermes conversation for ${request.title}`}>
        {request.messages.map((message) => (
          <div className={`crm-feedback-message crm-feedback-message--${message.author_type}`} key={message.id}>
            <b>{message.author_type === "jessica" ? "Jessica" : message.author_type === "michael" ? "Michael" : "Hermes"}</b>
            <p>{message.body}</p>
            <time>{new Date(message.created_at).toLocaleString()}</time>
          </div>
        ))}
      </div>

      {request.hermes_assessment ? (
        <details className="crm-feedback-structured" open>
          <summary>Hermes structured assessment</summary>
          <JsonSummary value={request.hermes_assessment} />
        </details>
      ) : null}
      {request.proposed_work ? (
        <details className="crm-feedback-structured">
          <summary>Proposed build / fix work</summary>
          <JsonSummary value={request.proposed_work} />
        </details>
      ) : null}
      {request.verification_evidence ? (
        <details className="crm-feedback-structured">
          <summary>Verification evidence</summary>
          <JsonSummary value={request.verification_evidence} />
        </details>
      ) : null}

      {request.willie_notification_error ? (
        <p className="crm-feedback-warning">
          Willie notification needs attention: {request.willie_notification_error}
        </p>
      ) : null}

      {canSubmit && request.status === "clarifying" ? (
        editing ? (
          <form className="crm-feedback-edit" onSubmit={resubmit}>
            <label>
              Title
              <input name="title" defaultValue={request.title} minLength={3} maxLength={160} required />
            </label>
            <label>
              Full description
              <textarea name="description" defaultValue={request.description} minLength={10} rows={5} required />
            </label>
            <label>
              New details or answers for Hermes
              <textarea name="details" rows={4} placeholder="Answer Hermes's questions or add missing details…" />
            </label>
            <div>
              <button type="submit" disabled={busy}>{busy ? "Hermes is reviewing…" : "Resubmit to Hermes"}</button>
              <button type="button" className="crm-ghost-button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            </div>
            {error ? <p className="crm-feedback-warning">{error}</p> : null}
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)}>Edit / add details</button>
        )
      ) : null}
    </article>
  );
}

export function JessicaFeedbackHub({
  session,
  userEmail
}: {
  session: Session;
  userEmail: string | null | undefined;
}) {
  const [requests, setRequests] = useState<CrmFeedbackRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = userEmail?.toLowerCase() === JESSICA_EMAIL;

  const load = useCallback(async () => {
    try {
      const result = await feedbackFetch<{ requests: CrmFeedbackRequest[] }>(session, "/api/crm/feedback");
      setRequests(result.requests);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(null);
    try {
      const result = await feedbackFetch<{ requests: CrmFeedbackRequest[] }>(session, "/api/crm/feedback", {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title") || ""),
          description: String(form.get("description") || "")
        })
      });
      setRequests(result.requests);
      formElement.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-feedback-hub" aria-labelledby="crm-feedback-title">
      <div className="crm-section-head">
        <div>
          <p className="eyebrow">Jessica + Hermes</p>
          <h2 id="crm-feedback-title">CRM Communication &amp; Feedback</h2>
          <p>Active topics stay pinned here through clarification, approvals, implementation, and deployment.</p>
        </div>
        <strong>{requests.length} active</strong>
      </div>

      {canSubmit ? (
        <form className="crm-feedback-new" onSubmit={submit}>
          <label>
            Concise issue or request title
            <input name="title" minLength={3} maxLength={160} required placeholder="Example: Add vendor order follow-up reminder" />
          </label>
          <label>
            Detailed problem, desired change, or desired outcome
            <textarea
              name="description"
              minLength={10}
              maxLength={10000}
              rows={5}
              required
              placeholder="Explain what happens now, what should happen instead, and how you will know it is fixed."
            />
          </label>
          <button type="submit" disabled={busy}>{busy ? "Hermes is reviewing…" : "Submit to Hermes"}</button>
        </form>
      ) : null}

      {error ? <p className="crm-feedback-warning">{error}</p> : null}
      {loading ? <p className="crm-empty">Loading feedback topics…</p> : null}
      {!loading && !requests.length ? <p className="crm-empty">No active Jessica feedback topics.</p> : null}
      <div className="crm-feedback-topics">
        {requests.map((request) => (
          <FeedbackTopic
            request={request}
            session={session}
            canSubmit={canSubmit}
            onChanged={load}
            key={request.id}
          />
        ))}
      </div>
    </section>
  );
}

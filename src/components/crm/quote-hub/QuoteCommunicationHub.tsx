"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgePercent,
  Images,
  Mail,
  MessageCircle,
  NotebookPen,
  RefreshCw,
  Send,
  SquarePen,
  Upload,
  ExternalLink,
} from "lucide-react";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
import { supabase } from "@mts/integrations/supabase/client";
import {
  HUB_ACTIONS,
  HUB_FROM,
  hubMoney,
  hubOffer,
  hubTemplate,
  type HubAction,
  type HubConversation,
  type HubDraft,
  type HubMessage,
} from "@/lib/crm/quote-hub-model";
import styles from "./QuoteCommunicationHub.module.css";

type Props = {
  quotes: QuoteTableRow[];
  isLoading?: boolean;
  onOpenQuote: (quote: QuoteTableRow) => void;
  onChanged?: () => void;
};
const labels = {
  interested: "Still interested?",
  savings: "Offer savings",
  inspiration: "Send inspiration",
  personal: "Personal message",
};
const icons = {
  interested: MessageCircle,
  savings: BadgePercent,
  inspiration: Images,
  personal: SquarePen,
};
export type HubRequest = <T>(url: string, body?: unknown) => Promise<T>;
async function hubRequest<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${data.session?.access_token || ""}`,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload.message || "The conversation could not be updated.",
    );
  return payload as T;
}
function stamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}
function newDraft(action: HubAction, name: string): HubDraft {
  return {
    action,
    ...hubTemplate(action, name),
    percent: 10,
    photoIds: action === "inspiration" ? ["shutters"] : [],
  };
}

export function QuoteCommunicationHub({
  quotes,
  isLoading,
  onOpenQuote,
  onChanged,
  request = hubRequest,
}: Props & {
  /** Injectable only for isolated local UI tests. */ request?: HubRequest;
}) {
  const [selectedId, setSelectedId] = useState(quotes[0]?.id || "");
  const quote = quotes.find((q) => q.id === selectedId) || quotes[0];
  const [state, setState] = useState<HubConversation | null>(null);
  const [draft, setDraft] = useState<HubDraft>(
    newDraft("savings", quote?.customer_name || "Customer"),
  );
  const [prepared, setPrepared] = useState<HubMessage | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [noteOpen, setNoteOpen] = useState(false),
    [note, setNote] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(false),
    [visibleCount, setVisibleCount] = useState(25);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const drafts = useRef(new Map<string, HubDraft>()),
    generation = useRef(0),
    upload = useRef<HTMLInputElement>(null),
    bodyInput = useRef<HTMLTextAreaElement>(null);
  const url = quote
    ? `/api/crm/quote-hub/${quote.source === "sales" ? "sales" : "crm"}/${encodeURIComponent(quote.id)}`
    : "";
  const key = (action: HubAction) => `${quote?.id}:${action}`;
  const workingMessages =
    state?.messages.filter((m) => !["draft", "prepared"].includes(m.status)) ||
    [];
  const pending = workingMessages.some(
    (m) => m.status === "sending" || m.status === "unknown",
  );
  let offer = null,
    offerError = "";
  if (draft.action === "savings" && state?.basis) {
    try {
      offer = hubOffer(state.basis, draft.percent);
    } catch (e) {
      offerError = e instanceof Error ? e.message : "Review quote pricing.";
    }
  }
  const activePhotos = draft.photoIds.flatMap((id) =>
    (state?.photos || []).filter((p) => p.id === id),
  );
  const disabled = loading || busy || !state;

  function remember(next: HubDraft) {
    drafts.current.set(key(next.action), next);
    setDraft(next);
    setPrepared(null);
    setNotice("");
  }
  function update(change: Partial<HubDraft>) {
    remember({ ...draft, ...change });
  }
  async function refresh() {
    const next = await request<HubConversation>(url);
    setState(next);
    return next;
  }
  useEffect(() => {
    if (!quote) {
      setLoading(false);
      return;
    }
    const current = ++generation.current;
    setLoading(true);
    setState(null);
    setPrepared(null);
    setError("");
    setNotice("");
    setNoteOpen(false);
    setHistoryExpanded(false);
    request<HubConversation>(url, { operation: "open" })
      .then((next) => {
        if (generation.current !== current) return;
        setState(next);
        const saved = [...next.messages]
          .reverse()
          .find((m) => m.status === "draft" && m.payload.draft)?.payload.draft;
        setDraft(
          drafts.current.get(`${quote.id}:savings`) ||
            saved ||
            newDraft("savings", next.name),
        );
        const last = next.messages
          .filter((m) =>
            ["sent", "received", "unknown", "sending"].includes(m.status),
          )
          .at(-1);
        if (last)
          setActivity((a) => ({
            ...a,
            [quote.id]:
              last.status === "received"
                ? "Needs reply"
                : last.status === "sent"
                  ? "Waiting on customer"
                  : "Check delivery",
          }));
      })
      .catch((e) => {
        if (generation.current === current) setError(e.message);
      })
      .finally(() => {
        if (generation.current === current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [url, request, quote?.id]);
  useEffect(() => {
    if (bodyInput.current) {
      bodyInput.current.style.height = "auto";
      bodyInput.current.style.height = `${Math.max(180, bodyInput.current.scrollHeight + 2)}px`;
    }
  }, [draft.body, loading]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function selectAction(action: HubAction) {
    drafts.current.set(key(draft.action), draft);
    const saved = state?.messages
      .filter((m) => m.status === "draft" && m.action === action)
      .at(-1)?.payload.draft;
    remember(
      drafts.current.get(key(action)) ||
        saved ||
        newDraft(action, state?.name || "Customer"),
    );
  }
  async function sendReviewed() {
    if (!prepared) return;
    await run(async () => {
      try {
        await request(url, { operation: "send", messageId: prepared.id });
      } finally {
        setPrepared(null);
        await refresh();
      }
      setNotice("Email accepted by the 805 email provider.");
      setActivity((a) => ({ ...a, [quote!.id]: "Waiting on customer" }));
      await refresh();
      onChanged?.();
    });
  }
  async function addPhoto(file: File) {
    await run(async () => {
      const form = new FormData();
      form.set("source", quote!.source === "sales" ? "sales" : "crm");
      form.set("id", quote!.id);
      form.set("file", file);
      const result = await request<{ id: string }>(
        "/api/crm/quote-hub/photos",
        form,
      );
      await refresh();
      update({ photoIds: [...draft.photoIds, result.id].slice(0, 6) });
      setNotice("Photo added to this conversation.");
    });
  }
  if (isLoading) return <div className={styles.hub}>Loading sent quotes…</div>;
  if (!quote)
    return (
      <div className={styles.hub}>
        <h2>Sent quotes</h2>
        <p>No sent quotes yet.</p>
      </div>
    );

  return (
    <section className={styles.hub} aria-label="Sent quote communication hub">
      <header className={styles.heading}>
        <div>
          <h2>Sent quotes</h2>
          <p>A little follow-up. A real conversation.</p>
        </div>
        <span>{quotes.length} quotes</span>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.customers} aria-label="Customer conversations">
          <div className={styles.listHeading}>Customer conversations</div>
          {quotes.slice(0, visibleCount).map((q) => (
            <button
              type="button"
              className={styles.customer}
              key={q.id}
              disabled={busy}
              aria-pressed={q.id === quote.id}
              onClick={() => {
                drafts.current.set(key(draft.action), draft);
                setSelectedId(q.id);
              }}
            >
              <div>
                <strong>{q.customer_name || "Customer name missing"}</strong>
                <span>{hubMoney(Number(q.total_amount) || 0)}</span>
              </div>
              <p>
                {q.quote_number || "Quote"}
                {q.customer_address ? ` · ${q.customer_address}` : ""}
              </p>
              <small>
                {activity[q.id] ||
                  (q.sent_at
                    ? `Sent ${stamp(q.sent_at)}`
                    : "Sent date not recorded")}
              </small>
            </button>
          ))}
          {visibleCount < quotes.length && (
            <button
              className={styles.textButton}
              onClick={() => setVisibleCount((n) => n + 25)}
            >
              Show more customers
            </button>
          )}
        </aside>
        <div className={styles.detail}>
          <header className={styles.contactHead}>
            <div>
              <span className={styles.avatar}>
                {(state?.name || quote.customer_name || "?")
                  .split(" ")
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join("")}
              </span>
              <div>
                <h3>{state?.name || quote.customer_name || "Customer"}</h3>
                <p>{state?.quoteNumber || quote.quote_number} · Sent quote</p>
              </div>
            </div>
            <div className={styles.quoteTotal}>
              {hubMoney(state?.total ?? (Number(quote.total_amount) || 0))}
              <button
                className={styles.textButton}
                disabled={busy}
                onClick={() => onOpenQuote(quote)}
              >
                <ExternalLink size={13} />
                Open quote
              </button>
            </div>
          </header>
          {error && (
            <div className={styles.error} role="alert">
              {error}
              {!state && (
                <button
                  className={styles.textButton}
                  onClick={() =>
                    void run(async () => {
                      setState(
                        await request<HubConversation>(url, {
                          operation: "open",
                        }),
                      );
                    })
                  }
                >
                  Retry loading
                </button>
              )}
            </div>
          )}
          {loading && (
            <p className={styles.loading} role="status">
              Loading conversation…
            </p>
          )}
          {state && (
            <>
              <section className={styles.conversation}>
                <div className={styles.sectionLine}>
                  <span>Conversation</span>
                  <div>
                    <button
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await request<{
                            count: number;
                            more: boolean;
                          }>(url, { operation: "sync" });
                          await refresh();
                          setNotice(
                            result.more
                              ? "Replies refreshed. More mailbox history is available in Gmail."
                              : result.count
                                ? `${result.count} new replies added.`
                                : "Replies are up to date.",
                          );
                        })
                      }
                    >
                      <RefreshCw size={14} />
                      Refresh replies
                    </button>
                    <button
                      className={styles.textButton}
                      disabled={busy}
                      onClick={() => setNoteOpen(!noteOpen)}
                    >
                      <NotebookPen size={14} />
                      Add note
                    </button>
                  </div>
                </div>
                {state.sentAt && (
                  <div className={styles.event}>
                    <strong>Quote sent</strong>
                    <time>{stamp(state.sentAt)}</time>
                  </div>
                )}
                {workingMessages.length === 0 && (
                  <p className={styles.muted}>
                    Start a conversation below. Use Refresh replies to check 805
                    email.
                  </p>
                )}
                {(historyExpanded
                  ? workingMessages
                  : workingMessages.slice(-3)
                ).map((m) => (
                  <article
                    key={m.id}
                    className={`${styles.event} ${m.status === "received" ? styles.incoming : ""}`}
                  >
                    <div>
                      <strong>
                        {m.status === "received"
                          ? "Customer reply"
                          : m.action === "note"
                            ? "Internal note"
                            : labels[m.action as HubAction] || "Message"}
                      </strong>
                      <time>{stamp(m.created_at)}</time>
                    </div>
                    <small>
                      {m.status === "sent"
                        ? "Sent · accepted by email provider"
                        : m.status === "received"
                          ? m.actor_email
                          : m.status === "note"
                            ? "Only your team"
                            : m.status === "sending" || m.status === "unknown"
                              ? "Delivery needs confirmation"
                              : m.status}
                    </small>
                    <p>{m.body}</p>
                    {m.status === "received" && (
                      <button
                        className={styles.textButton}
                        onClick={() => {
                          selectAction("personal");
                          update({
                            action: "personal",
                            subject: m.subject.startsWith("Re:")
                              ? m.subject
                              : `Re: ${m.subject}`,
                            body: hubTemplate("personal", state.name).body,
                          });
                        }}
                      >
                        Reply
                      </button>
                    )}
                    {(m.status === "sending" || m.status === "unknown") && (
                      <button
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await request(url, {
                              operation: "reconcile",
                              messageId: m.id,
                            });
                            await refresh();
                            setNotice(
                              "Email accepted by the 805 email provider.",
                            );
                          })
                        }
                      >
                        Check delivery
                      </button>
                    )}
                  </article>
                ))}
                {workingMessages.length > 3 && (
                  <button
                    className={styles.textButton}
                    onClick={() => setHistoryExpanded(!historyExpanded)}
                  >
                    {historyExpanded
                      ? "Show recent messages"
                      : `Show all ${workingMessages.length} messages`}
                  </button>
                )}
                {noteOpen && (
                  <div className={styles.noteBox}>
                    <label>
                      Internal note
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={4000}
                      />
                    </label>
                    <button
                      className={styles.button}
                      disabled={busy || !note.trim()}
                      onClick={() =>
                        void run(async () => {
                          await request(url, { operation: "note", body: note });
                          setNote("");
                          setNoteOpen(false);
                          await refresh();
                        })
                      }
                    >
                      Save note
                    </button>
                  </div>
                )}
              </section>
              <section className={styles.compose}>
                <h3>What would you like to send?</h3>
                <div className={styles.actions}>
                  {HUB_ACTIONS.map((action) => {
                    const Icon = icons[action];
                    return (
                      <button
                        type="button"
                        key={action}
                        disabled={busy}
                        aria-pressed={draft.action === action}
                        onClick={() => selectAction(action)}
                      >
                        <Icon size={18} />
                        {labels[action]}
                      </button>
                    );
                  })}
                </div>
                {!state.canSend && (
                  <p className={styles.error}>{state.blockedReason}</p>
                )}
                {pending && (
                  <p className={styles.error}>
                    Check delivery of the pending email before sending another
                    message.
                  </p>
                )}
                {draft.action === "savings" && (
                  <div className={styles.offer}>
                    <div className={styles.row}>
                      <span>Choose the customer’s discount</span>
                      <small>Additional % off products</small>
                    </div>
                    <div className={styles.percentages}>
                      {[5, 10, 15].map((n) => (
                        <button
                          type="button"
                          aria-pressed={draft.percent === n}
                          disabled={busy}
                          key={n}
                          onClick={() => update({ percent: n })}
                        >
                          {n}%
                        </button>
                      ))}
                      <label>
                        Custom{" "}
                        <input
                          aria-label="Discount percentage"
                          type="number"
                          min="0.01"
                          max="50"
                          step="0.01"
                          value={
                            Number.isNaN(draft.percent) ? "" : draft.percent
                          }
                          disabled={busy}
                          onChange={(e) =>
                            update({
                              percent:
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                            })
                          }
                        />
                        %
                      </label>
                    </div>
                    {offer ? (
                      <>
                        <div className={styles.offerAmounts}>
                          <div>
                            <small>Current quote</small>
                            <s>{hubMoney(offer.originalTotal)}</s>
                          </div>
                          <div>
                            <small>Customer saves</small>
                            <strong>{hubMoney(offer.savings)}</strong>
                          </div>
                          <div>
                            <small>New offer</small>
                            <strong>{hubMoney(offer.total)}</strong>
                          </div>
                        </div>
                        <p className={styles.fine}>
                          Fees excluded from additional discount; tax
                          recalculated. The original quote is preserved.
                        </p>
                      </>
                    ) : (
                      <p className={styles.error}>
                        {offerError ||
                          "Pricing details are needed before offering savings."}
                      </p>
                    )}
                  </div>
                )}
                {draft.action === "inspiration" && (
                  <div>
                    <div className={styles.row}>
                      <span>
                        Choose photos · {draft.photoIds.length} selected
                      </span>
                      <button
                        className={styles.textButton}
                        disabled={busy || draft.photoIds.length >= 6}
                        onClick={() => upload.current?.click()}
                      >
                        <Upload size={14} />
                        Add your photos
                      </button>
                      <input
                        ref={upload}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void addPhoto(file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <div className={styles.photos}>
                      {state.photos.map((photo) => (
                        <button
                          type="button"
                          key={photo.id}
                          disabled={
                            busy ||
                            (!draft.photoIds.includes(photo.id) &&
                              draft.photoIds.length >= 6)
                          }
                          aria-pressed={draft.photoIds.includes(photo.id)}
                          onClick={() =>
                            update({
                              photoIds: draft.photoIds.includes(photo.id)
                                ? draft.photoIds.filter((id) => id !== photo.id)
                                : [...draft.photoIds, photo.id],
                            })
                          }
                        >
                          <img src={photo.url} alt={photo.title} />
                          <span>{photo.title}</span>
                          <b aria-hidden="true">
                            {draft.photoIds.includes(photo.id) ? "✓" : "+"}
                          </b>
                        </button>
                      ))}
                    </div>
                    <p className={styles.fine}>
                      Up to 6 photos. Upload JPG, PNG, or WebP, up to 2 MB each.
                    </p>
                  </div>
                )}
                <div className={styles.emailBox}>
                  <div>
                    <span>From</span>
                    <span>805 Shutters &lt;{HUB_FROM}&gt;</span>
                  </div>
                  <div>
                    <span>To</span>
                    <span>{state.email || "Customer email missing"}</span>
                  </div>
                  <div>
                    <label htmlFor="quote-hub-subject">Subject</label>
                    <input
                      id="quote-hub-subject"
                      value={draft.subject}
                      maxLength={180}
                      disabled={busy}
                      onChange={(e) => update({ subject: e.target.value })}
                    />
                  </div>
                  <textarea
                    ref={bodyInput}
                    aria-label="Email message"
                    value={draft.body}
                    maxLength={12000}
                    disabled={busy}
                    onChange={(e) => update({ body: e.target.value })}
                  />
                  {draft.action === "inspiration" && (
                    <div className={styles.attachments}>
                      {activePhotos.map((p) => (
                        <img key={p.id} src={p.url} alt={p.title} />
                      ))}
                    </div>
                  )}
                  <footer>
                    {draft.action === "savings"
                      ? "Revised offer link included"
                      : "Quote link included"}
                  </footer>
                </div>
                <div className={styles.footer}>
                  <span className={styles.muted}>
                    Only your team can see this draft
                  </span>
                  <div>
                    <button
                      className={styles.textButton}
                      disabled={disabled}
                      onClick={() =>
                        void run(async () => {
                          await request(url, { operation: "draft", draft });
                          setNotice("Draft saved.");
                          await refresh();
                        })
                      }
                    >
                      Save draft
                    </button>
                    <button
                      className={`${styles.button} ${styles.primary}`}
                      disabled={
                        disabled ||
                        !state.canSend ||
                        pending ||
                        !!offerError ||
                        (draft.action === "inspiration" &&
                          !draft.photoIds.length)
                      }
                      onClick={() =>
                        void run(async () => {
                          const reviewed = await request<HubMessage>(url, {
                            operation: "prepare",
                            draft,
                          });
                          setPrepared(reviewed);
                        })
                      }
                    >
                      <Mail size={15} />
                      {busy ? "Working…" : "Preview email"}
                    </button>
                  </div>
                </div>
                {notice && (
                  <div className={styles.notice} role="status">
                    {notice}
                  </div>
                )}
                {prepared && (
                  <section
                    className={styles.preview}
                    aria-label="Customer email preview"
                  >
                    <div className={styles.row}>
                      <h3>What your customer receives</h3>
                      <button
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() => setPrepared(null)}
                      >
                        Back to editing
                      </button>
                    </div>
                    <p className={styles.fine}>
                      To {prepared.recipient} · From {HUB_FROM}
                    </p>
                    <h4>{prepared.subject}</h4>
                    <div
                      className={styles.letter}
                      dangerouslySetInnerHTML={{
                        __html: (prepared.payload.html || "").replace(
                          /cid:photo-(\d+)/g,
                          (_m, i) =>
                            activePhotos[Number(i)]?.url
                              .replace(/&/g, "&amp;")
                              .replace(/"/g, "&quot;") || "",
                        ),
                      }}
                    />
                    <div className={styles.footer}>
                      <span className={styles.muted}>
                        Send this reviewed email immediately
                      </span>
                      <button
                        className={`${styles.button} ${styles.primary}`}
                        disabled={busy}
                        onClick={() => void sendReviewed()}
                      >
                        <Send size={15} />
                        {busy ? "Sending…" : "Send email now"}
                      </button>
                    </div>
                  </section>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

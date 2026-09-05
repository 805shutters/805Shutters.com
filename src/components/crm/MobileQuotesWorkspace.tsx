"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, ChevronRight, FileText, Search } from "lucide-react";
import type { PublicQuote } from "@/lib/crm/public-quote";
import {
  mobileQuoteStatus,
  mobileSendOutcome,
  type MobileQuoteCustomer,
  type MobileQuoteSearch,
  type MobileQuoteSummary,
  type MobileSendResult,
} from "@/lib/crm/mobile-quotes";
import styles from "./MobileQuotesWorkspace.module.css";

const CustomerContractDocument = lazy(() =>
  import("@/app/quote/[token]/CustomerContractDocument").then((module) => ({
    default: module.CustomerContractDocument,
  })),
);
const SignQuote = lazy(() =>
  import("@/app/quote/[token]/SignQuote").then((module) => ({
    default: module.SignQuote,
  })),
);

type Selection = {
  customer: MobileQuoteCustomer;
  contract: MobileQuoteSummary;
};
type Channel = "sms" | "email" | "both";
const date = (value: string | null) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
      })
    : "Date unavailable";

export function MobileQuotesWorkspace({
  session,
  title = "Quotes",
  onSessionExpired,
}: {
  session: Session;
  title?: "Quotes" | "Contracts";
  onSessionExpired: () => void;
}) {
  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [results, setResults] = useState<MobileQuoteCustomer[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [document, setDocument] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"view" | "send" | "sign">("view");
  const [channel, setChannel] = useState<Channel>("email");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [searchRevision, setSearchRevision] = useState(0);
  const [documentRevision, setDocumentRevision] = useState(0);
  const [sentAttempt, setSentAttempt] = useState(false);
  const generation = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  const searchScroll = useRef(0);
  const actionLock = useRef(false);

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path.replace(/(\?|$)/, "/$1"), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) onSessionExpired();
    if (!response.ok)
      throw new Error(
        body.message || body.error || "Request failed. Please try again.",
      );
    return body as T;
  }

  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    setResults([]);
    setSearchError("");
    setNextOffset(null);
    if (query.trim().length < 2 && !letter) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api<MobileQuoteSearch>(
          `/api/crm/mobile/quotes?q=${encodeURIComponent(query)}&letter=${letter}`,
          { signal: controller.signal },
        );
        if (version === generation.current) {
          setResults(result.results);
          setNextOffset(result.nextOffset);
        }
      } catch (reason) {
        if (!controller.signal.aborted && version === generation.current)
          setSearchError(
            reason instanceof Error ? reason.message : "Search failed.",
          );
      } finally {
        if (!controller.signal.aborted && version === generation.current)
          setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Session refresh must retry with the new access token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, letter, searchRevision, session.access_token]);

  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    setDocument(null);
    setError("");
    setDocumentLoading(true);
    api<{ quote: PublicQuote }>(
      `/api/crm/quotes/${selection.contract.id}/document`,
      { signal: controller.signal },
    )
      .then(({ quote }) => {
        if (!controller.signal.aborted) setDocument(quote);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Contract unavailable.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.contract.id, documentRevision, session.access_token]);

  useEffect(() => {
    function onBack(event: PopStateEvent) {
      const restored = event.state?.mobileQuoteSelection as
        | Selection
        | undefined;
      setSelection(restored || null);
      setDocument(null);
      setMode("view");
      setError("");
      setToken("");
      if (!restored)
        requestAnimationFrame(() => {
          searchInput.current?.focus({ preventScroll: true });
          window.scrollTo(0, searchScroll.current);
        });
    }
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  useEffect(() => {
    if (selection) {
      window.scrollTo(0, 0);
      heading.current?.focus();
    }
  }, [selection?.contract.id]);
  useEffect(() => {
    if (mode !== "view") actionHeading.current?.focus();
  }, [mode]);

  async function loadMore() {
    if (nextOffset === null || loading) return;
    const version = generation.current;
    setLoading(true);
    setSearchError("");
    try {
      const result = await api<MobileQuoteSearch>(
        `/api/crm/mobile/quotes?q=${encodeURIComponent(query)}&letter=${letter}&offset=${nextOffset}`,
      );
      if (version === generation.current) {
        setResults((previous) => [
          ...previous,
          ...result.results.filter(
            (row) => !previous.some((existing) => existing.id === row.id),
          ),
        ]);
        setNextOffset(result.nextOffset);
      }
    } catch (reason) {
      if (version === generation.current)
        setSearchError(
          reason instanceof Error ? reason.message : "Search failed.",
        );
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }
  function open(customer: MobileQuoteCustomer, contract: MobileQuoteSummary) {
    searchScroll.current = window.scrollY;
    window.history.pushState(
      { ...window.history.state, mobileQuoteSelection: { customer, contract } },
      "",
    );
    setSelection({ customer, contract });
    setDocument(null);
    setMode("view");
    setToken("");
    setError("");
    setOutcomes([]);
    setSentAttempt(false);
  }
  function back() {
    if (mode !== "view") {
      setMode("view");
      setError("");
      return;
    }
    window.history.back();
  }
  const complete = Boolean(
    document?.allPriced && document.lines.length && document.total > 0,
  );
  const canSign =
    complete &&
    !document?.signed &&
    !["archived", "lost"].includes(document?.status || "");
  async function beginSign() {
    if (!selection || !document || !canSign || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      // Only this explicit action creates a link. Viewing an unsigned draft stays read-only.
      const share = await api<{ token: string }>(
        `/api/crm/quotes/${selection.contract.id}/share`,
        { method: "POST" },
      );
      if (!share.token) throw new Error("The signing link is unavailable.");
      setToken(share.token);
      setMode("sign");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Signing unavailable.",
      );
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }
  async function send() {
    if (!selection || !document || sentAttempt || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setOutcomes([]);
    setSentAttempt(true);
    try {
      const result = await api<MobileSendResult>(
        `/api/crm/quotes/${selection.contract.id}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            channels: { email: channel !== "sms", sms: channel !== "email" },
            expectedRecipients: {
              ...(channel !== "sms" ? { email: document.customerEmail } : {}),
              ...(channel !== "email" ? { sms: document.customerPhone } : {}),
            },
          }),
        },
      );
      setOutcomes(mobileSendOutcome(result, channel));
      setDocumentRevision((value) => value + 1);
      setSearchRevision((value) => value + 1);
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "Send failed."} Sending was not confirmed. Review the result before starting another send.`,
      );
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }
  function signed() {
    setMode("view");
    setToken("");
    setOutcomes(["Contract signed successfully."]);
    setDocumentRevision((value) => value + 1);
    setSearchRevision((value) => value + 1);
  }

  const selectedSummary =
    selection &&
    (results
      .flatMap((customer) => customer.contracts)
      .find((contract) => contract.id === selection.contract.id) ||
      selection.contract);

  if (selection)
    return (
      <main className={styles.documentShell}>
        <header className={styles.toolbar}>
          <button type="button" onClick={back} disabled={busy}>
            <ArrowLeft aria-hidden="true" />
            Back
          </button>
          <span>View contract</span>
          <button
            type="button"
            disabled={!complete || busy || documentLoading}
            onClick={() => {
              setChannel(document?.customerPhone ? "sms" : "email");
              setMode("send");
              setSentAttempt(false);
              setError("");
              setOutcomes([]);
            }}
          >
            Send
          </button>
          <button
            type="button"
            disabled={!canSign || busy || documentLoading}
            onClick={() => void beginSign()}
          >
            {document?.signed ? "Signed" : "Sign"}
          </button>
        </header>
        <section className={styles.documentTitle}>
          <h1 ref={heading} tabIndex={-1}>
            {selection.customer.name}
          </h1>
          <p>
            {selection.contract.number ||
              selection.contract.label ||
              "Contract"}{" "}
            ·{" "}
            {mobileQuoteStatus(
              document?.status || selection.contract.status,
              document?.signedAt || selection.contract.signedAt,
            )}
          </p>
          {document?.signedAt && (
            <p>
              Signed {date(document.signedAt)}
              {selectedSummary?.signedBy
                ? ` by ${selectedSummary.signedBy}`
                : ""}
            </p>
          )}
        </section>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {outcomes.length > 0 && (
          <div className={styles.notice} role="status">
            {outcomes.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        )}
        {documentLoading && (
          <p className={styles.notice} role="status">
            Loading contract…
          </p>
        )}
        {!documentLoading && !document && (
          <button
            className={styles.retry}
            onClick={() => setDocumentRevision((value) => value + 1)}
          >
            Retry contract
          </button>
        )}
        {document && !complete && (
          <p className={styles.notice}>
            This contract is incomplete. Sending and signing are unavailable
            until its products and pricing are completed.
          </p>
        )}
        {document &&
          !document.signed &&
          ["archived", "lost"].includes(document.status) && (
            <p className={styles.notice}>
              This {document.status} contract is available to view and send, but
              cannot be signed here.
            </p>
          )}
        {mode === "send" && document && (
          <section
            className={styles.actionPanel}
            aria-labelledby="send-contract-heading"
          >
            <h2 id="send-contract-heading" ref={actionHeading} tabIndex={-1}>
              Send contract
            </h2>
            <p>
              {selection.customer.name} ·{" "}
              {selection.contract.number || "Contract"}
            </p>
            <fieldset disabled={busy || sentAttempt}>
              <legend>Send by</legend>
              <div className={styles.channels}>
                {(
                  [
                    ["sms", "Text"],
                    ["email", "Email"],
                    ["both", "Both"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="contract-channel"
                      value={value}
                      checked={channel === value}
                      disabled={
                        (value !== "email" && !document.customerPhone) ||
                        (value !== "sms" && !document.customerEmail)
                      }
                      onChange={() => setChannel(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {channel !== "email" && (
              <p>
                Text to:{" "}
                <strong>
                  {document.customerPhone || "No phone available"}
                </strong>
              </p>
            )}
            {channel !== "sms" && (
              <p>
                Email to:{" "}
                <strong>
                  {document.customerEmail || "No email available"}
                </strong>
                <br />
                From: 805@805shutters.com
              </p>
            )}
            <button
              className={styles.primary}
              disabled={
                busy ||
                sentAttempt ||
                (channel !== "email" && !document.customerPhone) ||
                (channel !== "sms" && !document.customerEmail)
              }
              onClick={() => void send()}
            >
              {busy
                ? "Sending…"
                : sentAttempt
                  ? "Send attempted — see result above"
                  : "Send contract"}
            </button>
            <button onClick={() => setMode("view")} disabled={busy}>
              Back to contract
            </button>
          </section>
        )}
        {mode === "sign" && document && token && (
          <section
            className={styles.actionPanel}
            aria-labelledby="sign-contract-heading"
          >
            <h2 id="sign-contract-heading" ref={actionHeading} tabIndex={-1}>
              Sign contract
            </h2>
            <Suspense fallback={<p>Loading signature form…</p>}>
              <SignQuote
                key={token}
                token={token}
                customerName={document.customerName}
                total={document.total}
                onSigned={signed}
                onBusyChange={setBusy}
                onConflict={(message) => {
                  setMode("view");
                  setToken("");
                  setOutcomes([message]);
                  setDocumentRevision((value) => value + 1);
                  setSearchRevision((value) => value + 1);
                }}
              />
            </Suspense>
          </section>
        )}
        {document && (
          <Suspense fallback={<p role="status">Loading contract layout…</p>}>
            <CustomerContractDocument
              key={`${document.id}:${documentRevision}`}
              quote={document}
              embedded
              previewOnly
              previewLabel="Contract copy"
            />
          </Suspense>
        )}
      </main>
    );

  return (
    <main className={`mobile-customer-payments ${styles.searchShell}`}>
      <header>
        <a href="/crm/mobile" aria-label="Back to mobile app">
          <ArrowLeft />
        </a>
        <div>
          <small>805 SHUTTERS CRM</small>
          <h1>{title}</h1>
        </div>
      </header>
      <label className="mobile-customer-search">
        Search customers
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer name"
          autoComplete="off"
        />
      </label>
      <div
        className="mobile-customer-letter-index"
        role="group"
        aria-label="Browse customers by first or last name"
      >
        {Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={letter === value}
            className={letter === value ? "active" : ""}
            onClick={() =>
              setLetter((current) => (current === value ? "" : value))
            }
          >
            {value}
          </button>
        ))}
      </div>
      {query.trim().length < 2 && !letter && (
        <div className={styles.empty}>
          <Search aria-hidden="true" />
          <p>
            Search a name or choose a letter to find sold and unsold contracts.
          </p>
        </div>
      )}
      {loading && <p role="status">Searching…</p>}
      {searchError && (
        <div role="alert" className="error">
          <p>{searchError}</p>
          <button onClick={() => setSearchRevision((value) => value + 1)}>
            Retry search
          </button>
        </div>
      )}
      {!loading &&
        !searchError &&
        (query.trim().length >= 2 || letter) &&
        !results.length && (
          <p>No customers with contracts matched this search.</p>
        )}
      <section aria-label="Customer contracts">
        {results.map((customer) => (
          <article key={customer.id}>
            {customer.contracts.length === 1 ? (
              <button
                className={styles.customerButton}
                onClick={() => open(customer, customer.contracts[0])}
              >
                <span>
                  <strong>{customer.name}</strong>
                  <small>{customer.address || "Address unavailable"}</small>
                  <small>
                    {mobileQuoteStatus(
                      customer.contracts[0].status,
                      customer.contracts[0].signedAt,
                    )}{" "}
                    ·{" "}
                    {customer.contracts[0].number ||
                      customer.contracts[0].label ||
                      "Contract"}{" "}
                    · {date(customer.contracts[0].createdAt)}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <>
                <h2>{customer.name}</h2>
                <p>{customer.address || "Address unavailable"}</p>
                <div className={styles.contractButtons}>
                  {customer.contracts.map((contract) => (
                    <button
                      key={contract.id}
                      onClick={() => open(customer, contract)}
                    >
                      <FileText aria-hidden="true" />
                      <span>
                        <strong>
                          {mobileQuoteStatus(
                            contract.status,
                            contract.signedAt,
                          )}
                        </strong>
                        <small>
                          {[contract.number, contract.label]
                            .filter(Boolean)
                            .join(" · ") || "Contract"}{" "}
                          · {date(contract.createdAt)}
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </article>
        ))}
      </section>
      {nextOffset !== null && (
        <button
          className={styles.loadMore}
          disabled={loading}
          onClick={() => void loadMore()}
        >
          Load more customers
        </button>
      )}
    </main>
  );
}

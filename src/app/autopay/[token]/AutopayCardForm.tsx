"use client";

// Square Web Payments SDK card form. The SDK tokenizes the card in Square's
// iframe (raw card details never touch our servers); we send the one-time
// token to /api/autopay/[token], which saves the card on file for the plan.

import { useEffect, useRef, useState } from "react";

type SquareCard = {
  attach: (selector: string) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message?: string }> }>;
};
type SquarePayments = { card: () => Promise<SquareCard> };
type SquareGlobal = { payments: (applicationId: string, locationId: string) => SquarePayments };

declare global {
  interface Window {
    Square?: SquareGlobal;
  }
}

export function AutopayCardForm({
  token,
  sdkUrl,
  applicationId,
  locationId
}: {
  token: string;
  sdkUrl: string;
  applicationId: string;
  locationId: string;
}) {
  const cardRef = useRef<SquareCard | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "done" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [savedCard, setSavedCard] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!window.Square) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = sdkUrl;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Square SDK failed to load."));
            document.head.appendChild(script);
          });
        }
        if (cancelled || !window.Square) return;
        const payments = window.Square.payments(applicationId, locationId);
        const card = await payments.card();
        if (cancelled) return;
        await card.attach("#autopay-card-container");
        cardRef.current = card;
        setState("ready");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setState("error");
          setMessage("The secure card form could not load. Please refresh, or call 805-806-9344.");
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [sdkUrl, applicationId, locationId]);

  async function submit() {
    if (!cardRef.current || state === "submitting") return;
    setState("submitting");
    setMessage(null);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== "OK" || !result.token) {
        throw new Error(result.errors?.[0]?.message || "Card details look incomplete. Please check and try again.");
      }
      const response = await fetch(`/api/autopay/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: result.token })
      });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        cardBrand?: string | null;
        cardLast4?: string | null;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "We could not save this card. Please try again.");
      }
      setSavedCard([data.cardBrand, data.cardLast4 ? `ending ${data.cardLast4}` : null].filter(Boolean).join(" "));
      setState("done");
    } catch (error) {
      setState("ready");
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="autopay-success" role="status">
        <strong>You&rsquo;re all set!</strong>
        <p>
          Your {savedCard || "card"} is saved for automatic payments. We&rsquo;ll text you a receipt reminder before
          each payment. Thank you!
        </p>
      </div>
    );
  }

  return (
    <div className="autopay-form">
      <div id="autopay-card-container" />
      {message ? (
        <p className="autopay-error" role="alert">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        className="autopay-submit"
        disabled={state !== "ready"}
        onClick={() => void submit()}
      >
        {state === "loading" ? "Loading secure form…" : state === "submitting" ? "Saving…" : "Save card for automatic payments"}
      </button>
    </div>
  );
}

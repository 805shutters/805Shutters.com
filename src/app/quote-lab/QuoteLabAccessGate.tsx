"use client";

import { useState } from "react";
import styles from "./QuoteLab.module.css";

type QuoteLabAccessGateProps = {
  onUnlocked: () => void;
  onMisconfigured: (message: string) => void;
};

export function QuoteLabAccessGate({ onUnlocked, onMisconfigured }: QuoteLabAccessGateProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/quote-lab/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        if (response.status === 503) onMisconfigured(body.error || "Quote Lab is not configured.");
        else setError(body.error || "Access was denied.");
        return;
      }
      onUnlocked();
    } catch {
      setError("The Quote Lab could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.accessPage}>
      <section className={styles.accessCard}>
        <div className={styles.labMark}>805</div>
        <p className={styles.eyebrow}>Isolated testing environment</p>
        <h1>Quote Builder</h1>
        <p>The familiar 805 workflow, backed by the new server-authoritative pricing engine. This preview cannot write production data or perform external actions.</p>
        <form onSubmit={unlock} className={styles.accessForm}>
          <label htmlFor="quote-lab-code">Access code</label>
          <input
            id="quote-lab-code"
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={busy || !code}>{busy ? "Checking…" : "Open Test Builder"}</button>
        </form>
      </section>
    </main>
  );
}

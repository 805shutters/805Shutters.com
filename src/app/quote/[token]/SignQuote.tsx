"use client";

import { useState } from "react";

export function SignQuote({ token, customerName, total }: { token: string; customerName: string; total: number }) {
  const [name, setName] = useState(customerName && customerName !== "Valued customer" ? customerName : "");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setError("Please type your full name to sign.");
      return;
    }
    if (!agree) {
      setError("Please check the authorization box to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/quote/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the exact total shown on this page so the server can reject the
        // signature if the quote was edited after we rendered it (consent guard).
        body: JSON.stringify({ printedName: name.trim(), signature: name.trim(), acknowledgedTotal: total }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || "We couldn't record your signature.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ background: "#f4f4f2", border: "1px solid #b8b6ae", borderRadius: 10, padding: 20, marginTop: 20 }}>
        <h3 style={{ margin: "0 0 6px" }}>Thank you — your order is confirmed! 🎉</h3>
        <p style={{ margin: 0 }}>We&apos;ve received your signed approval and will reach out to schedule. You can close this page.</p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #d8d8d2", borderRadius: 10, padding: 20, marginTop: 20 }}>
      <h3 style={{ marginTop: 0 }}>Approve &amp; sign</h3>
      <p style={{ fontSize: 14, opacity: 0.8 }}>
        Type your full legal name to electronically sign and approve this quote. This authorizes the order at the total shown above.
      </p>
      {error ? <p style={{ color: "#4d4d49" }}>{error}</p> : null}
      <label style={{ display: "block", marginBottom: 12 }}>
        <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Full name (your signature)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          style={{ width: "100%", maxWidth: 360, padding: "10px 12px", fontSize: 16, border: "1px solid #d8d8d2", borderRadius: 8, fontFamily: "cursive" }}
        />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, marginBottom: 16 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
        <span>I authorize 805 Shutters to proceed with this order at the total shown, and I understand a deposit may be required.</span>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{ background: "#0b0b0b", color: "#ffffff", border: "none", borderRadius: 8, padding: "12px 22px", fontSize: 16, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Submitting…" : "Sign & approve"}
      </button>
    </div>
  );
}

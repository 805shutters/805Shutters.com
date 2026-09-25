"use client";

import { useEffect, useRef, useState } from "react";
import { DrawnSignature } from "./DrawnSignature";
import { SignatureSubmissionError, submitSignature } from "./submit-signature";

export function SignQuote({ token, customerName, total, selectedLineIds, done: doneFromParent, onSigned, onBusyChange, onConflict, placement = "bottom", compact = false, disabled = false }: {
  token: string; customerName: string; total: number; selectedLineIds?: string[];
  disabled?: boolean; done?: boolean; onSigned?: () => void; onBusyChange?: (busy: boolean) => void; onConflict?: (message: string) => void; placement?: "top" | "bottom"; compact?: boolean;
}) {
  const submitting = useRef(false);
  const consentKey = JSON.stringify([token, total, selectedLineIds?.slice().sort()]);
  const [name, setName] = useState(customerName && customerName !== "Valued customer" ? customerName : "");
  const [signatureMode, setSignatureMode] = useState<"type" | "draw">("type");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localDone, setLocalDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setAgree(false); setDrawnSignature(null); }, [consentKey]);

  async function submit() {
    if (submitting.current || disabled) return;
    if (!name.trim()) {
      setError("Please type your full name to sign.");
      return;
    }
    if (signatureMode === "draw" && !drawnSignature) {
      setError("Please draw your signature or choose Type signature.");
      return;
    }
    if (!agree) {
      setError("Please check the authorization box to continue.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await submitSignature(token, {
        printedName: name.trim(), signature: signatureMode === "draw" ? drawnSignature! : name.trim(), acknowledgedTotal: total,
        ...(selectedLineIds ? { selectedLineIds } : {}),
      });
      setLocalDone(true);
      onSigned?.();
    } catch (e) {
      if (e instanceof SignatureSubmissionError && e.status === 409) onConflict?.(e.message);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const done = doneFromParent ?? localDone;

  if (done) {
    return (
      <div style={{ background: "#f4f4f2", border: "1px solid #b8b6ae", borderRadius: 10, padding: compact ? 14 : 20, marginTop: compact ? 0 : 20 }}>
        <h3 style={{ margin: "0 0 6px" }}>Your contract is signed.</h3>
        <p style={{ margin: 0 }}>Continue below to make your deposit.</p>
      </div>
    );
  }

  return (
    <div style={compact ? { margin: 0 } : { border: "1px solid #d8d8d2", borderRadius: 10, padding: 20, marginTop: 20 }}>
      {!compact ? (
        <>
          <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", opacity: 0.65 }}>
            {placement === "top" ? "Start here" : "Ready to proceed?"}
          </div>
          <h3 style={{ marginTop: 0 }}>Review &amp; sign this contract</h3>
        </>
      ) : null}
      <p style={{ margin: compact ? "0 0 10px" : undefined, fontSize: compact ? 13 : 14, lineHeight: 1.45, opacity: 0.8 }}>
        Enter your full legal name, then type or draw your signature to approve the total shown on this contract.
      </p>
      {error ? <p role="alert" style={{ color: "#4d4d49" }}>{error}</p> : null}
      <label style={{ display: "block", marginBottom: compact ? 9 : 12 }}>
        <span style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Full legal name</span>
        <input
          disabled={busy}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          style={{ width: "100%", maxWidth: compact ? "none" : 360, boxSizing: "border-box", padding: "10px 12px", fontSize: 16, border: "1px solid #d8d8d2", borderRadius: 8, fontFamily: "cursive" }}
        />
      </label>
      <fieldset disabled={busy || disabled} style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend style={{ fontSize: 13, marginBottom: 8 }}>Signature method</legend>
        {(["type", "draw"] as const).map(mode => <label key={mode} style={{ display: "inline-flex", gap: 6, marginRight: 20, padding: "8px 0" }}>
          <input type="radio" name={`signature-method-${placement}`} checked={signatureMode === mode}
            onChange={() => { setSignatureMode(mode); setDrawnSignature(null); setAgree(false); }} />
          {mode === "type" ? "Type signature" : "Draw signature"}
        </label>)}
      </fieldset>
      {signatureMode === "draw" && <DrawnSignature key={consentKey} disabled={busy || disabled} onChange={setDrawnSignature} />}
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: compact ? 12 : 14, lineHeight: 1.4, marginBottom: compact ? 12 : 16 }}>
        <input type="checkbox" disabled={busy || disabled} checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ flex: "0 0 18px", width: 18, height: 18, marginTop: 2 }} />
        <span>I have reviewed my contract and agreed to the details and terms.</span>
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy || disabled}
        style={{ width: compact ? "100%" : undefined, background: "#0b0b0b", color: "#ffffff", border: "none", borderRadius: 8, padding: "12px 22px", fontSize: 16, cursor: "pointer", opacity: busy || disabled ? 0.6 : 1 }}
      >
        {busy ? "Submitting…" : "Sign & approve"}
      </button>
    </div>
  );
}

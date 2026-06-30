"use client";

import { FormEvent, useState } from "react";
import { getCurrentAttributionParams, trackLeadEvent } from "@/lib/client-tracking";

type FormState = "idle" | "submitting" | "sent" | "error";

type LeadFormProps = {
  defaultInterest?: "consultation" | "shutters" | "shades" | "blinds" | "commercial";
  notesPlaceholder?: string;
  submitLabel?: string;
};

export function LeadForm({
  defaultInterest = "consultation",
  notesPlaceholder,
  submitLabel = "Request Consultation"
}: LeadFormProps = {}) {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const attribution = getCurrentAttributionParams();
    const payload = {
      ...Object.fromEntries(formData.entries()),
      pagePath: window.location.pathname,
      ...attribution
    };

    try {
      const response = await fetch("/api/leads/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { id?: string; message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Lead request failed.");
      }
      setState("sent");
      setMessage("Request received. We will follow up soon.");
      trackLeadEvent({
        eventId: result.id,
        interest: String(formData.get("interest") || "consultation"),
        city: String(formData.get("city") || ""),
        pagePath: window.location.pathname,
        ...attribution
      });
      event.currentTarget.reset();
      window.setTimeout(() => {
        const leadParam = result.id ? `?lead_id=${encodeURIComponent(result.id)}` : "";
        window.location.assign(`/thank-you/${leadParam}`);
      }, 500);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Lead request failed.");
    }
  }

  return (
    <form className="lead-form" onSubmit={submitLead}>
      <label className="honeypot-field" aria-hidden="true">
        Company
        <input name="company" autoComplete="off" tabIndex={-1} />
      </label>
      <div className="field-row">
        <label>
          Name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Phone
          <input name="phone" autoComplete="tel" required />
        </label>
      </div>
      <div className="field-row">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          City
          <input name="city" autoComplete="address-level2" />
        </label>
      </div>
      <label>
        Project
        <select name="interest" defaultValue={defaultInterest}>
          <option value="consultation">Free consultation</option>
          <option value="shutters">Shutters</option>
          <option value="shades">Shades</option>
          <option value="blinds">Blinds</option>
          <option value="commercial">Commercial window coverings</option>
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" rows={4} placeholder={notesPlaceholder} />
      </label>
      <button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending..." : submitLabel}
      </button>
      <p className="privacy-note">
        By submitting this form, you agree that 805 Shutters may contact you about your
        project. See our <a href="/privacy-policy/">Privacy Policy</a>.
      </p>
      {message ? <p className={`form-message ${state}`}>{message}</p> : null}
    </form>
  );
}

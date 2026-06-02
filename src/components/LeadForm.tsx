"use client";

import { FormEvent, useState } from "react";

type FormState = "idle" | "submitting" | "sent" | "error";

export function LeadForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const urlParams = new URLSearchParams(window.location.search);
    const payload = {
      ...Object.fromEntries(formData.entries()),
      pagePath: window.location.pathname,
      utm_source: urlParams.get("utm_source") || undefined,
      utm_medium: urlParams.get("utm_medium") || undefined,
      utm_campaign: urlParams.get("utm_campaign") || undefined,
      utm_content: urlParams.get("utm_content") || undefined,
      utm_term: urlParams.get("utm_term") || undefined
    };

    try {
      const response = await fetch("/api/leads/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "Lead request failed.");
      }
      setState("sent");
      setMessage("Request received. We will follow up soon.");
      event.currentTarget.reset();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Lead request failed.");
    }
  }

  return (
    <form className="lead-form" onSubmit={submitLead}>
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
        <select name="interest" defaultValue="consultation">
          <option value="consultation">Free consultation</option>
          <option value="shutters">Shutters</option>
          <option value="shades">Shades</option>
          <option value="blinds">Blinds</option>
          <option value="commercial">Commercial window coverings</option>
        </select>
      </label>
      <label>
        Notes
        <textarea name="notes" rows={4} />
      </label>
      <button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending..." : "Request Consultation"}
      </button>
      {message ? <p className={`form-message ${state}`}>{message}</p> : null}
    </form>
  );
}

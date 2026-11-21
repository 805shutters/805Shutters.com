"use client";

import { useState } from "react";
import type { QuoteButtonScreenField } from "@/lib/crm/quote-button-catalog";
import {
  appendInchDigit,
  backspaceInches,
  formatInches,
  fractionChoices,
  initialButtonPicks,
  stepInches,
  withInchFraction,
} from "@/lib/crm/quote-line-buttons";
import styles from "./QuoteLineButtons.module.css";

export type QuoteLineChoice = {
  id: string;
  label: string;
};

type Reask = {
  fieldKey: string;
  reason: string | null;
};

type Props = {
  productLabel: string;
  fields: QuoteButtonScreenField[];
  lines: QuoteLineChoice[];
  selectedLineIds: string[];
  onToggleLine: (id: string) => void;
  onAddLine?: () => void;
  onSubmit: (picks: Record<string, unknown>) => void;
  reask?: Reask[];
  saving?: boolean;
  message?: string | null;
};

export function QuoteLineButtons({
  productLabel,
  fields,
  lines,
  selectedLineIds,
  onToggleLine,
  onAddLine,
  onSubmit,
  reask = [],
  saving = false,
  message = null,
}: Props) {
  const shown = reask.length ? fields.filter((field) => reask.some((item) => item.fieldKey === field.fieldKey)) : fields;
  const signature = shown.map((field) => `${field.fieldKey}:${JSON.stringify(field.defaultValue)}`).join("|");
  const [stamp, setStamp] = useState(signature);
  const [picks, setPicks] = useState<Record<string, unknown>>(() => initialButtonPicks(shown));
  if (stamp !== signature) {
    setStamp(signature);
    setPicks(initialButtonPicks(shown));
  }
  const submit = () => {
    if (saving) return;
    const payload: Record<string, unknown> = {};
    for (const field of shown) {
      if (field.pending && field.choices.length === 0 && field.control !== "dimension" && field.control !== "quantity") continue;
      const value = picks[field.fieldKey];
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      payload[field.fieldKey] = value;
    }
    onSubmit(payload);
  };
  return <form
    className={styles.screen}
    aria-label={`${productLabel} line options`}
    onSubmit={(event) => {
      event.preventDefault();
      submit();
    }}
    onKeyDown={(event) => {
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      submit();
    }}
  >
    <header className={styles.header}>
      <div>
        <h1>{productLabel}</h1>
        <p>{reask.length ? "That choice needs another pick." : "Choose the open fields, then save the draft."}</p>
      </div>
    </header>
    {message && <p role="status">{message}</p>}
    <fieldset className={styles.lines}>
      <legend>Apply to lines</legend>
      {lines.map((line) => <label key={line.id}>
        <input
          type="checkbox"
          checked={selectedLineIds.includes(line.id)}
          onChange={() => onToggleLine(line.id)}
          aria-label={`Apply to ${line.label}`}
        />
        {line.label}
      </label>)}
      {onAddLine && <button type="button" onClick={onAddLine}>Add line</button>}
    </fieldset>
    {shown.map((field) => {
      const reason = reask.find((item) => item.fieldKey === field.fieldKey)?.reason;
      return <fieldset key={field.fieldKey} className={styles.field} data-field={field.fieldKey}>
        <legend>{field.label}{field.multi ? " · choose any" : ""}</legend>
        {reason && <p role="alert">{reason}</p>}
        {field.pending && field.choices.length === 0 ? <p>Choices not loaded yet. This field can be filled when its list arrives.</p> : null}
        {field.control === "dimension"
          ? <DimensionField field={field} value={typeof picks[field.fieldKey] === "number" ? picks[field.fieldKey] as number : null} onChange={(value) => setPicks((current) => ({ ...current, [field.fieldKey]: value }))} />
          : <div className={styles.choices}>
              {field.choices.map((choice) => {
                const pressed = isPressed(picks[field.fieldKey], choice.value, field.multi);
                return <button
                  type="button"
                  key={choice.value}
                  aria-pressed={pressed}
                  onClick={() => setPicks((current) => ({ ...current, [field.fieldKey]: nextPick(field, current[field.fieldKey], choice.value) }))}
                >{choice.label}</button>;
              })}
              {field.extras.map((extra) => <button
                type="button"
                key={extra}
                aria-pressed={picks[field.fieldKey] === extra}
                onClick={() => setPicks((current) => ({ ...current, [field.fieldKey]: extra }))}
              >{extra}</button>)}
            </div>}
      </fieldset>;
    })}
    <button type="submit" className={styles.save} disabled={saving}>{saving ? "Saving draft…" : "Save draft"}</button>
  </form>;
}

function DimensionField({ field, value, onChange }: { field: QuoteButtonScreenField; value: number | null; onChange: (value: number | null) => void }) {
  const step = field.step ?? "1/8";
  return <div className={styles.dimension}>
    <strong aria-live="polite">{formatInches(value, step) || "Set size"}</strong>
    <div className={styles.choices}>
      <button type="button" aria-label={`${field.label} minus ${step}`} onClick={() => onChange(stepInches(value, -1, step))}>− {step}</button>
      <button type="button" aria-label={`${field.label} plus ${step}`} onClick={() => onChange(stepInches(value, 1, step))}>+ {step}</button>
      {fractionChoices(step).map((fraction) => <button
        type="button"
        key={fraction.label}
        aria-pressed={fractionPressed(value, fraction.numerator, step)}
        onClick={() => onChange(withInchFraction(value, fraction.numerator, step))}
      >{fraction.label}</button>)}
    </div>
    <div className={styles.choices} aria-label={`${field.label} keypad`}>
      {Array.from({ length: 10 }, (_, digit) => <button
        type="button"
        key={digit}
        aria-label={`${field.label} digit ${digit}`}
        onClick={() => onChange(appendInchDigit(value, digit, step))}
      >{digit}</button>)}
      <button type="button" aria-label={`${field.label} backspace`} onClick={() => onChange(backspaceInches(value, step))}>Delete</button>
    </div>
  </div>;
}

function nextPick(field: QuoteButtonScreenField, current: unknown, value: string) {
  if (!field.multi) return value;
  const selected = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : [];
  if (value === "None") return ["None"];
  const withoutNone = selected.filter((item) => item !== "None");
  return withoutNone.includes(value) ? withoutNone.filter((item) => item !== value) : [...withoutNone, value];
}

function isPressed(current: unknown, value: string, multi: boolean) {
  if (multi) return Array.isArray(current) && current.includes(value);
  return current === value || current === Number(value);
}

function fractionPressed(value: number | null, numerator: number, step: "1/8" | "1/16") {
  if (value == null) return false;
  const parts = step === "1/16" ? 16 : 8;
  return Math.round(value * parts) % parts === numerator && Math.trunc(value) >= 0;
}

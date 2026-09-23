"use client";

import { DeleteIcon, Grid3X3 } from "lucide-react";
import { useEffect, useState } from "react";
import { MOBILE_QUOTE_FRACTIONS } from "@/lib/crm/mobile-quote-draft";
import styles from "./MobileMeasurementKeypad.module.css";

export type MobileMeasurementSide = "width" | "height";
export type KeypadAction = { type: "digit"; digit: number } | { type: "backspace" } | { type: "clear" };

export function applyMobileMeasurementKey(
  current: number,
  action: KeypadAction,
  replaceNext: boolean,
  max = 1000,
): { value: number; replaceNext: boolean } {
  const safeCurrent = Number.isInteger(current) && current >= 0 && current <= max ? current : 0;
  if (action.type === "clear") return { value: 0, replaceNext: false };
  if (action.type === "backspace") return { value: Math.floor(safeCurrent / 10), replaceNext: false };
  if (!Number.isInteger(action.digit) || action.digit < 0 || action.digit > 9) return { value: safeCurrent, replaceNext };
  const candidate = replaceNext ? action.digit : Number(`${safeCurrent}${action.digit}`);
  return candidate <= max
    ? { value: candidate, replaceNext: false }
    : { value: safeCurrent, replaceNext: false };
}

export function normalizeManualMeasurementWhole(value: string, max = 1000): number | null {
  if (!/^\d+$/.test(value)) return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized <= max ? normalized : null;
}

export function mobileMeasurementPatch(side: MobileMeasurementSide, whole: number) {
  return side === "width" ? { widthWhole: whole } : { heightWhole: whole };
}

function displayMeasurement(whole: number, fraction: string) {
  return `${whole}${fraction !== "0" ? ` ${fraction}` : ""}″`;
}

function isMeasurementFilled(whole: number, fraction: string) {
  return Number.isFinite(whole)
    && Number.isInteger(whole)
    && whole >= 0
    && MOBILE_QUOTE_FRACTIONS.some((value) => value === fraction)
    && (whole > 0 || fraction !== "0");
}

const QUICK_FRACTIONS = ["0", "1/4", "1/2", "3/4"];
const KEYPAD_ROWS: Array<Array<number | "backspace" | "clear">> = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ["backspace", 0, "clear"],
];

export function MobileMeasurementKeypad({
  widthWhole,
  widthFraction,
  heightWhole,
  heightFraction,
  onWholeChange,
  onFractionChange,
  onOpenGrid,
  onDone,
  onSideSelected,
  measurementAxis,
  doneLabel = "Done",
  initialSide = "width",
  fractions = MOBILE_QUOTE_FRACTIONS,
  dimensionLabel,
}: {
  widthWhole: number;
  widthFraction: string;
  heightWhole: number;
  heightFraction: string;
  onWholeChange: (side: MobileMeasurementSide, whole: number) => void;
  onFractionChange: (side: MobileMeasurementSide, fraction: string) => void;
  onOpenGrid?: (side: MobileMeasurementSide, trigger: HTMLButtonElement) => void;
  onDone?: () => void;
  onSideSelected?: (side: MobileMeasurementSide) => void;
  measurementAxis?: MobileMeasurementSide | null;
  doneLabel?: string;
  initialSide?: MobileMeasurementSide;
  fractions?: readonly string[];
  dimensionLabel?: string;
}) {
  const [activeSide, setActiveSide] = useState<MobileMeasurementSide>(measurementAxis ?? initialSide);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(true);
  const [replaceNext, setReplaceNext] = useState(true);
  const [manualValue, setManualValue] = useState(String((measurementAxis ?? initialSide) === "height" ? heightWhole : widthWhole));

  const whole = activeSide === "width" ? widthWhole : heightWhole;
  const fraction = activeSide === "width" ? widthFraction : heightFraction;

  useEffect(() => {
    setManualValue(String(whole));
  }, [activeSide, whole]);

  function selectSide(side: MobileMeasurementSide) {
    setActiveSide(side);
    onSideSelected?.(side);
    setOpen(true);
    setReplaceNext(true);
    setManualValue(String(side === "width" ? widthWhole : heightWhole));
  }

  function advanceOrDone() {
    if (activeSide === "width" && !measurementAxis) selectSide("height");
    else if (onDone) onDone();
    else setOpen(false);
  }

  function press(action: KeypadAction) {
    const next = applyMobileMeasurementKey(whole, action, replaceNext);
    setReplaceNext(next.replaceNext);
    setManualValue(String(next.value));
    if (next.value !== whole) onWholeChange(activeSide, next.value);
  }

  function changeManual(value: string) {
    if (value === "") {
      setManualValue("");
      setReplaceNext(false);
      if (whole !== 0) onWholeChange(activeSide, 0);
      return;
    }
    const normalized = normalizeManualMeasurementWhole(value);
    if (normalized === null) return;
    setManualValue(String(normalized));
    setReplaceNext(false);
    if (normalized !== whole) onWholeChange(activeSide, normalized);
  }

  const nonQuarter = !QUICK_FRACTIONS.includes(fraction) ? fraction : null;

  return <section className={styles.measurement} aria-label="Window measurements">
    <div className={styles.segments} style={measurementAxis ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined} role="group" aria-label="Choose dimension">
      {(["width", "height"] as const).filter(side => !measurementAxis || side === measurementAxis).map((side) => {
        const selected = side === activeSide;
        const sideWhole = side === "width" ? widthWhole : heightWhole;
        const sideFraction = side === "width" ? widthFraction : heightFraction;
        const filled = isMeasurementFilled(sideWhole, sideFraction);
        return <button type="button" key={side} aria-pressed={selected} data-filled={filled} onClick={() => selectSide(side)}>
          <span>{dimensionLabel ?? side}</span><strong>{displayMeasurement(sideWhole, sideFraction)}</strong>
        </button>;
      })}
    </div>
    {open && <div className={styles.editor}>
      <div className={styles.entryRow} style={!onOpenGrid ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
        <label><span>{dimensionLabel ?? activeSide} whole inches</span><input
          type="text"
          inputMode="numeric"
          enterKeyHint={activeSide === "width" && !measurementAxis ? "next" : "done"}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.repeat || event.nativeEvent.isComposing) return;
            event.preventDefault();
            advanceOrDone();
          }}
          pattern="[0-9]*"
          aria-label={`${activeSide} whole inches`}
          value={manualValue}
          onChange={(event) => changeManual(event.target.value)}
          onBlur={() => setManualValue(String(whole))}
        /></label>
        {onOpenGrid && <button type="button" className={styles.gridButton} aria-label={`Open ${activeSide} measurement grid`} onClick={(event) => {
          setReplaceNext(true);
          onOpenGrid(activeSide, event.currentTarget);
        }}><Grid3X3 /><span>Grid<br /><small>0–150</small></span></button>}
      </div>
      <div className={styles.keypad} aria-label={`${activeSide} number keypad`}>
        {KEYPAD_ROWS.flat().map((key) => <button type="button" key={key} aria-label={key === "backspace" ? "Backspace" : key === "clear" ? "Clear whole inches" : undefined} onClick={() => press(key === "backspace" ? { type: "backspace" } : key === "clear" ? { type: "clear" } : { type: "digit", digit: key })}>
          {key === "backspace" ? <DeleteIcon /> : key === "clear" ? "Clear" : key}
        </button>)}
      </div>
      <div className={styles.quickFractions} role="group" aria-label={`${activeSide} quick fractions`}>
        {QUICK_FRACTIONS.filter(value => fractions.includes(value)).map((value) => <button type="button" key={value} aria-pressed={fraction === value} disabled={whole >= 1000 && value !== "0"} onClick={() => onFractionChange(activeSide, value)}>{value === "0" ? "Even" : value}</button>)}
        <button type="button" className={styles.allButton} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{fractions.length === 8 ? "All 8ths" : "All 16ths"}{nonQuarter ? ` · ${nonQuarter}` : ""}</button>
      </div>
      {expanded && <div className={styles.allFractions} role="group" aria-label={`${activeSide} all ${fractions.length === 8 ? "eighth" : "sixteenth"} fractions`}>
        {fractions.map((value) => <button type="button" key={value} aria-pressed={fraction === value} disabled={whole >= 1000 && value !== "0"} onClick={() => onFractionChange(activeSide, value)}>{value === "0" ? "Even" : value}</button>)}
      </div>}
      <button type="button" className={styles.nextButton} onClick={advanceOrDone}>{activeSide === "width" && !measurementAxis ? "Next: height" : doneLabel}</button>
    </div>}
  </section>;
}

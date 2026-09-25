import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@mts/components/ui/dialog";
import { cn } from "@mts/lib/utils";
import { FRACTIONS } from "@mts/lib/quoteConstants";
import type { MeasurementStep } from "@mts/stores/quoteBuilderStore";
import { MobileMeasurementKeypad } from "@/components/crm/MobileMeasurementKeypad";
import calculatorStyles from "./MeasurementCalculator.module.css";

interface MeasurementGridModalProps {
  open: boolean;
  saving?: boolean;
  saveError?: string;
  showDirectEntry?: boolean;
  singleDimensionLabel?: string;
  measurementAxis?: "width" | "height" | null;
  wholeStart?: number;
  wholeEnd?: number;
  fractions?: readonly string[];
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  step: MeasurementStep;
  onWidthWhole: (n: number) => void;
  onWidthFraction: (f: string) => void;
  onHeightWhole: (n: number) => void;
  onHeightFraction: (f: string) => void;
  onDirectMeasurements?: (
    width: { whole: number; fraction: string },
    height: { whole: number; fraction: string },
    reviewedSides?: readonly ("width" | "height")[],
  ) => void;
  pendingWidth: { whole: number; fraction: string } | null;
  pendingHeight: { whole: number; fraction: string } | null;
}

export function MeasurementGridModal({
  open,
  showDirectEntry = false,
  saving = false,
  saveError,
  singleDimensionLabel,
  measurementAxis = null,
  wholeStart,
  wholeEnd,
  fractions = FRACTIONS,
  onClose,
  onCloseAutoFocus,
  step,
  onWidthWhole,
  onWidthFraction,
  onHeightWhole,
  onHeightFraction,
  onDirectMeasurements,
  pendingWidth,
  pendingHeight,
}: MeasurementGridModalProps) {
  const [directWidth, setDirectWidth] = useState("");
  const [directHeight, setDirectHeight] = useState("");
  const [directError, setDirectError] = useState("");
  const isWidth = step === "width_whole" || step === "width_fraction";
  const isFractionStep = step === "width_fraction" || step === "height_fraction";

  const label = singleDimensionLabel || (measurementAxis === "width" ? "Headrail width" : measurementAxis === "height" ? "Vane length" : isWidth ? "Width" : "Height");
  const sublabel = isFractionStep
    ? `Select fraction for ${label.toLowerCase()}`
    : `Select whole inches for ${label.toLowerCase()}`;

  const maxWholeInches = wholeEnd ?? (measurementAxis === "height" ? 120 : showDirectEntry && isWidth ? 250 : 119);
  const wholeNumbers: number[] = [];
  for (let i = wholeStart ?? 10; i <= maxWholeInches; i++) wholeNumbers.push(i);

  const handleWholeClick = (n: number) => {
    if (step === "width_whole") onWidthWhole(n);
    else if (step === "height_whole") onHeightWhole(n);
  };

  const handleFractionClick = (f: string) => {
    if (step === "width_fraction") onWidthFraction(f);
    else if (step === "height_fraction") onHeightFraction(f);
  };

  // Current value display
  const widthDisplay = pendingWidth
    ? `${pendingWidth.whole}${pendingWidth.fraction !== "0" ? " " + pendingWidth.fraction : ""}`
    : "—";
  const heightDisplay = pendingHeight
    ? `${pendingHeight.whole}${pendingHeight.fraction !== "0" ? " " + pendingHeight.fraction : ""}`
    : "—";

  useEffect(() => {
    if (!open) return;
    setDirectWidth(pendingWidth ? measurementToDecimalString(pendingWidth) : "");
    setDirectHeight(pendingHeight ? measurementToDecimalString(pendingHeight) : "");
    setDirectError("");
  }, [open, pendingWidth, pendingHeight]);

  const submitDirectMeasurements = () => {
    const measurements = parseDirectMeasurements(directWidth, directHeight, measurementAxis);
    if (!measurements) {
      setDirectError(measurementAxis === "width" ? "Enter the headrail width from 1 to 250 15/16 inches." : measurementAxis === "height" ? "Enter the vane length from 1 to 120 15/16 inches." : "Enter a width from 1 to 250 15/16 and a height from 1 to 119 15/16 inches.");
      return;
    }
    setDirectError("");
    onDirectMeasurements?.(measurements.width, measurements.height);
  };

  if (showDirectEntry && onDirectMeasurements) {
    return open ? <QuoteMeasurementCalculator
      saving={saving} saveError={saveError} measurementAxis={measurementAxis}
      pendingWidth={pendingWidth} pendingHeight={pendingHeight}
      initialSide={isWidth ? "width" : "height"} singleDimensionLabel={singleDimensionLabel}
      minWhole={wholeStart ?? 1} maxWidth={wholeEnd ?? 250} maxHeight={wholeEnd ?? (measurementAxis === "height" ? 120 : 119)} fractions={fractions}
      onClose={onClose} onCloseAutoFocus={onCloseAutoFocus} onSave={onDirectMeasurements}
    /> : null;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[760px] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{label}</DialogTitle>
            {!singleDimensionLabel && !measurementAxis ? <div className="flex items-center gap-3 text-sm">
              <span className={cn("font-medium", isWidth && "text-primary")}>
                W: {widthDisplay}"
              </span>
              <span className="text-muted-foreground">×</span>
              <span className={cn("font-medium", !isWidth && "text-primary")}>
                H: {heightDisplay}"
              </span>
            </div> : <strong className="text-sm">{measurementAxis === "height" ? heightDisplay : widthDisplay}&quot;</strong>}
          </div>
          <p className="text-sm text-muted-foreground">{sublabel}</p>
        </DialogHeader>

        {saveError ? <p role="alert" className="mt-3 text-sm font-medium text-destructive">{saveError} Your entered measurements are still here; retry the save.</p> : null}
        {saving ? <p role="status" className="mt-3 text-sm">Saving measurements…</p> : null}
        <fieldset disabled={saving} className="mt-4 min-w-0">
          {showDirectEntry ? <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 text-sm font-semibold">Enter measurements instead</div>
            <div className={cn("grid gap-3", !measurementAxis && "grid-cols-2")}>
              {measurementAxis !== "height" && <label className="text-xs font-medium text-muted-foreground">
                {measurementAxis === "width" ? "Headrail width (inches)" : "Width (inches)"}
                <input
                  aria-label="Width in inches"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="250.9375"
                  step="0.0625"
                  value={directWidth}
                  onChange={(event) => setDirectWidth(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submitDirectMeasurements()}
                  placeholder="e.g. 48.5"
                  className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>}
              {measurementAxis !== "width" && <label className="text-xs font-medium text-muted-foreground">
                {measurementAxis === "height" ? "Vane length (inches)" : "Height (inches)"}
                <input
                  aria-label="Height in inches"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max={measurementAxis === "height" ? "120.9375" : "119.9375"}
                  step="0.0625"
                  value={directHeight}
                  onChange={(event) => setDirectHeight(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submitDirectMeasurements()}
                  placeholder="e.g. 64.25"
                  className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>}
            </div>
            {measurementAxis && <p className="mt-2 text-xs text-muted-foreground">Only the {measurementAxis === "width" ? "headrail width" : "vane length"} is measured. The other dimension is not applicable. Pricing remains subject to manufacturer confirmation.</p>}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">Decimals are rounded to the nearest 1/16 inch.</span>
              <button
                type="button"
                onClick={submitDirectMeasurements}
                className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Use measurements
              </button>
            </div>
            {directError ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{directError}</p> : null}
          </div> : null}

          {/* Whole number grid */}
          {!isFractionStep && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
              {wholeNumbers.map((n) => (
                <button
                  key={n}
                  onClick={() => handleWholeClick(n)}
                  className={cn(
                    "h-11 rounded border text-sm font-medium transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    "bg-card border-border"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {/* Fraction strip */}
          {isFractionStep && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
              {fractions.map((f) => (
                <button
                  key={f}
                  onClick={() => handleFractionClick(f)}
                  className={cn(
                    "h-12 rounded-lg border text-sm font-medium transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    "bg-card border-border"
                  )}
                >
                  {f === "0" ? "0 (even)" : f}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}

function QuoteMeasurementCalculator({ saving, saveError, measurementAxis, pendingWidth, pendingHeight, onClose, onCloseAutoFocus, onSave, initialSide, singleDimensionLabel, minWhole, maxWidth, maxHeight, fractions }: {
  saving: boolean;
  saveError?: string;
  measurementAxis: "width" | "height" | null;
  pendingWidth: { whole: number; fraction: string } | null;
  pendingHeight: { whole: number; fraction: string } | null;
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSave: NonNullable<MeasurementGridModalProps["onDirectMeasurements"]>;
  initialSide: "width" | "height";
  singleDimensionLabel?: string;
  minWhole: number;
  maxWidth: number;
  maxHeight: number;
  fractions: readonly string[];
}) {
  const [width, setWidth] = useState(pendingWidth ?? { whole: 0, fraction: "0" });
  const [height, setHeight] = useState(pendingHeight ?? { whole: 0, fraction: "0" });
  const [error, setError] = useState("");
  const [reviewedSides, setReviewedSides] = useState<readonly ("width" | "height")[]>([measurementAxis ?? initialSide]);
  function save() {
    if (saving) return;
    const zero = { whole: 0, fraction: "0" };
    const parsedWidth = measurementAxis === "height" ? zero : parseDirectMeasurement(measurementToDecimalString(width), maxWidth);
    const parsedHeight = measurementAxis === "width" ? zero : parseDirectMeasurement(measurementToDecimalString(height), maxHeight);
    const values = parsedWidth && parsedHeight
      && (measurementAxis === "height" || parsedWidth.whole >= minWhole)
      && (measurementAxis === "width" || parsedHeight.whole >= minWhole)
      ? { width: parsedWidth, height: parsedHeight } : null;
    if (!values) {
      setError(measurementAxis ? `Enter ${singleDimensionLabel ?? (measurementAxis === "width" ? "headrail width" : "vane length")} from ${minWhole} to ${measurementAxis === "width" ? maxWidth : maxHeight} 15/16 inches.` : `Enter a width from ${minWhole} to ${maxWidth} 15/16 and a height from ${minWhole} to ${maxHeight} 15/16 inches.`);
      return;
    }
    setError("");
    onSave(values.width, values.height, reviewedSides);
  }
  return <Dialog open onOpenChange={open => !open && !saving && onClose()}>
    <DialogContent onCloseAutoFocus={onCloseAutoFocus} className={cn(calculatorStyles.dialog, "max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[460px] overflow-y-auto p-4 sm:p-6")}>
      <DialogHeader><DialogTitle>{singleDimensionLabel ?? (measurementAxis === "width" ? "Headrail width" : measurementAxis === "height" ? "Vane length" : "Window size")}</DialogTitle></DialogHeader>
      <fieldset disabled={saving} className="min-w-0">
        <MobileMeasurementKeypad widthWhole={width.whole} widthFraction={width.fraction}
          heightWhole={height.whole} heightFraction={height.fraction} measurementAxis={measurementAxis}
          initialSide={initialSide} fractions={fractions} dimensionLabel={singleDimensionLabel}
          onSideSelected={(side) => setReviewedSides(previous => previous.includes(side) ? previous : [...previous, side])}
          onWholeChange={(side, whole) => { setError(""); (side === "width" ? setWidth : setHeight)(previous => ({ ...previous, whole })); }}
          onFractionChange={(side, fraction) => { setError(""); (side === "width" ? setWidth : setHeight)(previous => ({ ...previous, fraction })); }}
          onDone={save} doneLabel="Save size" />
      </fieldset>
      {(error || saveError) && <p role="alert" className="text-sm text-destructive">{error || saveError} Your measurements are kept here until saved.</p>}
      {saving && <p role="status" className="text-sm">Saving measurements…</p>}
    </DialogContent>
  </Dialog>;
}

export function parseDirectMeasurement(
  rawValue: string,
  maxWholeInches: number,
): { whole: number; fraction: string } | null {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 1 || value >= maxWholeInches + 1) return null;
  const totalSixteenths = Math.round(value * 16);
  const whole = Math.floor(totalSixteenths / 16);
  const fraction = FRACTIONS[totalSixteenths % 16];
  if (whole > maxWholeInches || !fraction) return null;
  return { whole, fraction };
}

function measurementToDecimalString(measurement: { whole: number; fraction: string }): string {
  const fractionIndex = FRACTIONS.indexOf(measurement.fraction as (typeof FRACTIONS)[number]);
  const value = measurement.whole + Math.max(0, fractionIndex) / 16;
  return Number(value.toFixed(4)).toString();
}

export function parseDirectMeasurements(widthValue: string, heightValue: string, axis: "width" | "height" | null = null) {
  const zero = { whole: 0, fraction: "0" };
  const width = axis === "height" ? zero : parseDirectMeasurement(widthValue, 250);
  const height = axis === "width" ? zero : parseDirectMeasurement(heightValue, axis === "height" ? 120 : 119);
  return width && height ? { width, height } : null;
}

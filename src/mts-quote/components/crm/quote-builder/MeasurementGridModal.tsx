import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@mts/components/ui/dialog";
import { cn } from "@mts/lib/utils";
import { FRACTIONS } from "@mts/lib/quoteConstants";
import type { MeasurementStep } from "@mts/stores/quoteBuilderStore";

interface MeasurementGridModalProps {
  open: boolean;
  onClose: () => void;
  step: MeasurementStep;
  onWidthWhole: (n: number) => void;
  onWidthFraction: (f: string) => void;
  onHeightWhole: (n: number) => void;
  onHeightFraction: (f: string) => void;
  onDirectMeasurements: (
    width: { whole: number; fraction: string },
    height: { whole: number; fraction: string },
  ) => void;
  pendingWidth: { whole: number; fraction: string } | null;
  pendingHeight: { whole: number; fraction: string } | null;
}

export function MeasurementGridModal({
  open,
  onClose,
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
  const selectedWhole = isWidth ? pendingWidth?.whole : pendingHeight?.whole;
  const selectedFraction = isWidth ? pendingWidth?.fraction : pendingHeight?.fraction;

  const label = isWidth ? "Width" : "Height";
  const sublabel = isFractionStep
    ? `Select fraction for ${label.toLowerCase()}`
    : `Select whole inches for ${label.toLowerCase()}`;

  const maxWholeInches = isWidth ? 250 : 119;
  const wholeNumbers: number[] = [];
  for (let i = 10; i <= maxWholeInches; i++) wholeNumbers.push(i);

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
    const width = parseDirectMeasurement(directWidth, 250);
    const height = parseDirectMeasurement(directHeight, 119);
    if (!width || !height) {
      setDirectError("Enter a width from 1 to 250 15/16 and a height from 1 to 119 15/16 inches.");
      return;
    }
    setDirectError("");
    onDirectMeasurements(width, height);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[760px] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{label}</DialogTitle>
            <div className="flex items-center gap-3 text-sm">
              <span className={cn("font-medium", isWidth && "text-primary")}>
                W: {widthDisplay}"
              </span>
              <span className="text-muted-foreground">×</span>
              <span className={cn("font-medium", !isWidth && "text-primary")}>
                H: {heightDisplay}"
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{sublabel}</p>
        </DialogHeader>

        <div className="mt-4">
          <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-2 text-sm font-semibold">Enter measurements instead</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted-foreground">
                Width (inches)
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
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Height (inches)
                <input
                  aria-label="Height in inches"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="119.9375"
                  step="0.0625"
                  value={directHeight}
                  onChange={(event) => setDirectHeight(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submitDirectMeasurements()}
                  placeholder="e.g. 64.25"
                  className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
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
          </div>

          {/* Whole number grid */}
          {!isFractionStep && (
            <div
              className="mts-measure-whole-grid"
              data-testid="measurement-whole-number-grid"
            >
              {wholeNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleWholeClick(n)}
                  aria-pressed={n === selectedWhole}
                  className={cn(
                    "mts-measure-whole-button",
                    n === selectedWhole && "mts-measure-whole-button--selected"
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
              {FRACTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleFractionClick(f)}
                  aria-pressed={f === selectedFraction}
                  className={cn(
                    "h-12 rounded-lg border text-sm font-medium transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary",
                    "bg-card border-border",
                    f === selectedFraction && "border-foreground bg-foreground text-background"
                  )}
                >
                  {f === "0" ? "0 (even)" : f}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
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

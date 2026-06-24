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
  pendingWidth,
  pendingHeight,
}: MeasurementGridModalProps) {
  const isWidth = step === "width_whole" || step === "width_fraction";
  const isFractionStep = step === "width_fraction" || step === "height_fraction";

  const label = isWidth ? "Width" : "Height";
  const sublabel = isFractionStep
    ? `Select fraction for ${label.toLowerCase()}`
    : `Select whole inches for ${label.toLowerCase()}`;

  // Generate whole numbers 10-119
  const wholeNumbers: number[] = [];
  for (let i = 10; i <= 119; i++) wholeNumbers.push(i);

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
              {FRACTIONS.map((f) => (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

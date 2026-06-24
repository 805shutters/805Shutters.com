import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@mts/components/ui/button";
import { Check, X, Maximize2 } from "lucide-react";
import { useSignatureCanvas } from "@mts/hooks/useSignatureCanvas";

interface SignaturePadProps {
  label: string;
  onSignatureChange: (dataUrl: string | null) => void;
}

export function SignaturePad({ label, onSignatureChange }: SignaturePadProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Hook manages canvas initialization and drawing logic
  const {
    canvasRef,
    canvasProps,
    clearSignature: clearCanvasSignature,
    isCanvasEmpty,
    toDataURL,
  } = useSignatureCanvas({ active: isModalOpen });

  const handleConfirm = () => {
    if (isCanvasEmpty()) {
      return;
    }
    const dataUrl = toDataURL();
    setSignatureDataUrl(dataUrl);
    onSignatureChange(dataUrl);
    setIsModalOpen(false);
  };

  const handleClearExisting = () => {
    setSignatureDataUrl(null);
    onSignatureChange(null);
  };

  const handleClearCanvas = () => {
    clearCanvasSignature();
  };

  const signatureModal =
    isModalOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[500] flex flex-col overflow-hidden bg-white pointer-events-auto">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b bg-slate-100 p-3">
              <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClearCanvas}>
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsModalOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Canvas Container */}
            <div className="min-h-0 flex-1 bg-slate-50 p-2">
              <div className="relative h-full w-full rounded-lg border-2 border-dashed border-slate-300 bg-white">
                <canvas
                  {...canvasProps}
                  ref={canvasRef}
                  className="absolute inset-0 h-full w-full touch-none"
                  style={{
                    touchAction: "none",
                  }}
                />
                {isCanvasEmpty() && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <p className="text-lg font-medium text-slate-300">Sign here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t bg-slate-100 p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600 sm:pr-3">
                  {!isCanvasEmpty() ? "✓ Signature captured" : "Draw your signature above"}
                </p>
                <Button
                  onClick={handleConfirm}
                  disabled={isCanvasEmpty()}
                  className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-10 sm:w-auto"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirm
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {signatureDataUrl && (
          <Button type="button" variant="outline" size="sm" onClick={handleClearExisting}>
            Clear
          </Button>
        )}
      </div>

      {/* Signature Display / Tap to Sign */}
      <div
        onClick={() => !signatureDataUrl && setIsModalOpen(true)}
        className={`border-2 border-dashed rounded-lg overflow-hidden bg-white h-32 flex items-center justify-center ${
          signatureDataUrl
            ? "border-emerald-500"
            : "border-slate-400 cursor-pointer hover:border-primary"
        }`}
      >
        {signatureDataUrl ? (
          <img src={signatureDataUrl} alt="Signature" className="w-full h-full object-contain" />
        ) : (
          <div className="text-center text-muted-foreground">
            <Maximize2 className="h-6 w-6 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium">Tap to sign</p>
          </div>
        )}
      </div>

      {signatureModal}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@mts/components/ui/dialog";
import { Button } from "@mts/components/ui/button";
import { billableQuoteDesigns, incompleteQuoteLineIds } from "@/lib/quote/quote-completeness";
import { authoritativeDesignPriceIssue, quoteMerchandisePriceForEditor } from "@mts/lib/quotePricingDisplay";
import { formatDimensions, type SalesQuoteDesign, type SalesQuoteLineItem } from "@mts/types/quote";
import { LineItemPriceInput } from "./LineItemPriceInput";

export function QuotePricingReviewDialog({ open, onClose, lines, designs, authoritativeV2 = false, onSave, onEdit, onContinue, deliveryDisabled = false, createsRevision = false }: {
  open: boolean;
  onClose: () => void;
  lines: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  authoritativeV2?: boolean;
  onSave: (lineId: string, variant: string, price: number) => Promise<void>;
  onEdit: (lineId: string) => void;
  onContinue?: () => void;
  deliveryDisabled?: boolean;
  createsRevision?: boolean;
}) {
  const [dirtyPrices, setDirtyPrices] = useState<Set<string>>(new Set());
  useEffect(() => { if (!open) setDirtyPrices(new Set()); }, [open]);
  const incomplete = incompleteQuoteLineIds(lines, designs, authoritativeV2);
  const ready = lines.length > 0 && incomplete.length === 0 && dirtyPrices.size === 0;
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Custom prices</DialogTitle>
        <DialogDescription>Enter a custom merchandise price for any line, even when catalog pricing is unavailable. Save each changed price, then continue to review delivery. Installation and shipping are added separately when applicable.</DialogDescription>
      </DialogHeader>
      {createsRevision && <p className="text-sm">Saving a price creates an editable draft revision and preserves the original quote.</p>}
      <p role="status">{incomplete.length > 0 ? `${incomplete.length} ${incomplete.length === 1 ? "line still needs" : "lines still need"} a price.` : lines.length === 0 ? "Add a line before entering prices." : dirtyPrices.size > 0 ? "Save your changed prices before continuing." : "Every line has a saved price. Ready to review delivery."}</p>
      {lines.flatMap(line => {
        const billable = billableQuoteDesigns(designs.filter(row => row.line_item_id === line.id), authoritativeV2);
        return (billable.length ? billable : [undefined]).map(design => {
          const room = `${line.room_name || "Unnamed room"}${billable.length > 1 ? ` · Option ${design?.variant}` : ""}`;
          const needsPrice = incompleteQuoteLineIds([line], design ? [design] : [], authoritativeV2).length > 0;
          const issue = needsPrice ? authoritativeDesignPriceIssue(design) : null;
          const priceKey = `${line.id}-${design?.variant ?? "A"}`;
          return <section key={`${line.id}-${design?.variant ?? "A"}`} aria-label={`Pricing for ${room}`} className="space-y-3 rounded-lg border p-4">
            <div><h3 className="font-semibold">{room} · {line.product_type}</h3>
              <p className="text-sm text-muted-foreground">{formatDimensions(line)} · Quantity {line.quantity}</p></div>
            {issue && <p className="text-sm text-amber-900">{issue}</p>}
            <Button variant="outline" onClick={() => onEdit(line.id)}>Edit selections for {room}</Button>
            {billable.length > 1 && <p className="text-sm text-muted-foreground">Saving a custom price selects this option for this line.</p>}
          <LineItemPriceInput value={needsPrice || !design ? null : quoteMerchandisePriceForEditor(design)} roomName={room} label="Custom merchandise price each"
              onDirtyChange={dirty => setDirtyPrices(previous => {
                const next = new Set(previous);
                if (dirty) next.add(priceKey); else next.delete(priceKey);
                return next;
              })}
              onSave={price => onSave(line.id, design?.variant ?? "A", price)} />
          </section>;
        });
      })}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white pt-3">
        <Button variant="outline" onClick={onClose}>Close pricing review</Button>
        {onContinue && <Button disabled={!ready || deliveryDisabled} onClick={() => { if (ready && !deliveryDisabled) onContinue(); }}>Continue to Send Quote</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}

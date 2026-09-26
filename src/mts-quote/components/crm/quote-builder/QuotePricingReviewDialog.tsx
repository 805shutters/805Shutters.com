import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@mts/components/ui/dialog";
import { Button } from "@mts/components/ui/button";
import { billableQuoteDesigns, incompleteQuoteLineIds } from "@/lib/quote/quote-completeness";
import { authoritativeDesignPriceIssue } from "@mts/lib/quotePricingDisplay";
import { formatDimensions, type SalesQuoteDesign, type SalesQuoteLineItem } from "@mts/types/quote";
import { LineItemPriceInput } from "./LineItemPriceInput";

export function QuotePricingReviewDialog({ open, onClose, lines, designs, authoritativeV2 = false, onSave, onEdit }: {
  open: boolean;
  onClose: () => void;
  lines: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  authoritativeV2?: boolean;
  onSave: (lineId: string, variant: string, price: number) => Promise<void>;
  onEdit: (lineId: string) => void;
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Finish pricing</DialogTitle>
        <DialogDescription>Complete the selections or enter an agreed custom price for each unpriced line. Installation and shipping are added separately when applicable.</DialogDescription>
      </DialogHeader>
      {lines.length === 0 ? <p role="status">Every line has a price. Close this window, then choose Send Quote to review delivery.</p> : lines.flatMap(line => {
        const billable = billableQuoteDesigns(designs.filter(row => row.line_item_id === line.id), authoritativeV2);
        const unpriced = billable.filter(design => incompleteQuoteLineIds([line], [design], authoritativeV2).length > 0);
        return (billable.length ? unpriced : [undefined]).map(design => {
          const room = `${line.room_name || "Unnamed room"}${billable.length > 1 ? ` · Option ${design?.variant}` : ""}`;
          const issue = authoritativeDesignPriceIssue(design);
          return <section key={`${line.id}-${design?.variant ?? "A"}`} aria-label={`Pricing for ${room}`} className="space-y-3 rounded-lg border p-4">
            <div><h3 className="font-semibold">{room} · {line.product_type}</h3>
              <p className="text-sm text-muted-foreground">{formatDimensions(line)} · Quantity {line.quantity}</p></div>
            <p className="text-sm text-amber-900">{issue || "This line needs a price before sending."}</p>
            <Button variant="outline" onClick={() => onEdit(line.id)}>Edit selections for {room}</Button>
            {billable.length > 1 && <p className="text-sm text-muted-foreground">Saving a custom price selects this option for this line.</p>}
          <LineItemPriceInput value={null} roomName={room} label="Custom merchandise price each"
              onSave={price => onSave(line.id, design?.variant ?? "A", price)} />
          </section>;
        });
      })}
      <Button variant="outline" onClick={onClose}>Close pricing review</Button>
    </DialogContent>
  </Dialog>;
}

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mts/components/ui/dialog";
import { Input } from "@mts/components/ui/input";
import { Label } from "@mts/components/ui/label";
import { Button } from "@mts/components/ui/button";
import { QUOTE_ACCOUNTS } from "@mts/lib/quoteConstants";
import { cn } from "@mts/lib/utils";

type QuoteAccountOption = (typeof QUOTE_ACCOUNTS)[number];

interface NewQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewQuoteData) => void;
  isPending?: boolean;
  accountOptions?: readonly QuoteAccountOption[];
}

export interface NewQuoteData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerEmail: string;
  accountId: string;
}

export function NewQuoteDialog({
  open,
  onClose,
  onSubmit,
  isPending,
  accountOptions = QUOTE_ACCOUNTS,
}: NewQuoteDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const submitForAccount = (accountId: string) => {
    if (!customerName.trim() || isPending) return;
    onSubmit({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerAddress: customerAddress.trim(),
      customerEmail: customerEmail.trim(),
      accountId,
    });
  };

  const handleClose = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerEmail("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">New Quote</DialogTitle>
          <DialogDescription>
            Enter the customer details, then choose the quoting account to create the quote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Customer Name */}
          <div className="space-y-1.5">
            <Label htmlFor="nq-name">Customer Name *</Label>
            <Input
              id="nq-name"
              placeholder="Full name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="nq-phone">Phone</Label>
            <Input
              id="nq-phone"
              placeholder="(555) 555-5555"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="nq-address">Address</Label>
            <Input
              id="nq-address"
              placeholder="Street, City, State ZIP"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="nq-email">Email</Label>
            <Input
              id="nq-email"
              type="email"
              placeholder="email@example.com"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          {/* Account Selection — submit buttons */}
          <div className="space-y-2 pt-2">
            <Label>Start quote for *</Label>
            <div className="flex gap-3">
              {accountOptions.map((account) => (
                <Button
                  key={account.id}
                  type="button"
                  disabled={!customerName.trim() || isPending}
                  onClick={() => {
                    submitForAccount(account.id);
                  }}
                  className={cn(
                    "flex-1 py-6 text-base font-semibold transition-all",
                    account.prefix === "805"
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white"
                  )}
                >
                  {account.name}
                </Button>
              ))}
            </div>
            {!customerName.trim() && (
              <p className="text-xs text-muted-foreground">Enter a customer name to continue</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

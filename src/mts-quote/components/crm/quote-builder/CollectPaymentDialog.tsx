/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@mts/components/ui/dialog";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { Label } from "@mts/components/ui/label";
import { Banknote, Check, CreditCard, DollarSign, Zap, FileText } from "lucide-react";
import { cn } from "@mts/lib/utils";
import type { SalesQuote } from "@mts/types/quote";

type PaymentMethod = "Zelle" | "Cash" | "Check" | "Credit Card";

const METHODS: { value: PaymentMethod; icon: typeof Zap; color: string }[] = [
  { value: "Zelle", icon: Zap, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "Cash", icon: Banknote, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "Check", icon: FileText, color: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "Credit Card", icon: CreditCard, color: "bg-amber-100 text-amber-700 border-amber-200" },
];

interface CollectPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  quote: SalesQuote;
  /**
   * Which payment slot to collect:
   *  - "deposit" = up-front deposit at order time
   *  - "balance" = COD at install (default, since that's the install trigger)
   */
  mode?: "deposit" | "balance";
}

export function CollectPaymentDialog({
  open,
  onClose,
  quote,
  mode = "balance",
}: CollectPaymentDialogProps) {
  const queryClient = useQueryClient();

  const expectedBalance = useMemo(() => {
    const total = Number(quote.total_amount) || 0;
    const deposit = Number(quote.deposit_paid) || 0;
    const balancePaid = Number(quote.balance_paid) || 0;
    if (mode === "deposit") {
      return Math.max(0, total - deposit);
    }
    return Math.max(0, total - deposit - balancePaid);
  }, [quote, mode]);

  const [amount, setAmount] = useState<string>(() => expectedBalance.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>(
    (quote.payment_method as PaymentMethod) ?? "Zelle"
  );

  const canSubmit = parseFloat(amount) > 0 && !!method;

  const collectPayment = useMutation({
    mutationFn: async () => {
      const n = parseFloat(amount);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Amount must be greater than zero");

      const patch: Record<string, unknown> = { payment_method: method };
      if (mode === "deposit") {
        patch.deposit_paid = (Number(quote.deposit_paid) || 0) + n;
      } else {
        patch.balance_paid = (Number(quote.balance_paid) || 0) + n;
      }

      const { error } = await (supabase as any)
        .from("sales_quotes")
        .update(patch)
        .eq("id", quote.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      toast.success(
        mode === "deposit"
          ? `Deposit recorded ($${amount} ${method})`
          : `Payment recorded ($${amount} ${method})`
      );
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record payment");
    },
  });

  const triggersInstall =
    mode === "balance" &&
    (Number(quote.deposit_paid) || 0) +
      (Number(quote.balance_paid) || 0) +
      parseFloat(amount || "0") >=
      (Number(quote.total_amount) || 0) - 0.01 &&
    quote.status === "received";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            {mode === "deposit" ? "Collect Deposit" : "Collect COD Payment"}
          </DialogTitle>
          <DialogDescription>
            Quote <span className="font-mono">#{quote.quote_number}</span>
            {" — "}
            {quote.customer_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Expected amount hint */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-medium tabular-nums">
                ${Number(quote.total_amount || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Deposit paid</span>
              <span className="font-medium tabular-nums">
                ${Number(quote.deposit_paid || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Balance paid</span>
              <span className="font-medium tabular-nums">
                ${Number(quote.balance_paid || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-1 mt-1 border-t border-slate-200">
              <span className="text-slate-700 font-semibold">
                {mode === "deposit" ? "Deposit remaining" : "Balance due"}
              </span>
              <span className="font-bold tabular-nums text-slate-900">
                ${expectedBalance.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-amount" className="text-sm">
              Amount collected
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                $
              </span>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 text-lg font-semibold tabular-nums"
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const active = method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      active
                        ? cn(m.color, "ring-2 ring-offset-1 ring-[#0b0b0b]/40")
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {m.value}
                    {active && <Check className="h-4 w-4 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          {triggersInstall && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2">
              <Check className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This will fully pay the balance — quote will auto-advance from{" "}
                <strong>Install</strong> to <strong>Complete</strong>.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={collectPayment.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => collectPayment.mutate()}
            disabled={!canSubmit || collectPayment.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-4 w-4 mr-2" />
            {collectPayment.isPending ? "Recording…" : `Record $${amount || "0.00"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

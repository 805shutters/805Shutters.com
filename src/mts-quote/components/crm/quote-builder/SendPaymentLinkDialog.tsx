/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Mail, Send } from "lucide-react";
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
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { formatMoney } from "@mts/lib/salesLedger";
import type { SalesQuote } from "@mts/types/quote";

type PaymentLinkSendResponse = {
  url?: string;
  email?: {
    sent?: boolean;
    skipped?: string;
    error?: string;
    results?: Array<{ to?: string; sent?: boolean; id?: string; skipped?: string; error?: string }>;
  };
  sms?: { sent?: boolean; skipped?: string; error?: string };
  message?: string;
  error?: string;
};

interface SendPaymentLinkDialogProps {
  open: boolean;
  onClose: () => void;
  quote: SalesQuote;
}

export function SendPaymentLinkDialog({ open, onClose, quote }: SendPaymentLinkDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(quote.customer_email ?? "");

  useEffect(() => {
    if (!open) return;
    setEmail(quote.customer_email ?? "");
  }, [open, quote]);

  const cleanedEmail = email.trim();
  const depositDue = useMemo(() => {
    const total = Number(quote.total_amount) || 0;
    const depositPaid = Number(quote.deposit_paid) || 0;
    return Math.max(total * 0.5 - depositPaid, 0);
  }, [quote.deposit_paid, quote.total_amount]);

  const sendPaymentLink = useMutation<PaymentLinkSendResponse, Error>({
    mutationFn: async () => {
      if (!cleanedEmail) throw new Error("Customer email is required.");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("CRM session is required.");

      const response = await fetch(`/api/crm/sales-quotes/${encodeURIComponent(quote.id)}/payment-link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channels: { email: true, sms: false },
          emails: [cleanedEmail],
        }),
      });

      const data = (await response.json().catch(() => ({}))) as PaymentLinkSendResponse;
      if (!response.ok) throw new Error(data.message || data.error || "Failed to send payment link");
      return data;
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.detail(quote.id) });

      if (data.email?.sent) {
        const providerId = data.email.results?.find((result) => result.sent && result.id)?.id;
        toast.success(
          `Payment link emailed to ${cleanedEmail}${providerId ? ` (Resend ${providerId.slice(0, 8)})` : ""}`
        );
        onClose();
        return;
      }

      let copied = false;
      if (data.url) {
        try {
          await navigator.clipboard.writeText(data.url);
          copied = true;
        } catch {
          /* best-effort copy fallback */
        }
      }

      const reason = data.email?.error || data.email?.skipped || "email was not sent";
      toast.warning(`Payment link created${copied ? " and copied" : ""}, but ${reason}.`);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send payment link");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[560px] p-0">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-emerald-700" />
            Send deposit payment link
          </DialogTitle>
          <DialogDescription>
            Quote <span className="font-mono text-xs">#{quote.quote_number}</span> for {quote.customer_name || "customer"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Deposit due</span>
              <span className="font-mono text-base font-bold">{formatMoney(depositDue)}</span>
            </div>
            <div className="text-emerald-900">
              Sends Square card payment and Zelle 805-806-9344.
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-link-email" className="text-sm font-semibold text-slate-900">
              Customer email
            </Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                id="payment-link-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@example.com"
                autoComplete="email"
              />
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Mail className="h-4 w-4" />
                Email only
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={sendPaymentLink.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => sendPaymentLink.mutate()}
            disabled={sendPaymentLink.isPending || !cleanedEmail}
            className="bg-emerald-700 text-white hover:bg-emerald-800"
          >
            <Send className="h-4 w-4" />
            {sendPaymentLink.isPending ? "Sending..." : "Send payment link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

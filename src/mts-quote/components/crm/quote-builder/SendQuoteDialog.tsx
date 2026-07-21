/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@mts/lib/queryKeys";
import { supabase } from "@mts/integrations/supabase/client";
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
import { Textarea } from "@mts/components/ui/textarea";
import { Label } from "@mts/components/ui/label";
import { Checkbox } from "@mts/components/ui/checkbox";
import {
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
  Zap,
  FileText,
  PenLine,
  Plus,
  Trash2,
  Banknote,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@mts/lib/utils";
import { getQuoteEmailNote } from "@mts/lib/quoteTotals";
import type { SalesQuote } from "@mts/types/quote";

type Channel = "email" | "sms" | "both";
type EmailType = "quote_only" | "sold_contract";
type TechnicalMeasureDecision = "needed" | "not_needed";
type SendQuoteResult = { email?: boolean; sms?: boolean; errors: string[] };
type SendQuoteVariables = { measureDecision?: TechnicalMeasureDecision };
type SendQuoteResponse = {
  url?: string;
  status?: string;
  email?: { sent?: boolean; skipped?: string; error?: string };
  sms?: { sent?: boolean; skipped?: string; error?: string };
  message?: string;
  error?: string;
};

interface SendQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  quote: SalesQuote;
}

export function SendQuoteDialog({ open, onClose, quote }: SendQuoteDialogProps) {
  const queryClient = useQueryClient();

  const [channel, setChannel] = useState<Channel>(() => getDefaultChannel(quote));
  const [emailType, setEmailType] = useState<EmailType>(() => getDefaultEmailType(quote));

  const [emails, setEmails] = useState<string[]>([quote.customer_email ?? ""]);
  const [phone, setPhone] = useState(quote.customer_phone ?? "");
  const [customMessage, setCustomMessage] = useState(() => getQuoteEmailNote(quote));
  const [bypassHours, setBypassHours] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannel(getDefaultChannel(quote));
    setEmailType(getDefaultEmailType(quote));
    setEmails([quote.customer_email ?? ""]);
    setPhone(quote.customer_phone ?? "");
    setCustomMessage(getQuoteEmailNote(quote));
    setBypassHours(false);
    setLinkCopied(false);
  }, [open, quote]);

  const shareLink = `${window.location.origin}/quote/${quote.share_token}`;
  const needsEmail = channel === "email" || channel === "both";
  const needsPhone = channel === "sms" || channel === "both";
  const cleanedEmails = emails.map((value) => value.trim()).filter(Boolean);
  const primaryEmail = cleanedEmails[0] ?? "";
  const contractEmailNeedsSignature =
    needsEmail && emailType === "sold_contract" && !quote.signed_at && !quote.customer_signature;

  const sendQuote = useMutation<SendQuoteResult, Error, SendQuoteVariables>({
    mutationFn: async ({ measureDecision }: SendQuoteVariables): Promise<SendQuoteResult> => {
      // Validate channel-specific inputs
      if (needsEmail && cleanedEmails.length === 0) throw new Error("Customer email is required");
      if (needsPhone && !phone.trim()) throw new Error("Customer phone is required");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("CRM session is required.");

      const response = await fetch(`/api/crm/sales-quotes/${encodeURIComponent(quote.id)}/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channels: { email: needsEmail, sms: needsPhone },
          emails: needsEmail ? cleanedEmails : [],
          phone: needsPhone ? phone.trim() : null,
          note: customMessage.trim() || null,
          emailType,
          bypassHours,
          measureDecision,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as SendQuoteResponse;
      if (!response.ok) throw new Error(data.message || data.error || "Failed to send quote");

      const errors: string[] = [];
      if (needsEmail && !data.email?.sent) {
        errors.push(`Email ${data.email?.error || data.email?.skipped || "was not sent"}`);
      }
      if (needsPhone && !data.sms?.sent) {
        errors.push(`Text ${data.sms?.error || data.sms?.skipped || "was not sent"}`);
      }

      return {
        email: Boolean(data.email?.sent),
        sms: Boolean(data.sms?.sent),
        errors,
      };
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.all });
      const parts: string[] = [];
      if (results.email) {
        parts.push(
          cleanedEmails.length === 1
            ? `email to ${primaryEmail}`
            : `emails to ${cleanedEmails.length} recipients`
        );
      }
      if (results.sms) parts.push(`text to ${phone}`);
      if (parts.length > 0) toast.success(`Sent ${parts.join(" + ")}`);
      if (results.errors.length > 0) {
        toast.warning(results.errors.join(" · "));
      }
      onClose();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to send quote");
    },
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setLinkCopied(true);
      toast.success("Link copied");
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const emailSendLabel = emailType === "sold_contract" ? "Send Contract Email" : "Send Quote Email";
  const sendLabel =
    channel === "email" ? emailSendLabel : channel === "sms" ? "Send Text" : "Send Email + Text";
  const measureChoiceRequired = !quote.signed_at && !quote.customer_signature && quote.status !== "sold";
  const sendDisabled =
    sendQuote.isPending ||
    (needsEmail && cleanedEmails.length === 0) ||
    (needsPhone && !phone.trim()) ||
    contractEmailNeedsSignature;

  const updateEmailAt = (index: number, value: string) => {
    setEmails((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  };

  const addEmail = () => setEmails((current) => [...current, ""]);

  const removeEmailAt = (index: number) => {
    setEmails((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next.length > 0 ? next : [""];
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[720px] grid-rows-[auto,minmax(0,1fr),auto] overflow-hidden p-0 sm:max-w-[720px]">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Send className="h-5 w-5 text-[#0b0b0b]" />
            Send quote
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            Quote <span className="font-mono text-xs">#{quote.quote_number}</span> for{" "}
            {quote.customer_name}. Attach the quote PDF and include the secure review link.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="space-y-4">
            <DialogSection title="Delivery" description="Choose the message channel and email format.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900">Channel</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <ChannelButton
                      active={channel === "email"}
                      onClick={() => setChannel("email")}
                      icon={Mail}
                      label="Email"
                    />
                    <ChannelButton
                      active={channel === "sms"}
                      onClick={() => setChannel("sms")}
                      icon={MessageSquare}
                      label="Text"
                    />
                    <ChannelButton
                      active={channel === "both"}
                      onClick={() => setChannel("both")}
                      icon={Zap}
                      label="Both"
                    />
                  </div>
                </div>

                {needsEmail && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-900">Email type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <ChannelButton
                        active={emailType === "quote_only"}
                        onClick={() => setEmailType("quote_only")}
                        icon={FileText}
                        label="Quote"
                      />
                      <ChannelButton
                        active={emailType === "sold_contract"}
                        onClick={() => setEmailType("sold_contract")}
                        icon={PenLine}
                        label="Contract"
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {emailType === "sold_contract"
                        ? "Sends a thank-you email with the signed contract and quote attached."
                        : "Sends a warm quote email with the quote attached for customer review."}
                    </p>
                    {contractEmailNeedsSignature && (
                      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Sold / Contract email requires a signed contract on file before sending.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </DialogSection>

            <DialogSection title="Customer contact" description="Confirm who should receive this quote.">
              <div
                className={cn(
                  "grid gap-4",
                  needsEmail && needsPhone ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]" : ""
                )}
              >
                {needsEmail && (
                  <div className="space-y-2">
                    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <Label className="text-sm font-semibold text-slate-900">Email recipients</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addEmail}
                        className="h-8 w-auto shrink-0 px-3"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {emails.map((emailValue, index) => (
                        <div key={index} className="flex min-w-0 items-center gap-2">
                          <Input
                            id={index === 0 ? "quote-recipient-email" : undefined}
                            type="email"
                            value={emailValue}
                            onChange={(e) => updateEmailAt(index, e.target.value)}
                            placeholder="customer@example.com"
                            autoFocus={index === 0}
                            className="min-w-0"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEmailAt(index)}
                            disabled={emails.length === 1}
                            title="Remove email"
                            aria-label="Remove email"
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    {!quote.customer_email && (
                      <p className="text-xs text-amber-600">
                        No email on file. The first email will be saved back to the quote.
                      </p>
                    )}
                  </div>
                )}

                {needsPhone && (
                  <div className="space-y-2">
                    <Label htmlFor="send-quote-phone" className="text-sm font-semibold text-slate-900">
                      Customer phone
                    </Label>
                    <Input
                      id="send-quote-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(805) 555-0123"
                      autoFocus={channel === "sms"}
                    />
                    {!quote.customer_phone && (
                      <p className="text-xs text-amber-600">
                        No phone on file. This will be saved back to the quote.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </DialogSection>

            <DialogSection
              title="Message"
              description={
                needsEmail
                  ? "This appears before the default email message. Texts use the standard quote link message."
                  : "Texts use the standard quote link message."
              }
            >
              <div className="space-y-3">
                {needsEmail && (
                  <div className="space-y-2">
                    <Label htmlFor="send-quote-note" className="text-sm font-semibold text-slate-900">
                      Optional note
                    </Label>
                    <Textarea
                      id="send-quote-note"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Hi Jane, as promised, here's the quote from our visit on Tuesday."
                      rows={4}
                      className="min-h-[96px] resize-y"
                    />
                  </div>
                )}

                {needsPhone && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <Checkbox
                      checked={bypassHours}
                      onCheckedChange={(v) => setBypassHours(v === true)}
                      className="mt-0.5"
                    />
                    <span className="leading-relaxed">
                      Send text anyway if outside business hours{" "}
                      <span className="text-muted-foreground">(Mon-Fri 9-6, Sat 10-6 PT)</span>
                    </span>
                  </label>
                )}
              </div>
            </DialogSection>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
              <DialogSection title="Share link" description="Customer review page for this quote.">
                <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700">
                    {shareLink}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyLink} className="h-8 shrink-0">
                    {linkCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" asChild>
                    <a
                      href={shareLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in new tab"
                      aria-label="Open quote link in new tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </div>
              </DialogSection>

              <DialogSection title="Payment options" description="Included in the customer message.">
                <div className="grid gap-2 text-sm">
                  <PaymentOption icon={Banknote} label="Venmo" value="@ken-hill-13" />
                  <PaymentOption icon={Zap} label="Zelle" value="805-806-9344" />
                  <PaymentOption icon={CreditCard} label="Card" value="Quote review page" />
                </div>
              </DialogSection>
            </div>
          </div>
        </div>

        <DialogFooter className="!grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:!flex sm:gap-2 sm:px-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={sendQuote.isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          {measureChoiceRequired ? (
            <>
              <Button
                onClick={() => sendQuote.mutate({ measureDecision: "needed" })}
                disabled={sendDisabled}
                className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendQuote.isPending ? "Sending..." : "Send Contract - Measure Needed"}
              </Button>
              <Button
                onClick={() => sendQuote.mutate({ measureDecision: "not_needed" })}
                disabled={sendDisabled}
                className="w-full bg-[#0b0b0b] hover:bg-[#1c1c1a] sm:w-auto"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendQuote.isPending ? "Sending..." : "Send Contract - No Measure Needed"}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => sendQuote.mutate({})}
              disabled={sendDisabled}
              className="w-full bg-[#0b0b0b] hover:bg-[#1c1c1a] sm:w-auto"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendQuote.isPending ? "Sending..." : sendLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultChannel(quote: SalesQuote): Channel {
  if (quote.customer_email && quote.customer_phone) return "both";
  if (quote.customer_phone && !quote.customer_email) return "sms";
  return "email";
}

function getDefaultEmailType(quote: SalesQuote): EmailType {
  return quote.status === "sold" || quote.signed_at || quote.customer_signature
    ? "sold_contract"
    : "quote_only";
}

function DialogSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PaymentOption({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1 text-slate-600">{label}</span>
      <strong className="min-w-0 truncate text-right font-semibold text-slate-950">{value}</strong>
    </div>
  );
}

// ---- Channel picker button ----

function ChannelButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[42px] min-w-0 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-all",
        active
          ? "border-[#0b0b0b] bg-[#0b0b0b] text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-[#0b0b0b] hover:bg-slate-50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

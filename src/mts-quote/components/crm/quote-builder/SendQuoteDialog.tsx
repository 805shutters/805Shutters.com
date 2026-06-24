/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@mts/lib/utils";
import { getQuoteEmailNote } from "@mts/lib/quoteTotals";
import type { SalesQuote } from "@mts/types/quote";

type Channel = "email" | "sms" | "both";
type EmailType = "quote_only" | "sold_contract";
type SendQuoteResult = { email?: boolean; sms?: boolean; errors: string[] };

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

  const sendQuote = useMutation<SendQuoteResult, Error>({
    mutationFn: async (): Promise<SendQuoteResult> => {
      // Validate channel-specific inputs
      if (needsEmail && cleanedEmails.length === 0) throw new Error("Customer email is required");
      if (needsPhone && !phone.trim()) throw new Error("Customer phone is required");

      throw new Error("805 quote email and SMS sending is not wired yet.");
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-[#0b0b0b]" />
            Send Quote to Customer
          </DialogTitle>
          <DialogDescription>
            Sends the customer a branded message with a quote PDF attached and a secure review link
            for quote <span className="font-mono text-xs">#{quote.quote_number}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Channel picker */}
          <div className="space-y-1.5">
            <Label className="text-sm">Channel</Label>
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

          {/* Email type picker */}
          {needsEmail && (
            <div className="space-y-1.5">
              <Label className="text-sm">Email type</Label>
              <div className="grid grid-cols-2 gap-2">
                <ChannelButton
                  active={emailType === "quote_only"}
                  onClick={() => setEmailType("quote_only")}
                  icon={FileText}
                  label="Quote Only"
                />
                <ChannelButton
                  active={emailType === "sold_contract"}
                  onClick={() => setEmailType("sold_contract")}
                  icon={PenLine}
                  label="Sold / Contract"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {emailType === "sold_contract"
                  ? "Sends a thank-you email with the signed contract and quote attached."
                  : "Sends a warm quote email with the quote attached for customer review."}
              </p>
              {contractEmailNeedsSignature && (
                <p className="text-xs text-amber-600">
                  Sold / Contract email requires a signed contract on file before sending.
                </p>
              )}
            </div>
          )}

          {/* Email input */}
          {needsEmail && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Customer emails</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEmail}
                  className="h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add email
                </Button>
              </div>
              <div className="space-y-2">
                {emails.map((emailValue, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      id={index === 0 ? "quote-recipient-email" : undefined}
                      type="email"
                      value={emailValue}
                      onChange={(e) => updateEmailAt(index, e.target.value)}
                      placeholder="customer@example.com"
                      autoFocus={index === 0}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEmailAt(index)}
                      disabled={emails.length === 1}
                      title="Remove email"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {!quote.customer_email && (
                <p className="text-xs text-amber-600">
                  No email on file — the first email will be saved back to the quote.
                </p>
              )}
            </div>
          )}

          {/* Phone input */}
          {needsPhone && (
            <div className="space-y-1.5">
              <Label htmlFor="send-quote-phone" className="text-sm">
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
                  No phone on file — this will be saved back to the quote.
                </p>
              )}
            </div>
          )}

          {/* Optional note */}
          <div className="space-y-1.5">
            <Label htmlFor="send-quote-note" className="text-sm">
              Optional note
              <span className="text-muted-foreground font-normal ml-1">
                {channel === "sms"
                  ? "(replaces default SMS intro)"
                  : "(adds a personal note above the default email message)"}
              </span>
            </Label>
            <Textarea
              id="send-quote-note"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder={
                channel === "sms"
                  ? "Hi Jane — here's your quote"
                  : "Hi Jane — as promised, here's the quote from our visit on Tuesday…"
              }
              rows={channel === "sms" ? 2 : 3}
            />
          </div>

          {/* Business hours override for SMS */}
          {needsPhone && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <Checkbox checked={bypassHours} onCheckedChange={(v) => setBypassHours(v === true)} />
              <span>
                Send text anyway if outside business hours{" "}
                <span className="text-muted-foreground">(Mon-Fri 9-6, Sat 10-6 PT)</span>
              </span>
            </label>
          )}

          {/* Share link preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Share link
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-slate-700 truncate font-mono">{shareLink}</code>
              <Button variant="outline" size="sm" onClick={handleCopyLink} className="h-8 shrink-0">
                {linkCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" className="h-8 shrink-0" asChild>
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        {/* Payment options — visible to the rep + included in the default message */}
        <div className="rounded-lg border border-slate-200 bg-emerald-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Payment options (included in the message)
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
            <span>📱 Venmo: <strong>@ken-hill-13</strong></span>
            <span>🏦 Zelle: <strong>805-806-9344</strong></span>
            <span>💳 Card: <strong>on the quote page</strong></span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={sendQuote.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => sendQuote.mutate()}
            disabled={
              sendQuote.isPending ||
              (needsEmail && cleanedEmails.length === 0) ||
              (needsPhone && !phone.trim()) ||
              contractEmailNeedsSignature
            }
            className="bg-[#0b0b0b] hover:bg-[#1c1c1a]"
          >
            <Send className="h-4 w-4 mr-2" />
            {sendQuote.isPending ? "Sending…" : sendLabel}
          </Button>
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
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
        active
          ? "bg-[#0b0b0b] text-white border-[#0b0b0b] ring-2 ring-offset-1 ring-[#0b0b0b]/30"
          : "bg-white border-slate-200 text-slate-700 hover:border-[#0b0b0b]"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

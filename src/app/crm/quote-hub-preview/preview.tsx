"use client";
import { useState } from "react";
import {
  QuoteCommunicationHub,
  type HubRequest,
} from "@/components/crm/quote-hub/QuoteCommunicationHub";
import {
  HUB_PHOTOS,
  hubEmail,
  hubOffer,
  type HubConversation,
  type HubDraft,
  type HubMessage,
} from "@/lib/crm/quote-hub-model";
import { DEFAULT_ADJUSTMENTS } from "@/lib/crm/quote-money";
import type { QuoteTableRow } from "@mts/components/crm/quote-builder/QuotesTable";
const id = (n: number) =>
  `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const names = ["Avery Sample", "Jordan Example", "Taylor Demo"];
const quotes: QuoteTableRow[] = names.map((name, n) => ({
  id: id(n + 1),
  source: "crm",
  status: "sent",
  customer_name: name,
  customer_email: `sample${n}@example.com`,
  quote_number: `805-DEMO-${n + 1}`,
  total_amount: [3698.18, 4922.4, 1202.4][n],
  sent_at: "2026-09-01T16:00:00Z",
}));
export function QuoteHubPreview() {
  const [request] = useState(() => {
    const states = new Map(
      quotes.map((q) => [
        q.id,
        {
          quoteId: q.id,
          name: q.customer_name!,
          email: q.customer_email!,
          quoteNumber: q.quote_number!,
          sentAt: q.sent_at!,
          total: q.total_amount!,
          url: "https://805shutters.com/quote/demo",
          canSend: true,
          blockedReason: null,
          basis: {
            subtotal: q.total_amount!,
            total: q.total_amount!,
            adjustments: { ...DEFAULT_ADJUSTMENTS, depositPercent: 50 },
            allPriced: true,
            sourceAdjustment: 0,
          },
          photos: HUB_PHOTOS,
          messages: [
            {
              id: crypto.randomUUID(),
              quote_id: q.id,
              action: "reply",
              status: "received",
              body: "We love the shutters. Is there any flexibility on the price?",
              subject: "Re: Our window project",
              recipient: "805@805shutters.com",
              created_at: "2026-09-04T16:00:00Z",
              actor_email: q.customer_email!,
              provider_id: "sample-" + q.id,
              payload: {},
            },
          ],
        } as HubConversation,
      ]),
    );
    return (async <T,>(url: string, body?: unknown): Promise<T> => {
      if (body instanceof FormData) {
        const state = states.get(String(body.get("id")))!;
        const file = body.get("file") as File;
        const photo = {
          id: crypto.randomUUID(),
          title: file.name,
          url: URL.createObjectURL(file),
        };
        state.photos = [...state.photos, photo];
        return { id: photo.id } as T;
      }
      const state = states.get(url.split("/").at(-1)!)!;
      const data = body as
        | {
            operation: string;
            draft: HubDraft;
            body: string;
            messageId: string;
          }
        | undefined;
      if (!data || data.operation === "open")
        return structuredClone(state) as T;
      if (data.operation === "draft") {
        state.messages.push({
          id: crypto.randomUUID(),
          quote_id: state.quoteId,
          action: data.draft.action,
          status: "draft",
          subject: data.draft.subject,
          body: data.draft.body,
          recipient: state.email,
          actor_email: "sample-staff",
          created_at: new Date().toISOString(),
          provider_id: null,
          payload: { draft: data.draft },
        });
        return { ok: true } as T;
      }
      if (data.operation === "prepare") {
        const offer =
          data.draft.action === "savings"
            ? hubOffer(state.basis!, data.draft.percent)
            : null;
        const message: HubMessage = {
          id: crypto.randomUUID(),
          quote_id: state.quoteId,
          action: data.draft.action,
          status: "prepared",
          subject: data.draft.subject,
          body: data.draft.body,
          recipient: state.email,
          actor_email: "sample-staff",
          created_at: new Date().toISOString(),
          provider_id: null,
          payload: {
            draft: data.draft,
            offer,
            html: hubEmail(data.draft, offer, state.url!, data.draft.photoIds)
              .html,
          },
        };
        state.messages.push(message);
        return message as T;
      }
      if (data.operation === "send" || data.operation === "reconcile") {
        state.messages.find((m) => m.id === data.messageId)!.status = "sent";
        return { status: "sent" } as T;
      }
      if (data.operation === "note") {
        state.messages.push({
          id: crypto.randomUUID(),
          quote_id: state.quoteId,
          action: "note",
          status: "note",
          subject: "",
          body: data.body,
          recipient: null,
          actor_email: "sample-staff",
          created_at: new Date().toISOString(),
          provider_id: null,
          payload: {},
        });
        return { ok: true } as T;
      }
      if (data.operation === "sync") return { count: 0, more: false } as T;
      throw new Error("Unknown preview action");
    }) as HubRequest;
  });
  return (
    <div style={{ maxWidth: 1320, margin: "24px auto", padding: 16 }}>
      <p style={{ fontSize: 13, marginBottom: 12 }}>
        Local UI test · sample records · sending is simulated
      </p>
      <QuoteCommunicationHub
        quotes={quotes}
        request={request}
        onOpenQuote={() =>
          window.alert(
            "This is a sample quote. No live customer record is opened.",
          )
        }
      />
    </div>
  );
}

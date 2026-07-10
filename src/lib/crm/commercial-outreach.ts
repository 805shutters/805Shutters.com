import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import { brandIdentity } from "@/lib/brand-identity";
import { CommercialAccount, commercialTypeLabels } from "@/lib/crm/commercial-types";

type CrmSupabaseClient = SupabaseClient;

export type CommercialOutreachTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export const commercialOutreachTemplates: CommercialOutreachTemplate[] = [
  {
    id: "gc-introduction",
    name: "GC / estimator introduction",
    subject: "Ventura County window-covering bids for {{company_name}}",
    body: `Hi {{first_name}},

I’m Jessica with 805 Shutters. We supply and install commercial roller shades, solar shades, blinds, and shutters across Ventura County.

I’d like to learn how {{company_name}} handles Division 12 window-covering bids and get added to the right subcontractor or vendor list. We can support site walks, takeoffs, product alternates, clear proposals, and local installation.

Are you the right person for this scope, or is there an estimator or project manager I should coordinate with?

Thank you,
Jessica
805 Commercial`
  },
  {
    id: "facilities-audit",
    name: "School / facilities shade audit",
    subject: "Local shade replacement support for {{company_name}}",
    body: `Hi {{first_name}},

I’m Jessica with 805 Shutters in Ventura County. We help schools and facility teams plan classroom and office shade replacements for glare, heat, privacy, safe operation, and damaged coverings.

We can walk a site, organize the scope by room or phase, recommend durable commercial products, and provide budget direction before a formal bid is needed.

Could you point me to the person who manages window-covering maintenance, purchasing, or upcoming facility projects for {{company_name}}?

Thank you,
Jessica
805 Commercial`
  },
  {
    id: "property-program",
    name: "Property-manager replacement program",
    subject: "Window-covering replacement program for {{company_name}}",
    body: `Hi {{first_name}},

I’m Jessica with 805 Shutters. We work with Ventura County properties that need repeatable pricing and local installation for tenant turns, damaged blinds, glare complaints, common areas, and phased shade replacements.

I’d like to offer {{company_name}} a no-cost shade audit on one property and build a simple replacement standard your team can reuse across future work orders.

Would a short introduction next week be useful?

Thank you,
Jessica
805 Commercial`
  },
  {
    id: "architect-spec",
    name: "Architect / designer specification help",
    subject: "Division 12 shade specification support for {{company_name}}",
    body: `Hi {{first_name}},

I’m Jessica with 805 Shutters. We provide local product, budget, and installation support for commercial roller shades, solar shades, blackout shades, blinds, and motorized systems in Ventura County.

If {{company_name}} has a project with a Division 12 window-treatment scope, I can help with samples, alternates, site verification, budget pricing, and installer coordination before the package goes out to bid.

May I send you a short commercial capability sheet and product binder?

Thank you,
Jessica
805 Commercial`
  }
];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstName(account: CommercialAccount) {
  return account.contact_name?.trim().split(/\s+/)[0] || "there";
}

function replaceTokens(template: string, account: CommercialAccount) {
  const tokens: Record<string, string> = {
    first_name: firstName(account),
    contact_name: account.contact_name || "there",
    contact_title: account.contact_title || "",
    company_name: account.company_name,
    city: account.city || "Ventura County",
    account_type: commercialTypeLabels[account.account_type]
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => tokens[key.toLowerCase()] ?? "");
}

export function buildCommercialOutreachMessage(
  account: CommercialAccount,
  subjectTemplate: string,
  bodyTemplate: string,
  postalAddress: string
) {
  const subject = replaceTokens(subjectTemplate, account).replace(/\s+/g, " ").trim().slice(0, 240);
  const personalizedBody = replaceTokens(bodyTemplate, account).trim();
  const compliance = `\n\nThis is a business introduction from 805 Shutters. ${postalAddress}\nIf you do not want future commercial emails from us, reply “unsubscribe” and we will remove you.`;
  const text = `${personalizedBody}${compliance}`;
  const htmlBody = escapeHtml(personalizedBody).replace(/\n/g, "<br>");
  const html = `<div style="margin:0;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px 20px;line-height:1.58">
    <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;margin-bottom:22px">805 Commercial</div>
    <div style="font-size:15px">${htmlBody}</div>
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #dddddd;color:#666666;font-size:11px;line-height:1.5">
      This is a business introduction from ${escapeHtml(brandIdentity.name)}.<br>
      ${escapeHtml(postalAddress)}<br>
      If you do not want future commercial emails from us, reply <strong>unsubscribe</strong> and we will remove you.
    </div>
  </div>
</div>`;

  return { subject, text, html };
}

async function sendWithResend(input: { to: string; subject: string; text: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.BOOKING_EMAIL_FROM;
  if (!apiKey || !from) throw new CrmAuthError(503, "Commercial outbound email is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: process.env.BOOKING_EMAIL_REPLY_TO || brandIdentity.email,
      subject: input.subject,
      text: input.text,
      html: input.html
    })
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) throw new Error(data.message || `Resend error ${response.status}`);
  return data.id || null;
}

export async function previewCommercialOutreach(
  supabase: CrmSupabaseClient,
  accountIds: string[],
  subjectTemplate: string,
  bodyTemplate: string
) {
  if (!accountIds.length) throw new CrmAuthError(400, "Select at least one commercial prospect.");
  if (accountIds.length > 25) throw new CrmAuthError(400, "Review and send no more than 25 personalized emails at a time.");
  if (!subjectTemplate.trim() || !bodyTemplate.trim()) throw new CrmAuthError(400, "Subject and message are required.");

  const { data, error } = await supabase.from("crm_commercial_accounts").select("*").in("id", accountIds);
  if (error) throw new CrmAuthError(502, "Selected commercial prospects could not be loaded.");
  const byId = new Map(((data || []) as CommercialAccount[]).map((account) => [account.id, account]));
  const accounts = accountIds.map((id) => byId.get(id)).filter((account): account is CommercialAccount => Boolean(account));
  const postalAddress = process.env.COMMERCIAL_OUTREACH_POSTAL_ADDRESS?.trim() || "[A valid 805 Shutters postal address is required before sending]";

  return accounts.map((account) => {
    const blockedReason = account.do_not_email
      ? "This prospect opted out."
      : account.status === "do_not_contact"
        ? "This prospect is marked do not contact."
        : !account.email
          ? "No email address."
          : null;
    return {
      accountId: account.id,
      companyName: account.company_name,
      contactName: account.contact_name,
      to: account.email,
      blockedReason,
      ...buildCommercialOutreachMessage(account, subjectTemplate, bodyTemplate, postalAddress)
    };
  });
}

export async function sendCommercialOutreach(
  supabase: CrmSupabaseClient,
  input: { accountIds: string[]; subjectTemplate: string; bodyTemplate: string; actorEmail: string }
) {
  const postalAddress = process.env.COMMERCIAL_OUTREACH_POSTAL_ADDRESS?.trim();
  if (!postalAddress) {
    throw new CrmAuthError(503, "Add COMMERCIAL_OUTREACH_POSTAL_ADDRESS before sending. CAN-SPAM requires a valid postal address.");
  }

  const previews = await previewCommercialOutreach(supabase, input.accountIds, input.subjectTemplate, input.bodyTemplate);
  const results: Array<{ accountId: string; companyName: string; sent: boolean; skipped?: string; error?: string; id?: string | null }> = [];

  for (const preview of previews) {
    if (preview.blockedReason || !preview.to) {
      results.push({ accountId: preview.accountId, companyName: preview.companyName, sent: false, skipped: preview.blockedReason || "No email address." });
      continue;
    }

    try {
      const resendId = await sendWithResend({ to: preview.to, subject: preview.subject, text: preview.text, html: preview.html });
      const now = new Date().toISOString();
      const { error: activityError } = await supabase.from("crm_commercial_activities").insert({
        account_id: preview.accountId,
        activity_type: "email_sent",
        actor_email: input.actorEmail,
        subject: preview.subject,
        body_preview: preview.text.slice(0, 5000),
        external_message_id: resendId,
        occurred_at: now,
        meta: { provider: "resend", recipient: preview.to }
      });
      if (activityError) throw new Error(`Email sent but activity logging failed: ${activityError.message}`);
      await supabase
        .from("crm_commercial_accounts")
        .update({ status: "contacted", last_contacted_at: now, next_action: "Follow up on commercial introduction", next_action_due: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) })
        .eq("id", preview.accountId);
      results.push({ accountId: preview.accountId, companyName: preview.companyName, sent: true, id: resendId });
    } catch (error) {
      results.push({
        accountId: preview.accountId,
        companyName: preview.companyName,
        sent: false,
        error: error instanceof Error ? error.message : "Send failed"
      });
    }
  }

  return {
    sent: results.filter((result) => result.sent).length,
    skipped: results.filter((result) => result.skipped).length,
    errors: results.filter((result) => result.error).length,
    results
  };
}

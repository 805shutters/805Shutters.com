"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { commercialOutreachTemplates } from "@/lib/crm/commercial-outreach";
import {
  CommercialAccountType,
  CommercialCampaign,
  CommercialCampaignWithStats,
  CommercialStatus,
  commercialAccountTypes,
  commercialStatusLabels,
  commercialStatuses,
  commercialTypeLabels
} from "@/lib/crm/commercial-types";

type Configuration = {
  outboundEmail: boolean;
  replySync: boolean;
  postalAddress: boolean;
};

type CampaignDraft = Pick<
  CommercialCampaign,
  | "name"
  | "account_type"
  | "audience_statuses"
  | "intro_subject"
  | "intro_body"
  | "follow_up_subject"
  | "follow_up_body"
  | "follow_up_delay_days"
  | "daily_limit"
>;

type CampaignPreview = {
  totalMatching: number;
  readyToEnroll: number;
  alreadyEnrolled: number;
  missingEmail: number;
  optedOut: number;
  samples: Array<{ accountId: string; companyName: string; to: string | null; subject: string; text: string }>;
};

function templateForType(type: CommercialAccountType) {
  const id = type === "school_district"
    ? "facilities-audit"
    : type === "property_management"
      ? "property-program"
      : type === "architect_designer"
        ? "architect-spec"
        : "gc-introduction";
  return commercialOutreachTemplates.find((template) => template.id === id) || commercialOutreachTemplates[0];
}

function newDraft(type: CommercialAccountType = "general_contractor"): CampaignDraft {
  const template = templateForType(type);
  return {
    name: `${commercialTypeLabels[type]} introduction`,
    account_type: type,
    audience_statuses: ["researching", "ready"],
    intro_subject: template.subject,
    intro_body: template.body,
    follow_up_subject: `Following up: ${template.subject}`,
    follow_up_body: `Hi {{first_name}},

I wanted to follow up on my note about commercial window-covering support for {{company_name}}.

If someone else owns the vendor list, estimating, facilities, or Division 12 scope, would you point me in the right direction?

Thank you,
805 Shutters Commercial Team`,
    follow_up_delay_days: 5,
    daily_limit: 25
  };
}

function draftFromCampaign(campaign: CommercialCampaign): CampaignDraft {
  return {
    name: campaign.name,
    account_type: campaign.account_type,
    audience_statuses: campaign.audience_statuses,
    intro_subject: campaign.intro_subject,
    intro_body: campaign.intro_body,
    follow_up_subject: campaign.follow_up_subject,
    follow_up_body: campaign.follow_up_body,
    follow_up_delay_days: campaign.follow_up_delay_days,
    daily_limit: campaign.daily_limit
  };
}

async function campaignFetch<T>(session: Session, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/crm/commercial/campaigns", {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  const data = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(data.message || `Campaign request failed (${response.status}).`);
  return data;
}

function campaignLabel(campaign: CommercialCampaignWithStats) {
  if (campaign.status === "active") return "Automation is live";
  if (campaign.status === "paused") return "Automation paused";
  if (campaign.status === "completed") return "Campaign complete";
  return "Draft — not sending";
}

export function CommercialCampaigns({ session, configuration }: { session: Session; configuration: Configuration }) {
  const [campaigns, setCampaigns] = useState<CommercialCampaignWithStats[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>(() => newDraft());
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = useMemo(() => campaigns.find((campaign) => campaign.id === selectedId) || null, [campaigns, selectedId]);

  async function refresh(keepSelection = true) {
    setLoading(true);
    try {
      const result = await campaignFetch<{ campaigns: CommercialCampaignWithStats[] }>(session);
      setCampaigns(result.campaigns);
      if (!keepSelection && result.campaigns[0]) {
        setSelectedId(result.campaigns[0].id);
        setDraft(draftFromCampaign(result.campaigns[0]));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaigns could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(false); }, [session.access_token]);

  function chooseCampaign(campaign: CommercialCampaignWithStats) {
    setSelectedId(campaign.id);
    setDraft(draftFromCampaign(campaign));
    setPreview(null);
    setMessage(null);
  }

  function startNew() {
    setSelectedId(null);
    setDraft(newDraft());
    setPreview(null);
    setMessage("New draft — nothing will send until you activate it.");
  }

  function applyRecommendedWords(type: CommercialAccountType) {
    const template = templateForType(type);
    setDraft((current) => ({
      ...current,
      account_type: type,
      name: selectedId ? current.name : `${commercialTypeLabels[type]} introduction`,
      intro_subject: template.subject,
      intro_body: template.body
    }));
    setPreview(null);
  }

  function updateAudience(status: CommercialStatus) {
    setDraft((current) => ({
      ...current,
      audience_statuses: current.audience_statuses.includes(status)
        ? current.audience_statuses.filter((item) => item !== status)
        : [...current.audience_statuses, status]
    }));
    setPreview(null);
  }

  async function saveCampaign(): Promise<string | null> {
    setBusy(true);
    setMessage(null);
    try {
      const action = selectedId ? "update" : "create";
      const result = await campaignFetch<{ campaign: CommercialCampaign }>(session, {
        method: "POST",
        body: JSON.stringify({ action, id: selectedId, ...draft })
      });
      setSelectedId(result.campaign.id);
      setDraft(draftFromCampaign(result.campaign));
      await refresh();
      setMessage(selectedId ? "Campaign saved." : "Campaign draft saved. Preview it, then activate automation when it is ready.");
      return result.campaign.id;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function previewAudience() {
    const id = selectedId || await saveCampaign();
    if (!id) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await campaignFetch<{ preview: CampaignPreview }>(session, { method: "POST", body: JSON.stringify({ action: "preview", id }) });
      setPreview(result.preview);
      setMessage("Audience preview is ready. This did not send email or enroll anyone.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign preview could not be built.");
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const id = selectedId || await saveCampaign();
    if (!id) return;
    if (!window.confirm("Activate this campaign? It will queue eligible contacts, and the daily automation will send up to the selected limit. Nothing sends immediately unless you choose Run due messages now.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await campaignFetch<{ enrolled: number }>(session, { method: "POST", body: JSON.stringify({ action: "activate", id }) });
      await refresh();
      setMessage(`Automation is live. ${result.enrolled} eligible contacts were added to the queue.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign could not be activated.");
    } finally {
      setBusy(false);
    }
  }

  async function pause() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await campaignFetch(session, { method: "POST", body: JSON.stringify({ action: "pause", id: selectedId }) });
      await refresh();
      setMessage("Automation paused. No queued campaign email will send until you reactivate it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign could not be paused.");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    if (!selectedId || !window.confirm("Send the campaign messages due right now? This can send live email to the queued contacts, up to the daily limit.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await campaignFetch<{ sent: number; introSent: number; followUpsSent: number; skipped: number; failed: number }>(session, {
        method: "POST",
        body: JSON.stringify({ action: "run", id: selectedId, confirmSend: true })
      });
      await refresh();
      setMessage(`Run complete: ${result.sent} emails sent (${result.introSent} introductions, ${result.followUpsSent} follow-ups), ${result.skipped} skipped, ${result.failed} failed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Campaign messages could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="commercial-campaign-layout">
      <aside className="commercial-campaign-list">
        <div className="commercial-campaign-list-head"><div><span>Campaign library</span><strong>{campaigns.length} saved</strong></div><button type="button" className="crm-ghost-button" onClick={startNew}>New campaign</button></div>
        {loading ? <p>Loading campaigns…</p> : null}
        {campaigns.map((campaign) => (
          <button type="button" key={campaign.id} className={`commercial-campaign-card${campaign.id === selectedId ? " active" : ""}`} onClick={() => chooseCampaign(campaign)}>
            <span className={`commercial-campaign-status ${campaign.status}`}>{campaignLabel(campaign)}</span>
            <strong>{campaign.name}</strong>
            <small>{commercialTypeLabels[campaign.account_type]} · {campaign.stats.total} enrolled</small>
            <em>{campaign.stats.queued} queued · {campaign.stats.sent} awaiting follow-up · {campaign.stats.replied} replied</em>
          </button>
        ))}
        {!loading && !campaigns.length ? <p className="crm-empty">No campaigns yet. Start with one audience type, then duplicate the approach for the next.</p> : null}
      </aside>

      <section className="commercial-campaign-builder">
        <div className="commercial-section-heading">
          <div><span>Campaign automation</span><h3>Write the message once. Let the system run the follow-up.</h3></div>
          {selected ? <span className={`commercial-campaign-status ${selected.status}`}>{campaignLabel(selected)}</span> : <span className="commercial-campaign-status draft">Draft — not sending</span>}
        </div>
        <div className="commercial-automation-safety">
          <span className={configuration.outboundEmail && configuration.postalAddress ? "ready" : "blocked"}>Email delivery {configuration.outboundEmail && configuration.postalAddress ? "ready" : "needs setup"}</span>
          <span className={configuration.replySync ? "ready" : "blocked"}>Reply protection {configuration.replySync ? "ready" : "needs Gmail sync"}</span>
          <p>Every message is personalized with the contact and company, includes the business address and opt-out wording, respects do-not-email records, and stops follow-ups after a recorded reply or opt-out.</p>
        </div>
        {message ? <p className="commercial-crm-message">{message}</p> : null}

        <div className="commercial-campaign-form">
          <div className="commercial-campaign-step"><span>1</span><div><h4>Choose who receives it</h4><p>Campaigns only queue contacts with an email address. The preview shows every missing or excluded record first.</p></div></div>
          <div className="commercial-campaign-fields">
            <label>Campaign name<input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setPreview(null); }} placeholder="Ventura general contractors — introduction" /></label>
            <label>Recipient type<select value={draft.account_type} onChange={(event) => applyRecommendedWords(event.target.value as CommercialAccountType)}>{commercialAccountTypes.map((type) => <option key={type} value={type}>{commercialTypeLabels[type]}</option>)}</select></label>
            <label>Messages per day<input type="number" min="1" max="100" value={draft.daily_limit} onChange={(event) => setDraft({ ...draft, daily_limit: Number(event.target.value) })} /></label>
            <label>Follow up after<input type="number" min="1" max="30" value={draft.follow_up_delay_days} onChange={(event) => setDraft({ ...draft, follow_up_delay_days: Number(event.target.value) })} /><span className="commercial-field-suffix">days</span></label>
          </div>
          <div className="commercial-audience-stages">
            <span>Include records currently marked:</span>
            {commercialStatuses.filter((status) => !["won", "not_fit", "do_not_contact"].includes(status)).map((status) => <label key={status}><input type="checkbox" checked={draft.audience_statuses.includes(status)} onChange={() => updateAudience(status)} /> {commercialStatusLabels[status]}</label>)}
          </div>

          <div className="commercial-campaign-step"><span>2</span><div><h4>Write the first message</h4><p>Use the recommended version for this recipient type as a starting point, then make it sound like 805.</p></div></div>
          <label>Introduction subject<input value={draft.intro_subject} onChange={(event) => { setDraft({ ...draft, intro_subject: event.target.value }); setPreview(null); }} /></label>
          <label>Introduction message<textarea rows={12} value={draft.intro_body} onChange={(event) => { setDraft({ ...draft, intro_body: event.target.value }); setPreview(null); }} /></label>

          <div className="commercial-campaign-step"><span>3</span><div><h4>Set the automatic follow-up</h4><p>It only sends if the campaign is active, the contact has not replied, and the daily limit has room.</p></div></div>
          <label>Follow-up subject<input value={draft.follow_up_subject} onChange={(event) => setDraft({ ...draft, follow_up_subject: event.target.value })} /></label>
          <label>Follow-up message<textarea rows={9} value={draft.follow_up_body} onChange={(event) => setDraft({ ...draft, follow_up_body: event.target.value })} /></label>
          <p className="commercial-token-help">Personalization tokens: {"{{first_name}} {{company_name}} {{city}} {{contact_title}} {{account_type}}"}</p>

          <div className="commercial-campaign-actions">
            <button type="button" className="crm-ghost-button" onClick={() => void saveCampaign()} disabled={busy}>Save draft</button>
            <button type="button" className="crm-ghost-button" onClick={() => void previewAudience()} disabled={busy || !draft.audience_statuses.length}>Preview audience</button>
            {selected?.status === "active" ? <button type="button" className="crm-ghost-button" onClick={() => void pause()} disabled={busy}>Pause automation</button> : <button type="button" onClick={() => void activate()} disabled={busy || !configuration.outboundEmail || !configuration.postalAddress}>Activate automation</button>}
            {selected?.status === "active" ? <button type="button" onClick={() => void runNow()} disabled={busy}>Run due messages now</button> : null}
          </div>
        </div>

        {preview ? <div className="commercial-campaign-preview">
          <div><strong>{preview.totalMatching}</strong><span>match the type and stages</span></div>
          <div><strong>{preview.readyToEnroll}</strong><span>ready to enroll and email</span></div>
          <div><strong>{preview.missingEmail}</strong><span>need an email first</span></div>
          <div><strong>{preview.optedOut}</strong><span>protected from outreach</span></div>
          <p>{preview.alreadyEnrolled ? `${preview.alreadyEnrolled} eligible contacts are already enrolled and will not be duplicated.` : "No one is enrolled until you activate automation."}</p>
          {preview.samples.map((sample) => <details key={sample.accountId}><summary>{sample.companyName} <em>{sample.to}</em></summary><div><strong>{sample.subject}</strong><pre>{sample.text}</pre></div></details>)}
        </div> : null}
      </section>
    </div>
  );
}

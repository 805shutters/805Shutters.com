import type { CrmBookkeepingRow, CrmJob, CrmQuote } from "@/lib/crm/types";
import { initialMarketingAgentSpec } from "@/lib/marketing-agent/governance";
import { buildMarketingIntelligence } from "@/lib/marketing-agent/sales-intelligence";

export function MarketingAgentPanel({ jobs, quotes, rows }: { jobs: CrmJob[]; quotes: CrmQuote[]; rows: CrmBookkeepingRow[] }) {
  const intelligence = buildMarketingIntelligence(jobs, quotes, rows);
  return (
    <section className="crm-marketing-agent" aria-labelledby="marketing-agent-title">
      <div className="crm-marketing-agent-head">
        <div>
          <p className="eyebrow">Sales Intelligence · Ventura County</p>
          <h2 id="marketing-agent-title">Governed Marketing Agent</h2>
          <p>{initialMarketingAgentSpec.job}</p>
        </div>
        <div className="crm-agent-state"><span>Preview only</span><strong>No external actions</strong></div>
      </div>

      <div className="crm-agent-boundary" role="note">
        <strong>Safe by construction</strong>
        <span>No ad access, scheduling, spend, publishing, messages, pricing changes, or production CRM writes.</span>
        <span>Limit: {initialMarketingAgentSpec.limits.maxIterations} iterations · {initialMarketingAgentSpec.limits.maxProposalsPerRun} proposal · {initialMarketingAgentSpec.limits.maxRuntimeSeconds}s</span>
      </div>

      <div className="crm-agent-channel-grid">
        {intelligence.channels.map((channel) => (
          <article className={`crm-agent-channel crm-agent-channel--${channel.integrationState}`} key={channel.channel}>
            <header><h3>{channel.label}</h3><span>{channel.integrationState === "missing" ? "Data gap" : "Partial evidence"}</span></header>
            {channel.leads === null ? <p className="crm-agent-empty">Not connected. No performance values shown.</p> : (
              <dl className="crm-agent-funnel">
                <div><dt>Lead</dt><dd>{channel.leads}</dd></div><div><dt>Appointment</dt><dd>{channel.appointments}</dd></div>
                <div><dt>Quote</dt><dd>{channel.quotes}</dd></div><div><dt>Sale</dt><dd>{channel.sales}</dd></div>
                <div><dt>Install</dt><dd>{channel.installs}</dd></div><div><dt>Paid</dt><dd>{channel.paidCustomers}</dd></div>
              </dl>
            )}
            <ul>{channel.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
          </article>
        ))}
      </div>

      <div className="crm-agent-control-grid">
        <article className="crm-agent-card">
          <p className="eyebrow">Data quality & evidence</p><h3>Can the agent diagnose yet?</h3>
          <strong>{intelligence.attributedLeadCount ? "Partial evidence only" : "Not yet — attribution is missing"}</strong>
          <p>{intelligence.attributedLeadCount} exact primary-channel leads · {intelligence.unattributedJobCount} CRM jobs excluded from channel comparison.</p>
          <ul className="crm-agent-dimensions">{intelligence.localDimensions.map((item) => <li key={item.label}><span className={`crm-agent-dot ${item.state}`} /> <strong>{item.label}</strong><small>{item.detail}</small></li>)}</ul>
        </article>
        <article className="crm-agent-card crm-agent-proposal">
          <p className="eyebrow">Generated proposal</p><h3>{intelligence.proposal.title}</h3><p>{intelligence.proposal.summary}</p>
          <dl><div><dt>Status</dt><dd>Preview only</dd></div><div><dt>Requested approvals</dt><dd>None — internal integration plan</dd></div><div><dt>Execution</dt><dd>Not available</dd></div></dl>
        </article>
      </div>

      <div className="crm-agent-control-grid">
        <article className="crm-agent-card"><p className="eyebrow">Activity / audit timeline</p><ol className="crm-agent-timeline"><li><strong>Panel evaluated local CRM evidence</strong><span>No records changed.</span></li><li><strong>Primary channels checked</strong><span>Google, Yelp, and Facebook gaps remain visible.</span></li><li><strong>Preview proposal generated</strong><span>Nothing approved, scheduled, or executed.</span></li></ol></article>
        <article className="crm-agent-card"><p className="eyebrow">Success metrics</p><h3>Earn autonomy with outcomes</h3><ul><li>Qualified appointments by exact channel</li><li>Sold customers and installs by Ventura County area</li><li>Collected revenue per attributable lead and approved ad dollar</li><li>Historical diagnostic precision and zero policy violations</li></ul></article>
      </div>

      <article className="crm-agent-card crm-agent-discovery"><p className="eyebrow">Local channel discovery · non-automated</p><h3>Potential Ventura County channels to evaluate later</h3><p>Research proposals may consider local SEO/search, referral partners, home-service directories, community publications, events, and neighborhood media. Every candidate needs audience evidence, attribution feasibility, cost/risk review, and human approval before any account access, outreach, publication, or spend.</p></article>
    </section>
  );
}

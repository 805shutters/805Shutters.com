import { CalendarDays, CircleCheck, Files, FileText, Home, Ruler, Wallet } from "lucide-react";
import "./mobile-experience.css";

export function MobileExperience({ children }: { children: React.ReactNode }) {
  return <div className="mobile-805-experience">
    <header className="mobile-805-brand"><a href="/crm/mobile/" aria-label="805 Shutters mobile home"><img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width="76" height="72" /></a><span>FIELD OPERATIONS</span></header>
    <nav className="mobile-805-navigation" aria-label="805 mobile workspaces">
      <a href="/crm/mobile/"><Home />Home</a>
      <a href="/crm/mobile/?appointments=1"><CalendarDays />Calendar</a>
      <a href="/crm/technical-measures/"><Ruler />Measures</a>
      <a href="/crm/mobile/quotes/"><FileText />Quotes</a>
      <a href="/crm/mobile/contracts/"><Files />Contracts</a>
      <a href="/crm/mobile/search/"><Wallet />Payments</a>
      <a href="/crm/mobile/job-status/"><CircleCheck />Job Status</a>
    </nav>
    {children}
  </div>;
}

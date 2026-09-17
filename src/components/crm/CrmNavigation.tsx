"use client";

import { useState } from "react";
import { Menu, CalendarDays, CircleCheck, ClipboardList, FileText, LayoutDashboard, LogOut, Package, RefreshCw, Wallet, Wrench, Building2 } from "lucide-react";

export const crmNavigation = [
  { id: "tracking", label: "Job status", icon: CircleCheck },
  { id: "command", label: "Dashboard", icon: LayoutDashboard },
  { id: "quotes", label: "Quotes", icon: FileText },
  { id: "orders", label: "Orders & shipping", icon: Package },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "bookkeeping", label: "Bookkeeping", icon: Wallet },
  { id: "payments", label: "Payables", icon: Wallet },
  { id: "installation", label: "Installation", icon: Wrench },
  { id: "commercial", label: "Commercial", icon: Building2 },
  { id: "jobs", label: "Job records", icon: ClipboardList },
  { id: "reports", label: "Operations reports", icon: ClipboardList },
  { id: "intelligence", label: "Sales intelligence", icon: LayoutDashboard },
  { id: "order-forms", label: "Order forms", icon: FileText },
  { id: "tools", label: "Operations tools", icon: Wrench }
] as const;
export function CrmNavigation({ activeTab, onNavigate, onRefresh, onSignOut, busy }: { activeTab: string; onNavigate: (id: typeof crmNavigation[number]["id"]) => void; onRefresh: () => void; onSignOut: () => void; busy: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <aside className="crm-platinum-sidebar" data-menu-open={menuOpen}>
    <a href="/" className="crm-platinum-logo" aria-label="805 Shutters website"><img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={286} height={270} /></a>
    <button className="crm-platinum-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="crm-section-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={18} />Menu</button>
    <nav id="crm-section-navigation" aria-label="CRM sections">{crmNavigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={activeTab === id ? "page" : undefined} onClick={() => { onNavigate(id); setMenuOpen(false); }}><Icon size={17} aria-hidden="true" /><span>{label}</span>{id === "tracking" && <small>HOME</small>}</button>)}</nav>
    <div className="crm-platinum-sidebar-actions"><button type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true" />Refresh</button><button type="button" onClick={onSignOut}><LogOut size={15} aria-hidden="true" />Sign out</button></div>
  </aside>;
}

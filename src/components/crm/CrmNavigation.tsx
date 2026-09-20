"use client";

import { useRef, useState } from "react";
import { X, Menu, CalendarDays, CircleCheck, ClipboardList, FileText, LayoutDashboard, Wallet, Wrench } from "lucide-react";

export const crmNavigation = [
  { id: "tracking", label: "Job status", icon: CircleCheck },
  { id: "command", label: "Dashboard", icon: LayoutDashboard },
  { id: "quotes", label: "Quotes", icon: FileText },
  { id: "contracts", label: "Contracts", icon: FileText },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "bookkeeping", label: "Bookkeeping", icon: Wallet },
  { id: "payments", label: "Payoff", icon: Wallet },
  { id: "square", label: "Payment Hub", icon: Wallet },
  { id: "jobs", label: "Job records", icon: ClipboardList },
  { id: "reports", label: "Operations reports", icon: ClipboardList },
  { id: "intelligence", label: "Sales intelligence", icon: LayoutDashboard },
  { id: "order-forms", label: "Order forms", icon: FileText },
  { id: "tools", label: "Operations tools", icon: Wrench }
] as const;
export function CrmNavigation({ activeTab, onNavigate }: { activeTab: string; onNavigate: (id: typeof crmNavigation[number]["id"]) => void; onRefresh: () => void; onSignOut: () => void; busy: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const calendarMenu = useRef<HTMLDialogElement>(null);
  const calendarMode = activeTab === "calendar";
  const content = <>
    {calendarMode && <button type="button" className="crm-calendar-menu-close" aria-label="Close navigation" onClick={() => calendarMenu.current?.close()}><X size={18} />Close</button>}
    <a href="/" className="crm-platinum-logo" aria-label="805 Shutters website"><img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width={286} height={270} /></a>
    {!calendarMode && <button className="crm-platinum-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="crm-section-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={18} />Menu</button>}
    <nav id="crm-section-navigation" aria-label="CRM sections">{crmNavigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={activeTab === id ? "page" : undefined} onClick={() => { calendarMenu.current?.close(); onNavigate(id); setMenuOpen(false); }}><Icon size={17} aria-hidden="true" /><span>{label}</span>{id === "tracking" && <small>HOME</small>}</button>)}</nav>
  </>;
  if (calendarMode) return <div className="crm-calendar-menu">
    <button type="button" className="crm-calendar-menu-open" aria-label="Open CRM navigation" aria-haspopup="dialog" onClick={() => calendarMenu.current?.showModal()}><Menu size={18} /><span>Menu</span></button>
    <dialog ref={calendarMenu} className="crm-calendar-navigation-dialog" aria-label="CRM navigation" onClick={event => { if (event.target === event.currentTarget) calendarMenu.current?.close(); }}>
      <aside className="crm-platinum-sidebar" data-menu-open="true">{content}</aside>
    </dialog>
  </div>;
  return <aside className="crm-platinum-sidebar" data-menu-open={menuOpen}>{content}</aside>;
}

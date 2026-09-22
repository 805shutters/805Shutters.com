"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, CircleCheck, Files, FileText, Home, Menu, Ruler, Wallet, X } from "lucide-react";

const tabs = [
  { href: "/crm/mobile/?appointments=1", path: "/crm/mobile", label: "Appts", icon: CalendarDays },
  { href: "/crm/technical-measures/", path: "/crm/technical-measures", label: "Measures", icon: Ruler },
  { href: "/crm/mobile/quotes/", path: "/crm/mobile/quotes", label: "Quotes", icon: FileText },
  { href: "/crm/mobile/job-status/", path: "/crm/mobile/job-status", label: "Job Status", icon: CircleCheck }
];
const moreLinks = [
  { href: "/crm/mobile/", path: "/crm/mobile", label: "Home", icon: Home },
  { href: "/crm/mobile/contracts/", path: "/crm/mobile/contracts", label: "Contracts", icon: Files },
  { href: "/crm/mobile/search/", path: "/crm/mobile/search", label: "Info & payments", icon: Wallet }
];

export function MobileWorkspaceNavigation() {
  const pathname = (usePathname() || "").replace(/\/$/, "");
  const dialog = useRef<HTMLDialogElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const matches = (path: string) => path === "/crm/mobile" ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  const moreActive = moreLinks.slice(1).some(link => matches(link.path));
  return <>
    <nav className="mobile-805-bottom-nav" aria-label="805 mobile workspaces">
      {tabs.map(({ href, path, label, icon: Icon }) => <a key={href} href={href} aria-current={matches(path) ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></a>)}
      <button type="button" className={moreActive ? "active" : undefined} aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="mobile-workspace-more" onClick={() => { dialog.current?.showModal(); setMoreOpen(true); }}><Menu aria-hidden="true" /><span>More</span></button>
    </nav>
    <dialog ref={dialog} id="mobile-workspace-more" className="mobile-workspace-more" aria-labelledby="mobile-workspace-more-title" onClose={() => setMoreOpen(false)}>
      <header><h2 id="mobile-workspace-more-title">More workspaces</h2><button type="button" aria-label="Close more workspaces" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button></header>
      <nav aria-label="More mobile workspaces">{moreLinks.map(({ href, path, label, icon: Icon }) => <a key={href} href={href} aria-current={matches(path) ? "page" : undefined}><Icon aria-hidden="true" />{label}</a>)}</nav>
    </dialog>
  </>;
}

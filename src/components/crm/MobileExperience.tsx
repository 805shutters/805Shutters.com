import { MobileWorkspaceNavigation } from "./MobileWorkspaceNavigation";
import "./mobile-experience.css";

export function MobileExperience({ children }: { children: React.ReactNode }) {
  return <div className="mobile-805-experience">
    <header className="mobile-805-brand"><a href="/crm/mobile/" aria-label="805 Shutters mobile home"><img src="/brand/805-shutters-logo-exact-transparent.png" alt="805 Shutters" width="76" height="72" /></a><span>FIELD OPERATIONS</span></header>
    {children}
    <MobileWorkspaceNavigation />
  </div>;
}

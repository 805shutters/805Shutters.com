import type { Viewport } from "next";
import { MobileExperience } from "@/components/crm/MobileExperience";
import { MobileWorkspaceExit } from "@/components/crm/MobileWorkspaceExit";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function MobileCrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileExperience>
      <MobileWorkspaceExit />
      {children}
    </MobileExperience>
  );
}

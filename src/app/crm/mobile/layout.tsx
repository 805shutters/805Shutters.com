import { MobileExperience } from "@/components/crm/MobileExperience";
import { MobileWorkspaceExit } from "@/components/crm/MobileWorkspaceExit";

export default function MobileCrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileExperience>
      <MobileWorkspaceExit />
      {children}
    </MobileExperience>
  );
}

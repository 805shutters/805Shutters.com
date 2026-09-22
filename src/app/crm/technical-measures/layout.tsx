import { MobileExperience } from "@/components/crm/MobileExperience";
import "../../../mts-quote/mts-quote.css";
import { MobileWorkspaceExit } from "@/components/crm/MobileWorkspaceExit";
import { TechnicalMeasureOfflineRegistration } from "@/components/crm/TechnicalMeasureOfflineRegistration";

export default function TechnicalMeasureLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileExperience>
      <TechnicalMeasureOfflineRegistration />
      <MobileWorkspaceExit showOnHome />
      {children}
    </MobileExperience>
  );
}

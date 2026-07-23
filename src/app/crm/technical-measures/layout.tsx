import "../../../mts-quote/mts-quote.css";
import { MobileWorkspaceExit } from "@/components/crm/MobileWorkspaceExit";

export default function TechnicalMeasureLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileWorkspaceExit showOnHome />
      {children}
    </>
  );
}

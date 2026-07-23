import { MobileWorkspaceExit } from "@/components/crm/MobileWorkspaceExit";

export default function MobileCrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileWorkspaceExit />
      {children}
    </>
  );
}

import { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";

export const metadata: Metadata = {
  title: "Mark VA | 805 CRM",
  robots: {
    index: false,
    follow: false
  }
};

export default function MarkVaPage() {
  return (
    <CrmApp
      workspace={{
        kind: "va",
        personName: "Mark",
        defaultOwner: "Mark",
        redirectPath: "/crm/va/mark",
        defaultTab: "va",
        title: "Mark VA Command",
        eyebrow: "805 Shutters VA"
      }}
    />
  );
}

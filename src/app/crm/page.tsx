import { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";

export const metadata: Metadata = {
  title: "805 CRM",
  robots: {
    index: false,
    follow: false
  }
};

export default function CrmPage() {
  return <CrmApp />;
}

import { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";

export const metadata: Metadata = {
  title: "Ken Bookkeeping | 805 CRM",
  robots: {
    index: false,
    follow: false
  }
};

export default function KenCrmPage() {
  return <CrmApp mode="ken" />;
}

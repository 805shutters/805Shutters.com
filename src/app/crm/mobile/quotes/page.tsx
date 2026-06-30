import { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";

export const metadata: Metadata = {
  title: "805 Quotes",
  robots: {
    index: false,
    follow: false
  }
};

export default function MobileQuotesPage() {
  return <CrmApp initialTab="quotes" loginRedirectPath="/crm/mobile/quotes" />;
}

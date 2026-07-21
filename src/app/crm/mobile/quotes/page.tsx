import { Metadata } from "next";
import { CrmMobileQuotesApp } from "@/components/crm/CrmMobileQuotesApp";

export const metadata: Metadata = {
  title: "805 Quotes",
  robots: {
    index: false,
    follow: false
  }
};

export default function MobileQuotesPage() {
  return <CrmMobileQuotesApp />;
}

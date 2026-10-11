import type { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";
export const metadata: Metadata = {
  title: "805 Shutters Phone",
  robots: { index: false, follow: false },
};
export default function PhonePage() {
  return <CrmApp initialTab="phone" />;
}

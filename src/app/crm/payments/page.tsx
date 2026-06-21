import { Metadata } from "next";
import { CrmApp } from "@/components/crm/CrmApp";
import type { CrmPaymentPerson } from "@/lib/crm/types";

export const metadata: Metadata = {
  title: "805 CRM Payments",
  robots: {
    index: false,
    follow: false
  }
};

function normalizePerson(value: unknown): CrmPaymentPerson {
  if (value === "mike" || value === "jessica" || value === "ken") return value;
  return "ken";
}

export default async function CrmPaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ person?: string }> | { person?: string };
}) {
  const params = searchParams ? await searchParams : {};
  return <CrmApp initialTab="payments" initialPaymentPerson={normalizePerson(params.person)} />;
}


import { CrmApp } from "@/components/crm/CrmApp";
import type { CrmPaymentPerson } from "@/lib/crm/types";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 CRM Payables");

function normalizePerson(value: unknown): CrmPaymentPerson {
  if (value === "mike" || value === "jessica" || value === "ken") return value;
  return "ken";
}

export default async function CrmPayablesPage({
  searchParams
}: {
  searchParams?: Promise<{ person?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  return <CrmApp initialTab="payments" initialPaymentPerson={normalizePerson(params.person)} />;
}

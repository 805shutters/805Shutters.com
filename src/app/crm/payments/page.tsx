import { redirect } from "next/navigation";
import type { CrmPaymentPerson } from "@/lib/crm/types";
import { privatePageMetadata } from "@/lib/private-page-metadata";

export const metadata = privatePageMetadata("805 CRM Payables");

function normalizePerson(value: unknown): CrmPaymentPerson {
  if (value === "mike" || value === "jessica" || value === "ken") return value;
  return "ken";
}

export default async function CrmPaymentsPage({
  searchParams
}: {
  searchParams?: Promise<{ person?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  redirect(`/crm/payables?person=${normalizePerson(params.person)}`);
}

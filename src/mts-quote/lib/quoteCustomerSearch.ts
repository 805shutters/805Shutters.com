import type { CrmCustomer } from "@/lib/crm/types";

export function matchingQuoteCustomers(customers: readonly CrmCustomer[], name: string): CrmCustomer[] {
  const query = name.trim().toLocaleLowerCase();
  if (!query) return [];

  return customers
    .filter((customer) => customer.display_name.toLocaleLowerCase().includes(query))
    .slice(0, 8);
}

import { crmPaymentPersonForEmail, isCrmOwnerAdminEmail } from "@/lib/crm/allowed-users";
import { CrmDashboardData, CrmPartnerPaymentLedgerPerson, CrmPaymentPerson } from "@/lib/crm/types";

function restrictedLedgerPerson(person: CrmPaymentPerson, label: string): CrmPartnerPaymentLedgerPerson {
  // Omit every monetary, count, job, and allocation field from JSON. Callers
  // must check earningsAccess before rendering a person ledger.
  return {
    person,
    label,
    earningsAccess: "restricted",
    allTimeJobSummary: { available: false }
  } as unknown as CrmPartnerPaymentLedgerPerson;
}

export function restrictDashboardPayablesForViewer(data: CrmDashboardData, email: string | null | undefined) {
  if (isCrmOwnerAdminEmail(email)) return data;

  const ownPerson = crmPaymentPersonForEmail(email);
  const people = (Object.keys(data.partnerPaymentLedger.people) as CrmPaymentPerson[]).reduce(
    (result, person) => {
      const ledger = data.partnerPaymentLedger.people[person];
      result[person] = ownPerson === person ? ledger : restrictedLedgerPerson(person, ledger.label);
      return result;
    },
    {} as Record<CrmPaymentPerson, CrmPartnerPaymentLedgerPerson>
  );

  return {
    ...data,
    partnerPaymentLedger: {
      ...data.partnerPaymentLedger,
      people,
      activeItems: ownPerson ? data.partnerPaymentLedger.activeItems.filter((item) => item.person === ownPerson) : [],
      history: ownPerson ? data.partnerPaymentLedger.history.filter((batch) => batch.person === ownPerson) : []
    }
  };
}

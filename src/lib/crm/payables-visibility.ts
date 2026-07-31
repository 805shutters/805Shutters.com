import { crmPaymentPersonForEmail, isMikePaymentAdminEmail } from "@/lib/crm/allowed-users";
import {
  CrmBookkeepingRow,
  CrmCommissionMonthlySummary,
  CrmCommissionSummary,
  CrmDashboardData,
  CrmPartnerJobLedgerItem,
  CrmPartnerPaymentLedgerPerson,
  CrmPaymentPerson
} from "@/lib/crm/types";

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

export function restrictBookkeepingRowForViewer(
  row: CrmBookkeepingRow,
  email: string | null | undefined
) {
  if (isMikePaymentAdminEmail(email)) return row;
  const { mikeProfit: _mikeProfit, remainingProfitBeforeJessica: _remainingProfit, ...safeRow } = row;
  return safeRow as CrmBookkeepingRow;
}

export function restrictDashboardPayablesForViewer(data: CrmDashboardData, email: string | null | undefined) {
  // Mike's CRM identity is the only identity allowed to receive Mike-linked
  // financial fields. Keep this enforcement at the response boundary so a
  // non-Mike client cannot recover hidden values from the API payload.
  if (isMikePaymentAdminEmail(email)) return data;

  const ownPerson = crmPaymentPersonForEmail(email);
  const people = (Object.keys(data.partnerPaymentLedger.people) as CrmPaymentPerson[]).reduce(
    (result, person) => {
      const ledger = data.partnerPaymentLedger.people[person];
      result[person] = ownPerson === person ? ledger : restrictedLedgerPerson(person, ledger.label);
      return result;
    },
    {} as Record<CrmPaymentPerson, CrmPartnerPaymentLedgerPerson>
  );

  const sanitizeBookkeepingRow = (row: CrmBookkeepingRow) => restrictBookkeepingRowForViewer(row, email);
  const sanitizeJobItem = (item: CrmPartnerJobLedgerItem) => {
    const { mikeProfit: _mikeProfit, remainingProfitBeforeJessica: _remainingProfit, ...safeItem } = item;
    return safeItem as CrmPartnerJobLedgerItem;
  };
  const sanitizePerson = (person: CrmPartnerPaymentLedgerPerson) => ({
    ...person,
    jobItems: person.jobItems?.map(sanitizeJobItem)
  });
  const sanitizeMonth = (month: CrmCommissionMonthlySummary) => {
    const { mikeEarned: _mikeEarned, mikePaid: _mikePaid, mikeBalance: _mikeBalance, ...safeMonth } = month;
    return safeMonth as CrmCommissionMonthlySummary;
  };
  const sanitizeCommissionSummary = (summary: CrmCommissionSummary) => {
    const { mikeEarned: _mikeEarned, mikePaid: _mikePaid, mikeOwed: _mikeOwed, ...safeTotals } = summary.totals;
    return {
      monthly: summary.monthly.map(sanitizeMonth),
      totals: safeTotals
    } as CrmCommissionSummary;
  };
  const { mikeProfit: _mikeProfitTotal, ...safeBookkeepingTotals } = data.bookkeepingTotals;

  return {
    ...data,
    bookkeepingRows: data.bookkeepingRows.map(sanitizeBookkeepingRow),
    bookkeepingTotals: safeBookkeepingTotals as CrmDashboardData["bookkeepingTotals"],
    customerFiles: data.customerFiles.map((file) => ({
      ...file,
      bookkeepingRows: file.bookkeepingRows.map(sanitizeBookkeepingRow)
    })),
    commissionPayments: data.commissionPayments.filter((payment) => payment.recipient !== "mike"),
    commissionPaymentAllocations: data.commissionPaymentAllocations.filter((allocation) => allocation.recipient !== "mike"),
    commissionSummary: sanitizeCommissionSummary(data.commissionSummary),
    partnerPaymentLedger: {
      ...data.partnerPaymentLedger,
      people: Object.fromEntries(
        Object.entries(people).map(([person, ledger]) => [person, sanitizePerson(ledger)])
      ) as typeof people,
      activeItems: ownPerson ? data.partnerPaymentLedger.activeItems.filter((item) => item.person === ownPerson) : [],
      history: ownPerson ? data.partnerPaymentLedger.history.filter((batch) => batch.person === ownPerson) : []
    }
  };
}

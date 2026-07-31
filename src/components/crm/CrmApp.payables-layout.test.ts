import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");
const tableStart = source.indexOf("function JessicaJobLedgerTable");
const tableEnd = source.indexOf("function sumPartnerRemaining", tableStart);
const tableSource = source.slice(tableStart, tableEnd);
const manualStart = source.indexOf("function ManualPaymentPanel");
const manualEnd = source.indexOf("function KenBuyoutLedgerBox", manualStart);
const manualSource = source.slice(manualStart, manualEnd);
const paymentsStart = source.indexOf("function PartnerPaymentsView");
const paymentsSource = source.slice(paymentsStart);

describe("Jessica payables row layout", () => {
  it("puts Jessica's remaining payable first with the payability state beside it", () => {
    expect(tableSource.indexOf("<th className=\"crm-jessica-owed-column\">Jessica Owed</th>")).toBeLessThan(
      tableSource.indexOf("<th>Customer</th>")
    );
    expect(tableSource).toContain("<strong>{toLedgerCurrency(item.remainingAmount)}</strong>");
    expect(tableSource).toContain("<span>{jobPaymentStateDisplay(item)}</span>");
    expect(styles).toContain(".crm-jessica-job-ledger .crm-jessica-owed-column");
    expect(styles).toContain("position: sticky");
  });

  it("places the requested cost and Mike-profit breakdown after Jessica's amount", () => {
    const owed = tableSource.indexOf("Jessica Owed");
    for (const heading of ["Ken Payoff", "COGS", "Installation", "Other Costs", "Mike Profit"]) {
      expect(tableSource.indexOf(`<th>${heading}</th>`)).toBeGreaterThan(owed);
    }
    expect(tableSource).toContain("item.expensesTotal + item.remakeTotal");
    expect(tableSource).toContain("toLedgerCurrency(item.mikeProfit)");
  });

  it("puts Jessica's dedicated payment action in the manual panel and opens review only", () => {
    expect(manualSource).toContain("Process Jessica’s Payments");
    expect(manualSource).toContain("onClick={onOpenReview}");
    expect(manualSource).not.toContain("onPay(");
    expect(paymentsSource).toContain('activePerson !== "jessica"');
    expect(paymentsSource).toContain("onOpenReview={openReview}");
  });

  it("disables Jessica's action with clear help for every safety gate", () => {
    expect(manualSource).toContain("amountDue <= 0");
    expect(manualSource).toContain("eligibleItemCount === 0");
    expect(manualSource).toContain("busy");
    expect(manualSource).toContain("current payable balance must be greater than zero");
    expect(manualSource).toContain("There are no eligible payable entries to review.");
    expect(manualSource).toContain('disabledReasons.join(" ")');
  });

  it("uses the requested completed-job section title", () => {
    expect(paymentsSource).toContain("<h4>Completed Jobs with Calculated Payables</h4>");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");
const tableStart = source.indexOf("function JessicaJobLedgerTable");
const tableEnd = source.indexOf("function sumPartnerRemaining", tableStart);
const tableSource = source.slice(tableStart, tableEnd);
const zelleStart = source.indexOf("function ZellePaymentPanel");
const zelleEnd = source.indexOf("function KenBuyoutLedgerBox", zelleStart);
const zelleSource = source.slice(zelleStart, zelleEnd);
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

  it("puts Jessica's dedicated payment action in the Zelle panel and opens review only", () => {
    expect(zelleSource).toContain("Process Jessica’s Payments");
    expect(zelleSource).toContain("onClick={onOpenReview}");
    expect(zelleSource).not.toContain("onPay(");
    expect(paymentsSource).toContain('activePerson !== "jessica"');
    expect(paymentsSource).toContain("onOpenReview={openReview}");
  });

  it("disables Jessica's action with clear help for every safety gate", () => {
    expect(zelleSource).toContain("!zelleIdentifier");
    expect(zelleSource).toContain("amountDue <= 0");
    expect(zelleSource).toContain("eligibleItemCount === 0");
    expect(zelleSource).toContain("busy");
    expect(zelleSource).toContain("Jessica’s Zelle recipient is not configured.");
    expect(zelleSource).toContain("Jessica’s current payable balance must be greater than zero.");
    expect(zelleSource).toContain("There are no eligible payable entries to review.");
    expect(zelleSource).toContain('jessicaDisabledReasons.join(" ")');
  });

  it("uses the requested completed-job section title", () => {
    expect(paymentsSource).toContain("<h4>Completed Jobs with Calculated Payables</h4>");
  });
});

import { describe, it, expect } from "vitest";
import {
  searchMobileQuotes,
  mobileSendOutcome,
  type MobileQuoteJob,
  type MobileQuoteRow,
} from "./mobile-quotes";
const job = (id: string, name = "Jamie Sample"): MobileQuoteJob => ({
  id,
  customer_name: name,
  address: `${id} Example Lane`,
  city: "Ventura",
  meta: {},
});
const quote = (
  id: string,
  jobId: string,
  status: MobileQuoteRow["status"] = "draft",
): MobileQuoteRow => ({
  id,
  job_id: jobId,
  quote_number: `805-${id}`,
  quote_label: null,
  status,
  created_at: "2026-09-01",
  signed_at: null,
  customer_printed_name: null,
  customer_email: null,
  customer_phone: null,
  customer_address: null,
  meta: {},
});

describe("mobile customer contract search", () => {
  it("keeps same-name customers separate and every sold/unsigned/archived option selectable", () => {
    const result = searchMobileQuotes(
      [job("a"), job("b")],
      [
        quote("1", "a"),
        quote("2", "a", "sold"),
        quote("3", "a", "archived"),
        quote("4", "b", "sent"),
      ],
      [],
      "jam",
      "",
    );
    expect(result.results).toHaveLength(2);
    expect(result.results[0].contracts.map((row) => row.status)).toEqual([
      "draft",
      "sold",
      "archived",
    ]);
    expect(result.results[1].address).toBe("b Example Lane, Ventura");
  });
  it("groups separate jobs only when the stored customer relationship is unambiguous", () => {
    const jobs = [job("a"), job("b")],
      quotes = [quote("1", "a"), quote("2", "b")];
    const links = jobs.map((row) => ({
      job_id: row.id,
      quote_id: null,
      customer_id: "same-customer",
    }));
    expect(
      searchMobileQuotes(jobs, quotes, links, "jam", "").results,
    ).toHaveLength(1);
    expect(
      searchMobileQuotes(
        jobs,
        quotes,
        [...links, { job_id: "b", quote_id: null, customer_id: "conflict" }],
        "jam",
        "",
      ).results,
    ).toHaveLength(2);
  });
  it("matches first and last initials, accents, and case; excludes tombstones", () => {
    const jobs = [
      job("a", "José Smith"),
      { ...job("b", "Jane Smith"), meta: { deleted_at: "today" } },
    ];
    const quotes = [
      quote("1", "a"),
      quote("2", "b"),
      { ...quote("3", "a"), meta: { deleted_at: "today" } },
    ];
    expect(
      searchMobileQuotes(jobs, quotes, [], "jose", "S").results[0].contracts,
    ).toHaveLength(1);
    expect(searchMobileQuotes(jobs, quotes, [], "", "J").results).toHaveLength(
      1,
    );
    expect(searchMobileQuotes(jobs, quotes, [], "", "Z").results).toEqual([]);
  });
  it("paginates customers without splitting their contract options", () => {
    const jobs = Array.from({ length: 65 }, (_, index) =>
      job(String(index).padStart(3, "0")),
    );
    const quotes = jobs.flatMap((row) => [
      quote(`${row.id}-1`, row.id),
      quote(`${row.id}-2`, row.id),
    ]);
    const first = searchMobileQuotes(jobs, quotes, [], "jam", "");
    const second = searchMobileQuotes(
      jobs,
      quotes,
      [],
      "jam",
      "",
      first.nextOffset!,
    );
    const last = searchMobileQuotes(
      jobs,
      quotes,
      [],
      "jam",
      "",
      second.nextOffset!,
    );
    expect(first.results).toHaveLength(30);
    expect(second.results).toHaveLength(30);
    expect(last.results).toHaveLength(5);
    expect(last.nextOffset).toBeNull();
    expect(
      new Set(
        [...first.results, ...second.results, ...last.results].map(
          (row) => row.id,
        ),
      ).size,
    ).toBe(65);
    expect(first.results.every((row) => row.contracts.length === 2)).toBe(true);
  });
  it("reports partial and unconfirmed sends per requested channel", () => {
    expect(
      mobileSendOutcome(
        { sms: { sent: true }, email: { error: "Mailbox rejected" } },
        "both",
      ),
    ).toEqual([
      "Text: accepted for sending. Delivery is not yet confirmed.",
      "Email: Mailbox rejected",
    ]);
    expect(mobileSendOutcome({}, "email")[0]).toContain("not confirmed");
  });
});

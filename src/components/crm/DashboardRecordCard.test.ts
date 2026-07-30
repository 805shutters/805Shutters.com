import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DashboardRecordCard,
  dashboardRecordContact,
  dashboardRecordContactFromJob
} from "./DashboardRecordCard";

describe("DashboardRecordCard", () => {
  it("renders the exact linked job address and phone on a dashboard record", () => {
    expect(
      dashboardRecordContactFromJob({
        address: "123 Exact Street, Camarillo, CA 93010",
        phone: "(805) 555-0123"
      })
    ).toEqual({
      address: "123 Exact Street, Camarillo, CA 93010",
      phone: "(805) 555-0123"
    });

    const html = renderToStaticMarkup(
      createElement(DashboardRecordCard, {
        customerName: "Exact Customer",
        meta: "Sold · Jul 30",
        value: "$1,250.00",
        address: "123 Exact Street, Camarillo, CA 93010",
        phone: "(805) 555-0123",
        active: false,
        onSelect: () => undefined
      })
    );

    expect(html).toContain("123 Exact Street, Camarillo, CA 93010");
    expect(html).toContain("(805) 555-0123");
    expect(html).toContain("Sold · Jul 30");
    expect(html).toContain("$1,250.00");
  });

  it("omits unavailable contact lines instead of showing placeholders", () => {
    expect(dashboardRecordContact("  ", null)).toEqual({ address: null, phone: null });
    expect(dashboardRecordContact("unknown", "N/A")).toEqual({ address: null, phone: null });

    const html = renderToStaticMarkup(
      createElement(DashboardRecordCard, {
        customerName: "Customer Without Contact",
        meta: "Sold",
        value: "$0.00",
        address: " ",
        phone: null,
        active: true,
        onSelect: () => undefined
      })
    );

    expect(html).not.toContain("crm-dashboard-record-contact");
    expect(html).not.toContain("Unknown");
    expect(html).not.toContain("Unavailable");
  });
});

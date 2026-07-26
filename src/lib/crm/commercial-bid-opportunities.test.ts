import { describe, expect, it } from "vitest";
import {
  buildCommercialBidGmailQuery,
  classifyCommercialBidEmail,
  commercialBidHtmlToText,
  type CommercialBidEmail
} from "@/lib/crm/commercial-bid-opportunities";

function email(overrides: Partial<CommercialBidEmail>): CommercialBidEmail {
  return {
    messageId: "gmail-1",
    threadId: "thread-1",
    from: "PlanHub <projectnotification@planhubprojects.com>",
    subject: "Your Daily Project Matches",
    bodyText: "",
    receivedAt: "2026-07-25T13:34:53.000Z",
    ...overrides
  };
}

describe("commercial bid email classification", () => {
  it("ignores a real PlanHub digest when the project descriptions do not identify window-covering scope", () => {
    const result = classifyCommercialBidEmail(
      email({
        bodyText: `New matching projects on PlanHub!

CITY OF TEMPLE CITY - CITY HALL LOBBY IMPROVEMENT

Temple City, California 91780

[View](https://example.test/temple-city)

General Contractor
Waisman Construction Inc

Bid Due Date
08/03/2026 01:00 PM

Construction Type
Government / Public

Building Use
Municipal

IMPROVEMENT OF 3 COUNTERS AND EXISTING INTERIOR PARTITIONS.

Tenant Improvement for a Goop Kitchen in Costa Mesa CA

Costa Mesa, California 92628

[View](https://example.test/goop)

General Contractor
Menemsha Development Group, Inc

Bid Due Date
08/05/2026 01:00 PM

Construction Type
Commercial

Building Use
Restaurant

COMMERCIAL INTERIOR TENANT IMPROVEMENT INCLUDING PLUMBING AND HVAC.

[View All ITBs](https://example.test/all)`
      })
    );

    expect(result.disposition).toBe("ignored");
    expect(result.opportunities).toEqual([]);
    expect(result.reason).toContain("visible blinds");
  });

  it("splits a PlanHub digest and keeps only a project with explicit shade scope", () => {
    const result = classifyCommercialBidEmail(
      email({
        bodyText: `New matching projects on PlanHub!

CITY HALL LOBBY IMPROVEMENT

Temple City, California 91780

[View](https://example.test/temple-city)

General Contractor
Waisman Construction Inc

Bid Due Date
08/03/2026 01:00 PM

Building Use
Municipal

Provide and install manual solar roller shades at exterior windows.

RESTAURANT TENANT IMPROVEMENT

Costa Mesa, California 92628

[View](https://example.test/restaurant)

General Contractor
Example Construction

Bid Due Date
08/05/2026 01:00 PM

Building Use
Restaurant

New plumbing, HVAC, and kitchen equipment.

[View All ITBs](https://example.test/all)`
      })
    );

    expect(result.disposition).toBe("opportunity");
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      portal: "PlanHub",
      projectName: "CITY HALL LOBBY IMPROVEMENT",
      city: "Temple City",
      bidDeadline: "2026-08-03",
      sourceUrl: "https://example.test/temple-city",
      hasEstimateReviewData: true
    });
    expect(result.opportunities[0].scopeKeywords).toEqual(expect.arrayContaining(["roller shades", "solar shades"]));
  });

  it.each([
    {
      from: "PlanetBids Login <login@planetbids.com>",
      subject: "Your one-time login code for PlanetBids is 035756",
      bodyText: "Verify your identity with this code."
    },
    {
      from: "PlanetBids <CustomerCare@planetbids.com>",
      subject: "City of Oxnard Registration Confirmation",
      bodyText: "Thank you for registering with City of Oxnard."
    },
    {
      from: "Public Purchase <notices@publicpurchase.com>",
      subject: "805shutters - Public Purchase Password Request",
      bodyText: "Click the link to reset your password."
    },
    {
      from: "Euna Solutions <hello@procuremail.eunasolutions.com>",
      subject: "Here's how to find bid opportunities faster with Supplier Network Pro",
      bodyText: "Upgrade to Pro and schedule a demo."
    }
  ])("ignores account and marketing mail: $subject", ({ from, subject, bodyText }) => {
    const result = classifyCommercialBidEmail(email({ from, subject, bodyText }));
    expect(result.disposition).toBe("ignored");
    expect(result.opportunities).toEqual([]);
  });

  it("always excludes Dodge sales outreach", () => {
    const result = classifyCommercialBidEmail(
      email({
        from: "Dodge Construction Network <sales@construction.com>",
        subject: "Bid opportunities for your business",
        bodyText: "Schedule a consultation to find roller shade projects."
      })
    );
    expect(result.disposition).toBe("ignored");
    expect(result.reason).toContain("evaluation-only");
  });

  it("creates a review-needed opportunity from a concrete PlanetBids notice without inventing a value", () => {
    const result = classifyCommercialBidEmail(
      email({
        from: "PlanetBids <CustomerCare@planetbids.com>",
        subject: "Invitation to Bid: Civic Center Roller Shade Replacement",
        bodyText: `Project Name: Civic Center Roller Shade Replacement
Location: Oxnard, CA 93030
Solicitation No: PW-26-104
Bid Due Date: 08/14/2026 02:00 PM
Scope: Furnish and install commercial solar roller shades and blackout shades.`
      })
    );

    expect(result.disposition).toBe("opportunity");
    expect(result.opportunities[0]).toMatchObject({
      portal: "PlanetBids",
      projectName: "Civic Center Roller Shade Replacement",
      bidDeadline: "2026-08-14",
      solicitationId: "PW-26-104",
      externalId: "pw-26-104",
      hasEstimateReviewData: true
    });
  });

  it("uses the exact 805 commercial mailbox in its default Gmail query", () => {
    expect(buildCommercialBidGmailQuery()).toContain("to:805@805shutters.com");
  });

  it("preserves bid links when Gmail supplies an HTML message", () => {
    expect(
      commercialBidHtmlToText(
        '<div>Project</div><a class="button" href="https://app.planhub.com/project/123">View details</a>'
      )
    ).toContain("[View details](https://app.planhub.com/project/123)");
  });
});

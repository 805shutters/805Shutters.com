import { describe, expect, it } from "vitest";
import {
  buildCalendarAssignmentSms,
  formatCalendarSmsWindow,
  salesRepSmsNumberForName
} from "./calendar-notifications";

describe("salesRepSmsNumberForName", () => {
  const env = {
    JESSICA_805_SALES_SMS_NUMBER: "8055551111",
    MIKE_805_SALES_SMS_NUMBER: "8055552222"
  };

  it("maps assigned CRM owners to their SMS numbers", () => {
    expect(salesRepSmsNumberForName("Jessica", env)).toBe("8055551111");
    expect(salesRepSmsNumberForName("Mike", env)).toBe("8055552222");
    expect(salesRepSmsNumberForName("Jessica S.", env)).toBe("8055551111");
  });

  it("skips unassigned or unknown owners", () => {
    expect(salesRepSmsNumberForName("Unassigned", env)).toBeNull();
    expect(salesRepSmsNumberForName("", env)).toBeNull();
    expect(salesRepSmsNumberForName("Installer", env)).toBeNull();
  });
});

describe("calendar assignment SMS formatting", () => {
  it("formats the appointment window in Los Angeles time", () => {
    expect(formatCalendarSmsWindow("2026-06-24T23:00:00.000Z", "2026-06-25T00:00:00.000Z")).toBe(
      "Wed, Jun 24, 4:00 PM - 5:00 PM"
    );
  });

  it("includes the assigned rep, customer, schedule, address, phone, and product", () => {
    const message = buildCalendarAssignmentSms({
      assignedTo: "Jessica",
      title: "Susannah consultation",
      customerName: "Susannah",
      startAt: "2026-06-24T23:00:00.000Z",
      endAt: "2026-06-25T00:00:00.000Z",
      location: "340 Green Moor Place, Thousand Oaks",
      phone: "8043589594",
      productInterest: "Shutters"
    });

    expect(message).toContain("assigned to Jessica");
    expect(message).toContain("Susannah, Wed, Jun 24, 4:00 PM - 5:00 PM");
    expect(message).toContain("Address: 340 Green Moor Place, Thousand Oaks.");
    expect(message).toContain("Phone: 8043589594.");
    expect(message).toContain("Product: Shutters.");
  });
});

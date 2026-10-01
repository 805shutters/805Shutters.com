import { describe, expect, it } from "vitest";
import { appointmentConfirmationMessage, confirmationStart } from "./confirmation-message";

describe("appointment confirmation card", () => {
  it("shows the correct Pacific day across UTC midnight and DST", () => {
    const summer = appointmentConfirmationMessage({startAt:"2026-10-07T01:00:00Z",assignedTo:"Jessica"});
    expect(summer.body).toContain("Tuesday, October 6, 2026 at 6:00 PM Pacific time");
    const winter = appointmentConfirmationMessage({startAt:"2026-12-08T18:00:00Z",assignedTo:"Jessica"});
    expect(winter.body).toContain("10:00 AM Pacific time");
    expect(new URL(summer.mediaUrls[0]).searchParams.get("start")).toBe("2026-10-07T01:00:00.000Z");
    expect([...new URL(summer.mediaUrls[0]).searchParams.keys()]).toEqual(["start"]);
  });
  it.each(["Mike", "Unassigned", undefined])("does not introduce Jessica for %s", assignedTo => {
    const message = appointmentConfirmationMessage({startAt:"2026-10-06T17:00:00Z",assignedTo});
    expect(message.mediaUrls).toEqual([]);
    expect(message.body).not.toContain("Jessica");
  });
  it.each([null,"not-a-date","2026-02-30T10:00:00Z","2026-10-06","2026-10-06T17:00:00Z<script>"])("rejects invalid date %s", date => {
    expect(confirmationStart(date)).toBeNull();
  });
});

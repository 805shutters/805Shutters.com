import { describe, it, expect } from "vitest";
import { buildContactCandidates, CONTACT_MARKER, CONTACT_SOURCE_MARKER, matchGoogleContact, mergeGoogleContact, normalizeContactPhone, type GooglePerson } from "./google-contacts-model";
const candidate = () => buildContactCandidates([{ ref: "customer:1", name: "Test Person", phone: "(805) 555-1234", email: "test@example.com" }])[0];
describe("805 Contacts reconciliation", () => {
  it("normalizes valid NANP numbers and rejects placeholders/multiple numbers", () => {
    expect(normalizeContactPhone("805.555.1234 ext 9")).toBe("+18055551234");
    expect(normalizeContactPhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizeContactPhone("\u202a+1 (805) 844-4013\u202c")).toBe("+18058444013");
    expect(normalizeContactPhone("\u2066+1 (805) 844-4013\u2069")).toBe("+18058444013");
    for (const value of ["805-000-0000", "1111111111", "8055551234 / 8055559999", "unknown"]) expect(normalizeContactPhone(value)).toBeNull();
  });
  it("includes unsold jobs, groups repeated contracts, excludes deleted sources", () => {
    const rows = buildContactCandidates([{ ref:"customer:1",name:"Test Person",phone:"8055551234" },{ ref:"job:2",name:"test-person",phone:"+18055551234" },{ ref:"job:3",name:"Unsold Customer",phone:"8055556789" },{ ref:"job:4",name:"Deleted Person",phone:"8055557777",deleted:true }]);
    expect(rows).toHaveLength(2);
    expect(rows.find(r=>r.key==="test person")?.refs).toHaveLength(2);
  });
  it("quarantines conflicting phones but keeps names sharing a number separate", () => {
    const conflict = buildContactCandidates([{ref:"a",name:"A",phone:"8055551234"},{ref:"b",name:"A",phone:"8055559999"}]);
    expect(conflict[0].issue).toBe("conflicting_crm_phones");
    const shared = buildContactCandidates([{ref:"a",name:"A",phone:"8055551234"},{ref:"b",name:"B",phone:"8055551234"}]);
    expect(shared.every(c=>c.issue===null)).toBe(true);
    expect(shared.map(c=>c.key)).toEqual(["a","b"]);
  });
  it("requires name plus phone for existing unmarked contacts", () => {
    const c = candidate();
    const person: GooglePerson = {resourceName:"people/1", names:[{displayName:c.name}], phoneNumbers:[{value:c.phone!}]};
    expect(matchGoogleContact(c,[person]).kind).toBe("matched");
    expect(matchGoogleContact(c,[{...person,names:[{displayName:"Different Person"}]}]).kind).toBe("create");
    expect(matchGoogleContact(c,[{...person,phoneNumbers:[]}]).kind).toBe("ambiguous");
    expect(matchGoogleContact(c,[person,{...person,resourceName:"people/2"}]).kind).toBe("ambiguous");
    expect(matchGoogleContact(c,[]).kind).toBe("create");
  });
  it("does not merge shared household numbers or let them block an exact identity", () => {
    const c = candidate();
    const other: GooglePerson = {resourceName:"people/other",names:[{displayName:"Other Household Member"}],phoneNumbers:[{value:c.phone!}],emailAddresses:[{value:c.emails[0]}]};
    expect(matchGoogleContact(c,[other]).kind).toBe("create");
    const exact: GooglePerson = {...other,resourceName:"people/exact",names:[{displayName:c.name}]};
    expect(matchGoogleContact(c,[other,exact])).toEqual({kind:"matched",person:exact});
    expect(matchGoogleContact(c,[{...other,phoneNumbers:[{value:"8055559999"}]}]).kind).toBe("ambiguous");
  });
  it("recovers timed-out creates using stable source markers even after a name change", () => {
    const c = candidate();
    expect(matchGoogleContact(c,[{resourceName:"people/1",userDefined:[{key:CONTACT_SOURCE_MARKER,value:"customer:1"}]}]).kind).toBe("matched");
    expect(matchGoogleContact(c,[],"people/deleted").kind).toBe("ambiguous");
    expect(matchGoogleContact(c,[{userDefined:[{key:CONTACT_MARKER,value:c.key}]},{userDefined:[{key:CONTACT_MARKER,value:c.key}]}]).kind).toBe("ambiguous");
  });
  it("adds CRM values while retaining personal contact values and etag", () => {
    const c = candidate(); c.addresses = ["Business address"];
    const p: GooglePerson = {resourceName:"people/1",metadata:{sources:[{type:"CONTACT",etag:"version"}]},names:[{displayName:"Personal preferred name"}],phoneNumbers:[{value:"8055559999"}],emailAddresses:[{value:"personal@example.com"}],addresses:[{formattedValue:"Personal address"}],userDefined:[{key:"personal",value:"keep"}]};
    const merged = mergeGoogleContact(c,p);
    expect(merged.names).toEqual(p.names);
    expect(merged.phoneNumbers).toHaveLength(2);
    expect(merged.emailAddresses).toHaveLength(2);
    expect(merged.addresses).toHaveLength(2);
    expect(merged.metadata).toEqual(p.metadata);
    expect(mergeGoogleContact(c,merged)).toEqual(merged);
  });
});

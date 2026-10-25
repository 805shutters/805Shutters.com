import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_MARKER } from "./google-contacts-model";
vi.mock("./google-contacts-auth", () => ({ getContactsAccess: vi.fn(async () => "private-token") }));
import { enqueueContactsBackfill, GoogleContactsApi, processContactsQueue } from "./google-contacts-sync";

function database(options: { attempted?: boolean; mapped?: boolean; concurrent?: boolean; shared?: boolean } = {}) {
  const row = { customer_key:"test person", google_resource_name:options.mapped ? "people/1" : null, status:"pending", exception_code:null as string | null, attempts:0, create_attempted_at:options.attempted ? "2026-10-01" : null, requested_at:"2026-10-01", next_attempt_at:"2026-10-01", source_refs:["customer:1"] };
  const rows = options.shared ? [row,{...row,customer_key:"other person",source_refs:["customer:2"]}] : [row];
  const writes: { table: string; patch: Record<string,unknown>; filters: [string,unknown][] }[] = [];
  const db = {
    rpc: vi.fn(async () => ({data:true,error:null})),
    from(table: string) {
      let patch: Record<string,unknown> | null = null;
      const filters: [string,unknown][] = [];
      const query = {
        select: () => query, order: () => query, range: () => query,
        upsert: () => query,
        update: (value: Record<string,unknown>) => { patch=value; return query; },
        eq: (key: string,value: unknown) => { filters.push([key,value]); return query; },
        then(resolve: (v: unknown) => unknown) {
          if (patch) { writes.push({table,patch,filters}); return Promise.resolve(resolve({data:[],error:null})); }
          const data = table === "crm_google_contacts_sync" ? rows : table === "crm_customers" ? [{id:"1", display_name:"Test Person", phone:"8055551234"},...(options.shared ? [{id:"2",display_name:"Other Person",phone:"8055551234"}] : [])] : [];
          return Promise.resolve(resolve({data,error:null}));
        }
      };
      return query;
    }
  };
  return {db: db as unknown as Parameters<typeof processContactsQueue>[0],row,writes};
}
describe("durable Contacts worker", () => {
  beforeEach(()=>vi.restoreAllMocks());
  it("stores create intent before a Google write and verifies the created contact", async()=>{
    const {db,writes} = database();
    vi.spyOn(GoogleContactsApi.prototype,"list").mockResolvedValue([]);
    vi.spyOn(GoogleContactsApi.prototype,"create").mockImplementation(async ()=>{
      expect(writes.some(w=>w.patch.create_attempted_at)).toBe(true);
      return {resourceName:"people/1"};
    });
    vi.spyOn(GoogleContactsApi.prototype,"get").mockResolvedValue({resourceName:"people/1",phoneNumbers:[{value:"+18055551234"}],userDefined:[{key:CONTACT_MARKER,value:"test person"}]});
    expect((await processContactsQueue(db)).processed).toBe(1);
    expect(writes.some(w=>w.patch.google_resource_name === "people/1")).toBe(true);
    const finish = writes.find(w=>w.patch.status === "synced")!;
    expect(finish.filters).toContainEqual(["requested_at","2026-10-01"]);
    expect(writes.at(-1)?.patch.lease_id).toBeNull();
  });
  it("never repeats an uncertain create, even when the destination list is empty", async()=>{
    const {db,writes} = database({attempted:true});
    vi.spyOn(GoogleContactsApi.prototype,"list").mockResolvedValue([]);
    const create = vi.spyOn(GoogleContactsApi.prototype,"create");
    await processContactsQueue(db);
    expect(create).not.toHaveBeenCalled();
    expect(writes.some(w=>w.patch.status === "uncertain")).toBe(true);
  });
  it("recovers a lost create response from its marker and updates instead", async()=>{
    const {db,writes} = database({attempted:true});
    const person = {resourceName:"people/1",phoneNumbers:[{value:"+18055551234"}],userDefined:[{key:CONTACT_MARKER,value:"test person"}]};
    vi.spyOn(GoogleContactsApi.prototype,"list").mockResolvedValue([person]);
    const create = vi.spyOn(GoogleContactsApi.prototype,"create");
    const update = vi.spyOn(GoogleContactsApi.prototype,"update").mockResolvedValue(person);
    vi.spyOn(GoogleContactsApi.prototype,"get").mockResolvedValue(person);
    await processContactsQueue(db);
    expect(create).not.toHaveBeenCalled(); expect(update).toHaveBeenCalledTimes(1);
    expect(writes.some(w=>w.patch.status === "synced")).toBe(true);
  });
  it("retries failed updates against the saved mapping without creating duplicates", async()=>{
    const {db,writes} = database({mapped:true});
    const person = {resourceName:"people/1",phoneNumbers:[{value:"+18055551234"}],userDefined:[{key:CONTACT_MARKER,value:"test person"}]};
    vi.spyOn(GoogleContactsApi.prototype,"list").mockResolvedValue([]);
    vi.spyOn(GoogleContactsApi.prototype,"get").mockResolvedValue(person);
    vi.spyOn(GoogleContactsApi.prototype,"update").mockRejectedValue(new Error("private upstream body must not be saved"));
    const create = vi.spyOn(GoogleContactsApi.prototype,"create");
    await processContactsQueue(db);
    expect(create).not.toHaveBeenCalled();
    expect(writes.find(w=>w.patch.status === "failed")?.patch.exception_code).toBe("sync_or_verification_failed");
    expect(JSON.stringify(writes)).not.toContain("private upstream");
  });
  it("does no Google work if another worker holds the lease", async()=>{
    const {db} = database(); vi.mocked(db.rpc).mockResolvedValue({data:false,error:null} as never);
    const list = vi.spyOn(GoogleContactsApi.prototype,"list");
    expect((await processContactsQueue(db)).busyOrDisconnected).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });
  it("creates and verifies two distinct contacts sharing the same phone without merging", async()=>{
    const {db,writes} = database({shared:true});
    const people = new Map<string,{resourceName:string;phoneNumbers:{value:string}[];userDefined:{key:string;value:string}[]}>();
    vi.spyOn(GoogleContactsApi.prototype,"list").mockResolvedValue([]);
    const create = vi.spyOn(GoogleContactsApi.prototype,"create").mockImplementation(async candidate=>{
      const person = {resourceName:`people/${candidate.key}`,phoneNumbers:[{value:candidate.phone!}],userDefined:[{key:CONTACT_MARKER,value:candidate.key}]};
      people.set(person.resourceName,person); return person;
    });
    vi.spyOn(GoogleContactsApi.prototype,"get").mockImplementation(async resource=>people.get(resource)!);
    const update = vi.spyOn(GoogleContactsApi.prototype,"update");
    expect((await processContactsQueue(db)).processed).toBe(2);
    expect(create).toHaveBeenCalledTimes(2); expect(update).not.toHaveBeenCalled();
    expect(new Set(writes.filter(w=>w.patch.google_resource_name).map(w=>w.patch.google_resource_name)).size).toBe(2);
  });
  it("resumes a resolved shared-phone exception while preserving its mapping and create intent", async()=>{
    const {db,row,writes} = database({mapped:true,attempted:true});
    row.status="ambiguous"; row.exception_code="shared_crm_phone";
    await enqueueContactsBackfill(db);
    const resumed = writes.find(w=>w.patch.status === "pending")!;
    expect(resumed.patch).not.toHaveProperty("google_resource_name");
    expect(resumed.patch).not.toHaveProperty("create_attempted_at");
    expect(resumed.filters).toContainEqual(["requested_at","2026-10-01"]);
    expect(resumed.filters).toContainEqual(["status","ambiguous"]);
  });
  it("does not reset destination conflicts or uncertain writes when resuming all customers", async()=>{
    for (const [status,code] of [["ambiguous","existing_contact_identity_conflict"],["uncertain","create_outcome_unknown"]]) {
      const {db,row,writes}=database({attempted:true});row.status=status;row.exception_code=code;
      await enqueueContactsBackfill(db);
      expect(writes).toHaveLength(0);
    }
  });
});

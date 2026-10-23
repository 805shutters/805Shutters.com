import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_MARKER } from "./google-contacts-model";
vi.mock("./google-contacts-auth", () => ({ getContactsAccess: vi.fn(async () => "private-token") }));
import { GoogleContactsApi, processContactsQueue } from "./google-contacts-sync";

function database(options: { attempted?: boolean; mapped?: boolean; concurrent?: boolean } = {}) {
  const row = { customer_key:"test person", google_resource_name:options.mapped ? "people/1" : null, status:"pending", attempts:0, create_attempted_at:options.attempted ? "2026-10-01" : null, requested_at:"2026-10-01", next_attempt_at:"2026-10-01", source_refs:["customer:1"] };
  const writes: { table: string; patch: Record<string,unknown>; filters: [string,unknown][] }[] = [];
  const db = {
    rpc: vi.fn(async () => ({data:true,error:null})),
    from(table: string) {
      let patch: Record<string,unknown> | null = null;
      const filters: [string,unknown][] = [];
      const query = {
        select: () => query, order: () => query, range: () => query,
        update: (value: Record<string,unknown>) => { patch=value; return query; },
        eq: (key: string,value: unknown) => { filters.push([key,value]); return query; },
        then(resolve: (v: unknown) => unknown) {
          if (patch) { writes.push({table,patch,filters}); return Promise.resolve(resolve({data:[],error:null})); }
          const data = table === "crm_google_contacts_sync" ? [row] : table === "crm_customers" ? [{id:"1", display_name:"Test Person", phone:"8055551234"}] : [];
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
});

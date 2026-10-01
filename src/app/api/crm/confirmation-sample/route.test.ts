import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({auth:vi.fn(),send:vi.fn(),gate:vi.fn()}));
vi.mock("@/lib/crm/auth",async()=>{const actual=await vi.importActual<typeof import("@/lib/crm/auth")>("@/lib/crm/auth");return {...actual,requireCrmUser:mocks.auth};});
vi.mock("@/lib/notify/twilio",()=>({sendSms:mocks.send}));
vi.mock("@/lib/booking/delivery-config",()=>({isBookingDeliveryEnabled:mocks.gate}));
import {GET,POST} from "./route";
function context(email="805shutters@gmail.com",prior:unknown=null) {
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),contains:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:prior,error:null}),insert:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{id:"log"},error:null}),update:vi.fn().mockReturnThis()};
 query.eq.mockImplementation(()=>query); // updates are awaited through the same chain
 const supabase={from:vi.fn(()=>query)};
 mocks.auth.mockResolvedValue({supabase,email,user:{id:"owner"}});
 return query;
}
const request=()=>new NextRequest("https://www.805shutters.com/api/crm/confirmation-sample/",{method:"POST"});
beforeEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();mocks.gate.mockReturnValue(true);mocks.send.mockResolvedValue({sent:true,sid:"SMsample",providerStatus:"queued"});});
describe("owner confirmation sample",()=>{
 it("checks delivery for the MMS message ID returned by Twilio",async()=>{
  context(undefined,{id:"prior",after_data:{sent:true,sid:"MM99124c8419a2d23061ca9ebf3816a66f"}});
  vi.stubEnv("TWILIO_ACCOUNT_SID","test-account");vi.stubEnv("TWILIO_AUTH_TOKEN","test-token");
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({status:"delivered",num_media:"1",error_code:null})});vi.stubGlobal("fetch",fetch);
  const response=await GET(new NextRequest("https://www.805shutters.com/api/crm/confirmation-sample/"));
  expect(await response.json()).toMatchObject({deliveryStatus:"delivered",numMedia:"1"});
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/Messages/MM99124c8419a2d23061ca9ebf3816a66f.json"),expect.anything());vi.unstubAllEnvs();
 });
 it("denies another staff member before sending",async()=>{context("jessica@805shutters.com");expect((await POST(request())).status).toBe(403);expect(mocks.send).not.toHaveBeenCalled();});
 it("does not send when delivery is disabled",async()=>{context();mocks.gate.mockReturnValue(false);expect((await POST(request())).status).toBe(503);expect(mocks.send).not.toHaveBeenCalled();});
 it("does not resend a previously attempted sample",async()=>{context(undefined,{id:"prior",after_data:{pending:true}});const response=await POST(request());expect(await response.json()).toMatchObject({alreadyAttempted:true,result:{pending:true}});expect(mocks.send).not.toHaveBeenCalled();});
 it("sends the explicitly requested number and image after reserving its log",async()=>{const query=context();const response=await POST(request());expect(response.status).toBe(200);expect(query.insert).toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({to:"+18052985555",body:expect.stringContaining("Sample only"),mediaUrls:[expect.stringContaining("confirmation-image/?start=")]}));expect(query.update).toHaveBeenCalledWith({after_data:expect.objectContaining({sent:true,sid:"SMsample"})});});
});

import { randomUUID, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireCrmUser, crmAuthErrorResponse } from "@/lib/crm/auth";
import {
  matchPhoneCustomer,
  type PhoneCustomer,
} from "@/lib/crm/phone-matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { email, supabase } = await requireCrmUser(request);
    const mapping: Record<string, string> = JSON.parse(
      process.env.VOICE_805_STAFF_EMAILS_JSON || "{}",
    );
    const actor = mapping[email];
    if (
      (actor !== "mike" && actor !== "jessica") ||
      email === "khill31@msn.com"
    )
      return NextResponse.json(
        { error: "Your account has no 805 phone role configured." },
        { status: 403 },
      );
    const { path } = await context.params;
    const endpoint = path.join("/");
    if (
      request.method === "GET" &&
      /^customers\/[a-f0-9-]{36}$/.test(endpoint)
    ) {
      const result = await supabase
        .from("crm_customers")
        .select("id,display_name,phone,email,meta")
        .eq("id", path[1])
        .single();
      if (result.error || !result.data || result.data.meta?.deleted_at)
        return NextResponse.json(
          { error: "Customer unavailable." },
          { status: 404 },
        );
      const { meta, ...contact } = result.data;
      return NextResponse.json(contact);
    }
    const origin = process.env.VOICE_805_SERVICE_ORIGIN;
    const key = process.env.VOICE_805_CONTROL_KEY;
    if (!origin || !key || key.length < 32)
      return NextResponse.json(
        { error: "805 phone service is not connected yet." },
        { status: 503 },
      );
    if (
      !(request.method === "GET" && endpoint === "state") &&
      !(
        request.method === "POST" &&
        /^(sync|calls\/[a-f0-9-]+\/(command|link)|messages\/[a-f0-9-]+\/(ack|followup|callback|text))$/.test(
          endpoint,
        )
      )
    )
      return NextResponse.json(
        { error: "Unsupported phone action." },
        { status: 400 },
      );
    let target = endpoint === "state" ? "/control" : `/control/${endpoint}`;
    let raw = request.method === "POST" ? await request.text() : "";
    if (raw.length > 8192)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    async function send(method: string, target: string, raw: string) {
      const at = String(Date.now()),
        nonce = randomUUID();
      const signature = createHmac("sha256", key!)
        .update(`${method}\n${target}\n${at}\n${nonce}\n${actor}\n${raw}`)
        .digest("base64");
      return fetch(`${origin!.replace(/\/$/, "")}${target}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-805-Time": at,
          "X-805-Nonce": nonce,
          "X-805-Actor": actor,
          "X-805-Signature": signature,
        },
        body: method === "POST" ? raw : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    }
    if (endpoint === "sync") {
      const response = await send("GET", "/control", "");
      if (!response.ok)
        return NextResponse.json(
          { error: "Phone service unavailable." },
          { status: 503 },
        );
      const snapshot = await response.json();
      const customers: PhoneCustomer[] = [];
      // Complete, stable pagination: a capped customer list must never prove uniqueness.
      for (let offset = 0; ; offset += 500) {
        const result = await supabase
          .from("crm_customers")
          .select("id,display_name,phone,meta")
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw new Error("Customer matching lookup failed.");
        customers.push(...(result.data as PhoneCustomer[]));
        if (result.data.length < 500) break;
        if (offset >= 100000)
          throw new Error(
            "Customer index exceeds safe scan limit; no links changed.",
          );
      }
      const links = snapshot.calls
        .filter((c: { linkSource?: string }) => c.linkSource !== "manual")
        .map(
          (c: {
            id: string;
            from: string;
            customerId?: string;
            matchStatus?: string;
          }) => {
            const messages = snapshot.messages.filter(
              (m: { callId: string }) => m.callId === c.id,
            );
            const match = matchPhoneCustomer(
              [
                c.from,
                ...messages.map((m: { callback: string }) => m.callback),
              ],
              customers,
            );
            return {
              callId: c.id,
              ...match,
              changed:
                c.customerId !== match.customerId ||
                c.matchStatus !== match.status,
            };
          },
        )
        .filter((l: { changed: boolean }) => l.changed);
      for (let offset = 0; offset < links.length; offset += 100) {
        const result = await send(
          "POST",
          "/control/links",
          JSON.stringify({ links: links.slice(offset, offset + 100) }),
        );
        if (!result.ok) throw new Error("Customer link persistence failed.");
      }
      return NextResponse.json({ updated: links.length });
    }
    if (endpoint.endsWith("/link")) {
      const payload = JSON.parse(raw);
      if (payload.customerId === null)
        raw = JSON.stringify({
          customerId: null,
          customerName: null,
          status: "unlinked",
        });
      else {
        const result = await supabase
          .from("crm_customers")
          .select("id,display_name,meta")
          .eq("id", payload.customerId)
          .single();
        if (result.error || !result.data || result.data.meta?.deleted_at)
          return NextResponse.json(
            { error: "Choose an existing 805 customer." },
            { status: 400 },
          );
        raw = JSON.stringify({
          customerId: result.data.id,
          customerName: result.data.display_name,
          status: "matched",
        });
      }
    }
    const response = await send(request.method, target, raw);
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
export { forward as GET, forward as POST };

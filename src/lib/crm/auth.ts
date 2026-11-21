import { NextRequest, NextResponse } from "next/server";
import { createClient, User } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase-server";
import { allowedCrmEmails, isAllowedCrmEmail, isKenCrmEmail, normalizeCrmEmail } from "@/lib/crm/allowed-users";
import {
  QUOTER_SERVICE_DENIED_MESSAGE,
  QUOTER_SERVICE_EMAIL,
  QuoterServiceAuthError,
  isQuoterFrontDoorRoute,
  quoterFrontDoorDb,
  quoterServiceTokenMatches,
  type QuoterDb,
} from "@/lib/crm/quoter-service-auth";

export class CrmAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getAllowedCrmEmails() {
  return [...allowedCrmEmails];
}

export function isReadOnlyCrmMutation(email: string | null | undefined, method: string) {
  const normalizedMethod = method.toUpperCase();
  return isKenCrmEmail(email) && normalizedMethod !== "GET" && normalizedMethod !== "HEAD";
}

export function isKenCrmRequestAllowed(email: string | null | undefined, method: string, pathname: string) {
  if (!isKenCrmEmail(email)) return true;
  return (method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD")
    && ["/api/crm/session", "/api/crm/ken-payoff"].includes(pathname.replace(/\/$/, ""));
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function getUserFromToken(token: string): Promise<User> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new CrmAuthError(503, "Dedicated Supabase auth is not configured.");
  }

  const authClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user?.email) {
    throw new CrmAuthError(401, "CRM session is required.");
  }

  return data.user;
}

export async function requireCrmUser(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    throw new CrmAuthError(401, "CRM session is required.");
  }

  if (quoterServiceTokenMatches(token)) {
    throw new CrmAuthError(403, QUOTER_SERVICE_DENIED_MESSAGE);
  }

  const user = await getUserFromToken(token);
  const email = user.email ? normalizeCrmEmail(user.email) : "";

  if (!email || !isAllowedCrmEmail(email)) {
    throw new CrmAuthError(403, "This CRM account is not allowed for the 805 CRM.");
  }

  if (!isKenCrmRequestAllowed(email, request.method, request.nextUrl.pathname)) {
    throw new CrmAuthError(403, "Ken's CRM login is restricted to read-only payoff access.");
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
  }

  const displayName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  const { error } = await supabase.from("crm_profiles").upsert(
    {
      id: user.id,
      email,
      display_name: displayName,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new CrmAuthError(502, "CRM profile setup failed. Run the 805 CRM Supabase migration.");
  }

  return {
    supabase,
    user,
    email,
    displayName
  };
}

/**
 * Staff sessions use requireCrmUser. A matching Quoter service token is accepted
 * only on the five front-door routes and never upserts crm_profiles.
 */
export async function requireQuoteFrontDoorActor(request: NextRequest): Promise<{
  supabase: QuoterDb;
  email: string;
  userId: string | null;
  kind: "quoter-service" | "staff";
}> {
  const token = getBearerToken(request);
  if (token && quoterServiceTokenMatches(token)) {
    if (!isQuoterFrontDoorRoute(request.nextUrl.pathname)) {
      throw new CrmAuthError(403, QUOTER_SERVICE_DENIED_MESSAGE);
    }
    const supabase = getSupabaseServiceClient();
    if (!supabase) {
      throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
    }
    return {
      supabase: quoterFrontDoorDb(supabase as unknown as QuoterDb),
      email: QUOTER_SERVICE_EMAIL,
      userId: null,
      kind: "quoter-service",
    };
  }

  const staff = await requireCrmUser(request);
  return {
    supabase: staff.supabase as unknown as QuoterDb,
    email: staff.email,
    userId: staff.user.id,
    kind: "staff",
  };
}

export function crmAuthErrorResponse(error: unknown) {
  if (error instanceof CrmAuthError || error instanceof QuoterServiceAuthError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ message: "CRM request failed." }, { status: 500 });
}

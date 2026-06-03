import { NextRequest, NextResponse } from "next/server";
import { createClient, User } from "@supabase/supabase-js";
import { CrmProfileRole } from "@/lib/crm/types";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

const defaultAllowedEmails = [
  "805shutters@gmail.com",
  "hello@805shutters.com",
  "805@805shutters.com",
  "jessica@805shutters.com",
  "mark@805shutters.com"
];

const defaultVaEmails = ["mark@805shutters.com"];
const crmProfileRoles = new Set<CrmProfileRole>(["owner", "admin", "sales", "bookkeeping", "va"]);

export class CrmAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getAllowedCrmEmails() {
  const configured = process.env.CRM_ALLOWED_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? configured : defaultAllowedEmails;
}

export function getVaCrmEmails() {
  const configured = process.env.CRM_VA_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? configured : defaultVaEmails;
}

function getAllowedCrmDomains() {
  return (process.env.CRM_ALLOWED_DOMAINS || "805shutters.com")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedCrmEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] || "";

  return getAllowedCrmEmails().includes(normalized) || getAllowedCrmDomains().includes(domain);
}

function getConfiguredCrmRole(email: string): CrmProfileRole {
  return getVaCrmEmails().includes(email.trim().toLowerCase()) ? "va" : "sales";
}

function normalizeProfileRole(value: unknown): CrmProfileRole | null {
  return typeof value === "string" && crmProfileRoles.has(value as CrmProfileRole)
    ? (value as CrmProfileRole)
    : null;
}

function getDefaultDisplayName(email: string) {
  return getVaCrmEmails().includes(email) && email.split("@")[0] === "mark" ? "Mark" : null;
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
    throw new CrmAuthError(401, "Google session is required.");
  }

  return data.user;
}

export async function requireCrmUser(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    throw new CrmAuthError(401, "Google session is required.");
  }

  const user = await getUserFromToken(token);
  const email = user.email?.trim().toLowerCase();

  if (!email || !isAllowedCrmEmail(email)) {
    throw new CrmAuthError(403, "This Google account is not allowed for the 805 CRM.");
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    throw new CrmAuthError(503, "Dedicated Supabase database is not configured.");
  }

  const displayName =
    getDefaultDisplayName(email) ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null);

  const configuredRole = getConfiguredCrmRole(email);
  const { data: existingProfile } = await supabase
    .from("crm_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = configuredRole === "va" ? "va" : normalizeProfileRole(existingProfile?.role) || configuredRole;
  const profile = {
    id: user.id,
    email,
    display_name: displayName,
    role,
    last_seen_at: new Date().toISOString()
  };

  let { error } = await supabase.from("crm_profiles").upsert(profile, { onConflict: "id" });

  if (error && role === "va") {
    const fallback = await supabase
      .from("crm_profiles")
      .upsert({ ...profile, role: "sales" }, { onConflict: "id" });
    error = fallback.error;
  }

  if (error) {
    throw new CrmAuthError(502, "CRM profile setup failed. Run the 805 CRM Supabase migration.");
  }

  return {
    supabase,
    user,
    email,
    displayName,
    role
  };
}

export function crmAuthErrorResponse(error: unknown) {
  if (error instanceof CrmAuthError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ message: "CRM request failed." }, { status: 500 });
}

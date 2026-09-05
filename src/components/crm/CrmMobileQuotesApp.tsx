"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MobileQuotesWorkspace } from "./MobileQuotesWorkspace";
import { KEN_CRM_EMAIL, isAllowedCrmEmail, isKenCrmEmail } from "@/lib/crm/allowed-users";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type CrmEmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

type CrmUser = {
  email: string;
  displayName: string | null;
};

type MobileQuotesData = { ready: true };

class CrmFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function crmRedirectUrl(path = "/crm/mobile/quotes") {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const origin = configuredSiteUrl || window.location.origin;
  const redirectPath = path.startsWith("/") ? path : "/crm/mobile/quotes";
  return `${origin}${redirectPath}`;
}

function crmApiPath(path: string) {
  if (!path.startsWith("/api/")) return path;

  const queryStart = path.indexOf("?");
  const pathname = queryStart === -1 ? path : path.slice(0, queryStart);
  const query = queryStart === -1 ? "" : path.slice(queryStart);

  return pathname.endsWith("/") ? path : `${pathname}/${query}`;
}

async function crmFetch<T>(session: Session, path: string, init: RequestInit = {}) {
  const response = await fetch(crmApiPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new CrmFetchError(body.message || "CRM request failed.", response.status);
  }

  return body as T;
}

function normalizeEmailOtpType(value: string | null): CrmEmailOtpType {
  if (
    value === "signup" ||
    value === "invite" ||
    value === "magiclink" ||
    value === "recovery" ||
    value === "email_change" ||
    value === "email"
  ) {
    return value;
  }

  return "email";
}

function removeEmailOtpParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function crmLoadErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "CRM failed to load.";
}

function isCrmSessionFetchError(error: unknown) {
  return error instanceof CrmFetchError && error.status === 401;
}

export function CrmMobileQuotesApp({ workspace = "quotes" }: { workspace?: "quotes" | "contracts" }) {
  const title = workspace === "contracts" ? "Contracts" : "Quotes";
  const workspacePath = `/crm/mobile/${workspace}`;
  const supabase = getSupabaseBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [, setUser] = useState<CrmUser | null>(null);
  const [data, setData] = useState<MobileQuotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [emailLoginMessage, setEmailLoginMessage] = useState<string | null>(null);
  const [emailLoginBusy, setEmailLoginBusy] = useState(false);
  const sessionIdentityRef = useRef<{ userId: string; accessToken: string } | null>(null);

  const configured = Boolean(supabase);

  useEffect(() => {
    if (workspace !== "quotes" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/mobile-quotes-sw.js", { scope: "/crm/mobile/quotes" }).then(async (registration) => {
      await registration.update();
      const worker = registration.installing || registration.waiting || registration.active;
      const urls = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src],link[href]"))
        .map((element) => element instanceof HTMLScriptElement ? element.src : element.href)
        .filter((value) => {
          try {
            const url = new URL(value);
            return url.origin === window.location.origin && url.pathname.startsWith("/_next/static/");
          } catch {
            return false;
          }
        });
      const message = { type: "CACHE_MOBILE_QUOTES_STATIC", urls };
      worker?.postMessage(message);
      const readyRegistration = await navigator.serviceWorker.ready;
      readyRegistration.active?.postMessage(message);
    }).catch(() => undefined);
  }, [workspace]);

  async function loadQuotes(activeSession: Session) {
    setMessage(null);
    const sessionResult = await crmFetch<CrmUser>(activeSession, "/api/crm/session");

    if (isKenCrmEmail(sessionResult.email)) {
      window.location.replace("/crm/ken");
      return;
    }

    setUser(sessionResult);
    setData({ ready: true });
  }

  async function clearCrmSession(notice?: string) {
    if (!supabase) return;
    await supabase.auth.signOut().catch(() => undefined);
    sessionIdentityRef.current = null;
    setSession(null);
    setUser(null);
    setData(null);
    setMessage(null);
    if (notice) setEmailLoginMessage(notice);
  }

  async function signOut() {
    await clearCrmSession();
  }

  async function refresh() {
    if (!session) return;
    setLoading(true);
    try {
      await loadQuotes(session);
    } catch (error) {
      setMessage(crmLoadErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const form = event.currentTarget;
    const email = formString(new FormData(form), "email").toLowerCase();
    if (!email) {
      setEmailLoginMessage("Enter an approved 805 Shutters email.");
      return;
    }

    if (!isAllowedCrmEmail(email) || isKenCrmEmail(email)) {
      setEmailLoginMessage(`Use an approved 805 Shutters email. Ken uses ${KEN_CRM_EMAIL}.`);
      return;
    }

    setEmailLoginBusy(true);
    setEmailLoginMessage(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: crmRedirectUrl(workspacePath),
          shouldCreateUser: true
        }
      });

      if (error) throw error;
      setEmailLoginMessage(`Login link sent to ${email}.`);
      form.reset();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "";
      setEmailLoginMessage(
        errorMessage.toLowerCase().includes("rate limit")
          ? "A login email was already requested. Check the inbox for the newest link, or wait a few minutes before requesting another."
          : errorMessage || "Email login link could not be sent."
      );
    } finally {
      setEmailLoginBusy(false);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const activeSupabase = supabase;
    let mounted = true;

    async function consumeEmailOtpCallback() {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      if (!tokenHash) return null;

      const { data: authData, error } = await activeSupabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: normalizeEmailOtpType(url.searchParams.get("type"))
      });

      if (error) throw error;
      removeEmailOtpParams();
      return authData.session ?? null;
    }

    async function handleLoadError(error: unknown) {
      if (isCrmSessionFetchError(error)) {
        await clearCrmSession("Your CRM login expired. Sign in again.");
        return;
      }

      setMessage(crmLoadErrorMessage(error));
    }

    async function initialize() {
      let cachedSession: Session | null = null;
      try {
        const callbackSession = await consumeEmailOtpCallback();
        const activeSession = callbackSession ?? (await activeSupabase.auth.getSession()).data.session;
        cachedSession = activeSession;
        if (!mounted) return;
        sessionIdentityRef.current = activeSession
          ? { userId: activeSession.user.id, accessToken: activeSession.access_token }
          : null;
        setSession(activeSession);

        if (activeSession) {
          await loadQuotes(activeSession);
        }
      } catch (error) {
        if (!mounted) return;
        if (workspace === "quotes" && cachedSession && !navigator.onLine && !isCrmSessionFetchError(error)) {
          setSession(cachedSession);
          setData({ ready: true });
          setMessage("Offline mode · locally saved quote drafts remain available. Reconnect before submitting.");
        } else {
          await handleLoadError(error);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    const { data: listener } = activeSupabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted || event === "INITIAL_SESSION") return;

      const nextIdentity = nextSession
        ? { userId: nextSession.user.id, accessToken: nextSession.access_token }
        : null;
      const currentIdentity = sessionIdentityRef.current;
      const sameSession = Boolean(
        nextIdentity &&
          currentIdentity &&
          nextIdentity.userId === currentIdentity.userId &&
          nextIdentity.accessToken === currentIdentity.accessToken
      );

      if (sameSession) return;

      sessionIdentityRef.current = nextIdentity;
      setSession(nextSession);

      if (nextSession) {
        setLoading(true);
        loadQuotes(nextSession)
          .catch(handleLoadError)
          .finally(() => {
            if (mounted) setLoading(false);
          });
      } else {
        setUser(null);
        setData(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  if (!configured) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">Dedicated Supabase required</p>
          <h1>805 CRM is missing browser auth configuration.</h1>
        </section>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 {title}</p>
          <h1>Loading {title.toLowerCase()}.</h1>
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">Private CRM</p>
          <h1>{workspace === "contracts" ? "Contract" : "Quote"} login.</h1>
          <p>Use an approved 805 Shutters email to view, send, and sign contracts.</p>
          {emailLoginMessage ? <p className="crm-alert">{emailLoginMessage}</p> : null}
          <form className="crm-email-login" onSubmit={sendEmailLogin}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="jessica@805shutters.com" required />
            </label>
            <button type="submit" className="button primary" disabled={emailLoginBusy}>
              {emailLoginBusy ? "Sending link..." : "Email Login Link"}
            </button>
          </form>
          <a className="button secondary" href={`/api/crm/oauth/google?redirectTo=${encodeURIComponent(workspacePath)}`}>
            Continue with Google
          </a>
        </section>
      </div>
    );
  }

  if (message && !data) {
    return (
      <div className="crm-app-shell">
        <section className="crm-login-panel">
          <p className="eyebrow">805 {title}</p>
          <h1>Contracts could not be loaded.</h1>
          <p>{message}</p>
          <div className="crm-form-actions">
            <button type="button" className="button primary" onClick={() => void refresh()}>
              Retry
            </button>
            <button type="button" className="button secondary" onClick={() => void signOut()}>
              Sign Out
            </button>
          </div>
        </section>
      </div>
    );
  }

  return <MobileQuotesWorkspace mode={workspace} key={session.user.id} session={session} onSessionExpired={() => void clearCrmSession("Your CRM login expired. Sign in again.")} />;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { MessageActions } from "./message-actions";

type Call = {
  id: string;
  from: string;
  direction?: "outbound" | "inbound-text";
  phase: string;
  owner: string | null;
  held: boolean;
  revision: number;
  recovery?: string;
  answeredAt?: number;
  createdAt: number;
  customerId?: string;
  customerName?: string;
  matchStatus?: string;
};
export type PhoneMessage = {
  kind?: "sms";
  mediaCount?: number;
  optOut?: boolean;
  id: string;
  callId: string;
  name: string;
  callback: string;
  text: string;
  acknowledgedBy?: string;
  createdAt: number;
  status: string;
  confirmed?: boolean;
  customerId?: string;
  customerName?: string;
  followupNote?: string;
};
type Notification = {
  body?: string;
  id: string;
  messageId: string;
  recipient: string;
  status: string;
};
export type PhoneSnapshot = {
  actor: string;
  calls: Call[];
  messages: PhoneMessage[];
  unresolvedCount: number;
  unreadTextCount?: number;
  logs: {
    id: string;
    callId: string;
    at: number;
    event: string;
    from?: string;
    to?: string;
    actor?: string;
    status?: string;
  }[];
  notifications: Notification[];
  readiness: { mode: string; ready: boolean; missing: string[] };
  attention: { id: string; type: string; status: string }[];
};
const button =
  "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
const phases: Record<string, string> = {
  greeting: "Receptionist greeting",
  assistant: "With AI receptionist",
  offering: "Offering to Mike and Jessica",
  handoff: "Connecting staff",
  human: "With staff",
  held: "Caller on hold",
  holding: "Placing caller on hold",
  "holding-consult": "Preparing private consultation",
  "consult-ringing": "Calling the other staff member",
  consult: "Private consultation",
  completing: "Completing transfer",
  resuming: "Returning to caller",
  message: "Taking callback message",
  ended: "Ended",
};
export function PhoneDesk({
  customers = [],
  onOpenCustomer,
}: {
  customers?: { id: string; name: string }[];
  onOpenCustomer?: (id: string) => void;
}) {
  const [state, setState] = useState<PhoneSnapshot | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [updated, setUpdated] = useState<Date | null>(null);
  const [view, setView] = useState("messages"),
    [logCall, setLogCall] = useState<string | null>(null);
  const request = useCallback(async (path: string, body?: unknown) => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error("CRM sign-in is not configured.");
    const { data } = await client.auth.getSession();
    if (!data.session)
      throw new Error("Sign in to the 805 CRM to open the phone desk.");
    const res = await fetch(`/api/crm/phone/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await res.json();
    if (!res.ok)
      throw new Error(
        value.error || value.message || "Phone service unavailable.",
      );
    return value;
  }, []);
  const refresh = useCallback(async () => {
    try {
      setState(await request("state"));
      setUpdated(new Date());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Phone service unavailable.");
    }
  }, [request]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function action(path: string, body: unknown) {
    setPending(path);
    try {
      await request(path, body);
      await refresh();
      window.dispatchEvent(new Event("805-phone-updated"));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setPending(null);
    }
  }
  function command(c: Call, name: string) {
    void action(`calls/${c.id}/command`, {
      command: name,
      revision: c.revision,
      commandId: crypto.randomUUID(),
    });
  }
  const stale = !!error || !updated || Date.now() - updated.getTime() > 10000;
  return (
    <main className="phone-desk">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="mt-3 text-3xl font-semibold">Call Center</h1>
            <p className="mt-2 text-slate-600">
              Calls, messages, follow-ups, and history.
            </p>
          </div>
          <button className={button} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4"
          >
            {error}{" "}
            {state && "Controls are paused until the connection recovers."}
          </div>
        )}
        {!state && (
          <section className="mt-6 rounded-xl border bg-white p-6">
            <h2 className="text-lg font-semibold">Phone desk connection</h2>
            <p className="mt-2 text-slate-600">
              This screen connects to the dedicated 805 phone service after
              staff roles and hosting are configured.
            </p>
            <a
              href="/crm"
              className="mt-4 inline-block text-teal-800 underline"
            >
              Open CRM sign-in
            </a>
          </section>
        )}
        {state && (
          <>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-teal-100 px-3 py-1">
                {state.readiness.mode === "simulation"
                  ? "Simulation — no real calls"
                  : state.readiness.ready ? "Calling enabled" : "Standby — calling disabled"}
              </span>
              <span className="px-3 py-1 capitalize">
                Signed in as {state.actor}
              </span>
              <span className="px-3 py-1 text-slate-500">
                Updated {updated?.toLocaleTimeString()}
              </span>
            </div>
            <section className="mt-6">
              <h2 className="text-xl font-semibold">Active calls</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {state.calls
                  .filter((c) => c.phase !== "ended")
                  .map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border bg-white p-5"
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{c.from || "Private caller"}</strong>
                        <span className="text-sm text-teal-800">
                          {phases[c.phase] || "Updating call"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {c.owner
                          ? `Assigned to ${c.owner}`
                          : "Receptionist handling call"}
                        {c.held ? " · Caller hears hold audio" : ""}
                      </p>
                      {c.recovery && (
                        <p className="mt-2 text-sm text-amber-800">
                          Recovery: {c.recovery}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[
                          ["hold", "Hold", c.phase === "human"],
                          ["resume", "Resume", c.phase === "held"],
                          [
                            "consult",
                            "Consult other staff",
                            ["human", "held"].includes(c.phase),
                          ],
                          [
                            "complete",
                            "Complete transfer",
                            c.phase === "consult",
                          ],
                          [
                            "cancel",
                            "Cancel & return",
                            [
                              "consult",
                              "consult-ringing",
                              "completing",
                            ].includes(c.phase),
                          ],
                          [
                            "end",
                            "End call",
                            [
                              "human",
                              "held",
                              "consult",
                              "consult-ringing",
                            ].includes(c.phase),
                          ],
                        ]
                          .filter(([, , show]) => show)
                          .map(([name, label]) => (
                            <button
                              key={String(name)}
                              className={button}
                              disabled={
                                !!pending || stale || c.owner !== state.actor
                              }
                              onClick={() => command(c, String(name))}
                            >
                              {pending === `calls/${c.id}/command`
                                ? "Working…"
                                : label}
                            </button>
                          ))}
                      </div>
                    </article>
                  ))}
                {!state.calls.some((c) => c.phase !== "ended") && (
                  <p className="rounded-xl border bg-white p-5 text-slate-500">
                    No active calls.
                  </p>
                )}
              </div>
            </section>
            <nav
              className="mt-8 flex flex-wrap gap-2"
              aria-label="Call Center views"
            >
              {[
                ["messages", "Messages"],
                ["missed", "Missed calls"],
                ["history", "Call history"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={button}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  {label}
                  {id === "messages"
                    ? ` (${state.unresolvedCount + (state.unreadTextCount || 0)} open)`
                    : ""}
                </button>
              ))}
            </nav>
            {view === "messages" && (
              <section className="mt-5">
                <h2 className="text-xl font-semibold">
                  Callback messages and texts
                </h2>
                <div className="mt-3 space-y-3">
                  {state.messages.map((m) => (
                    <article
                      key={m.id}
                      id={`phone-message-${m.id}`}
                      className="rounded-xl border bg-white p-5"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <strong>
                            {m.kind === "sms" ? "Incoming text: " : ""}
                            {m.name}
                          </strong>
                          <p className="text-sm text-slate-600">
                            {m.callback} ·{" "}
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="capitalize">{m.status}</span>
                      </div>
                      {m.confirmed === false && (
                        <p className="mt-2 text-sm text-amber-800">
                          Incomplete message — caller did not confirm these
                          details.
                        </p>
                      )}
                      <p className="mt-3 whitespace-pre-wrap">{m.text}</p>
                      {m.optOut && <p>Recipient opted out of texts.</p>}
                      {!!m.mediaCount && (
                        <p>
                          {m.mediaCount} attachment(s) received; view media in
                          the provider console.
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-sm">
                        {state.notifications
                          .filter((n) => n.messageId === m.id)
                          .map((n) => (
                            <span
                              key={n.id}
                              className="rounded-md bg-slate-100 px-2 py-1 capitalize"
                            >
                              {n.recipient}: {n.status}
                              {n.body ? ` — ${n.body}` : ""}
                            </span>
                          ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className={button}
                          disabled={!!pending || stale}
                          onClick={() =>
                            void action(`messages/${m.id}/followup`, {
                              status:
                                m.status === "resolved" ? "open" : "resolved",
                              note: m.followupNote || "",
                            })
                          }
                        >
                          {m.status === "resolved"
                            ? "Reopen follow-up"
                            : "Mark resolved"}
                        </button>
                        {m.status === "open" && (
                          <button
                            className={button}
                            disabled={!!pending || stale}
                            onClick={() =>
                              void action(`messages/${m.id}/followup`, {
                                status: "in-progress",
                                note: m.followupNote || "",
                              })
                            }
                          >
                            Start follow-up
                          </button>
                        )}
                        <button
                          className={button}
                          onClick={() => {
                            setLogCall(m.callId);
                            setView("history");
                          }}
                        >
                          Call details
                        </button>
                        {m.customerId && (
                          <button
                            className={button}
                            onClick={() => onOpenCustomer?.(m.customerId!)}
                          >
                            Customer: {m.customerName || "Open file"}
                          </button>
                        )}
                      </div>
                      <label className="mt-4 block text-sm">
                        Follow-up note
                        <textarea
                          aria-label={`Follow-up note for ${m.name}`}
                          className="mt-1 block w-full rounded border p-2"
                          defaultValue={m.followupNote || ""}
                          onBlur={(e) => {
                            if (e.target.value !== (m.followupNote || ""))
                              void action(`messages/${m.id}/followup`, {
                                status: m.status,
                                note: e.target.value,
                              });
                          }}
                          disabled={stale || !!pending}
                        />
                      </label>
                      <MessageActions
                        id={m.id}
                        disabled={!!pending || stale}
                        action={action}
                      />
                    </article>
                  ))}
                  {!state.messages.length && (
                    <p className="rounded-xl border bg-white p-5 text-slate-500">
                      No saved messages or texts.
                    </p>
                  )}
                </div>
              </section>
            )}
            {view !== "messages" && (
              <section className="mt-5 space-y-3">
                <h2 className="text-xl font-semibold">
                  {view === "missed" ? "Missed calls" : "Call history"}
                </h2>
                {state.calls
                  .filter(
                    (c) =>
                      view !== "missed" ||
                      (!c.direction && !c.answeredAt && c.phase === "ended"),
                  )
                  .map((c) => (
                    <article
                      key={c.id}
                      className="rounded-xl border bg-white p-5"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <strong>{c.from || "Private caller"}</strong>
                        <span>{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2 text-sm">
                        {c.direction === "inbound-text"
                          ? "Incoming text"
                          : c.direction === "outbound"
                            ? c.answeredAt
                              ? "Outbound callback connected"
                              : c.phase === "ended"
                                ? "Outbound callback not connected"
                                : "Outbound callback in progress"
                            : c.answeredAt
                              ? "Answered by staff"
                              : c.phase === "ended"
                                ? "Missed / no staff connection"
                                : "In progress"}{" "}
                        ·{" "}
                        {state.messages.some((m) => m.callId === c.id)
                          ? "Message saved"
                          : "No message saved"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          className={button}
                          onClick={() =>
                            setLogCall(logCall === c.id ? null : c.id)
                          }
                        >
                          {logCall === c.id ? "Hide events" : "Show events"}
                        </button>
                        {c.customerId && (
                          <button
                            className={button}
                            onClick={() => onOpenCustomer?.(c.customerId!)}
                          >
                            Open {c.customerName || "customer file"}
                          </button>
                        )}
                        <label className="text-sm">
                          Customer link{" "}
                          <select
                            aria-label={`Customer link for ${c.from}`}
                            className="rounded border p-2"
                            value={c.customerId || ""}
                            disabled={stale || !!pending}
                            onChange={(e) =>
                              void action(`calls/${c.id}/link`, {
                                customerId: e.target.value || null,
                              })
                            }
                          >
                            <option value="">
                              {c.matchStatus === "ambiguous"
                                ? "Shared number — choose customer"
                                : "Unlinked"}
                            </option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {logCall === c.id && (
                        <ol className="mt-3 space-y-2 text-sm">
                          {state.logs
                            .filter((l) => l.callId === c.id)
                            .map((l) => (
                              <li key={l.id}>
                                {new Date(l.at).toLocaleTimeString()} ·{" "}
                                {l.event}{" "}
                                {l.to ? `→ ${phases[l.to] || l.to}` : ""}{" "}
                                {l.actor || ""} {l.status || ""}
                              </li>
                            ))}
                        </ol>
                      )}
                    </article>
                  ))}
              </section>
            )}
            {(state.attention.length > 0 || !state.readiness.ready) && (
              <section className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h2 className="font-semibold">Setup and recovery</h2>
                <ul className="mt-2 list-inside list-disc text-sm">
                  {state.readiness.missing.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {state.attention.map((x) => (
                    <li key={x.id}>
                      {x.type}: {x.status} — provider evidence needs review.
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

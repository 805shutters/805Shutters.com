import type { SupabaseClient } from "@supabase/supabase-js";

export const PROCESSORS = ["order-cogs", "installation-invoices", "completed-report-filing"] as const;
export type IntegrationProcessor = typeof PROCESSORS[number];
export type IntegrationHealth = { processor: IntegrationProcessor; state: "unknown" | "running" | "succeeded" | "failed" | "unavailable"; lastAttemptAt: string | null; lastSuccessAt: string | null };

/** Append-only operational evidence. Never persist tokens, mail bodies or provider errors. */
export async function observeIntegration<T>(supabase: SupabaseClient | null, processor: IntegrationProcessor, operation: () => Promise<T>): Promise<T> {
  const runId = crypto.randomUUID();
  async function record(state: "running" | "succeeded" | "failed") {
    if (!supabase) return;
    try {
      const { error } = await supabase.from("crm_activity_events").insert({
        actor_email: "system", entity_type: "system", entity_id: runId,
        action: `${processor}.${state}`, metadata: { processor, runId, state },
      });
      if (error) console.warn("Integration health could not be recorded", processor, state);
    } catch { console.warn("Integration health could not be recorded", processor, state); }
  }
  await record("running");
  try { const result = await operation(); await record("succeeded"); return result; }
  catch (error) { await record("failed"); throw error; }
}

export async function loadIntegrationHealth(supabase: SupabaseClient): Promise<IntegrationHealth[]> {
  return Promise.all(PROCESSORS.map(async (processor) => {
    try {
    const query = () => supabase.from("crm_activity_events").select("created_at,action")
      .eq("entity_type", "system").eq("metadata->>processor", processor);
    const [latest, success] = await Promise.all([
      query().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1),
      query().eq("action", `${processor}.succeeded`).order("created_at", { ascending: false }).limit(1),
    ]);
    if (latest.error || success.error) return { processor, state: "unavailable", lastAttemptAt: null, lastSuccessAt: null };
    const event = latest.data?.[0];
    const state = event?.action?.split(".").at(-1);
    return { processor, state: state === "running" || state === "succeeded" || state === "failed" ? state : "unknown", lastAttemptAt: event?.created_at || null, lastSuccessAt: success.data?.[0]?.created_at || null };
    } catch { return { processor, state: "unavailable", lastAttemptAt: null, lastSuccessAt: null }; }
  }));
}

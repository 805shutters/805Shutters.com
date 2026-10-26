export const STAFF_TAKEOVER_SENTENCE = "The staff takeover portion cannot be summarized because the stream detached.";

export function callSummary(call, messages = []) {
  const related = (messages || []).filter((item) => item?.callId === call?.id);
  const confirmed = related.find((item) => item.confirmed && item.text);
  const written = confirmed || related.find((item) => item.text);
  const schedule = call?.schedule || {};
  const streamDetached = call?.ai === false;
  let outcome = "incomplete";
  if (call?.booking?.verified) outcome = "booked";
  else if (confirmed) outcome = "message";
  else if (call?.phase === "ended" && !written && !schedule.purpose && !schedule.messageText) outcome = "ended";
  const parts = [`Call ${call?.sid || call?.id || "unknown"} outcome: ${outcome}.`];
  if (confirmed?.text) parts.push(`Transcript: ${confirmed.text}`);
  else if (written?.text) parts.push(`Unconfirmed transcript: ${written.text}`);
  else if (schedule.messageText) parts.push(`Unconfirmed transcript: ${schedule.messageText}`);
  const captured = [];
  const name = schedule.name || written?.name;
  if (name && name !== "Name not confirmed") captured.push(`name ${name}`);
  if (schedule.phone) captured.push(`callback ${schedule.phone}`);
  if (schedule.date || schedule.weekday) captured.push(`day ${schedule.date || schedule.weekday}`);
  if (schedule.time || schedule.requestedTime || schedule.window) captured.push(`time ${schedule.time || schedule.requestedTime || schedule.window}`);
  if (schedule.address) captured.push(`address ${schedule.address}`);
  if (captured.length) parts.push(`Captured before the next question: ${captured.join("; ")}.`);
  if (outcome !== "booked" && outcome !== "message") parts.push("No verified booking or confirmed message was saved.");
  if (streamDetached) parts.push(STAFF_TAKEOVER_SENTENCE);
  return { text: parts.join(" ").slice(0, 4000), outcome, streamDetached, staffSpeech: null };
}

export function customerEstablished(call) {
  return Boolean(call?.customerId) && call?.matchStatus === "matched";
}

// SnapshotStore.get returns a clone. The media-stop callback has to write the ended call back.
export function persistEndedSummary(engine, store, callId) {
  const current = store.get("call", callId);
  if (current?.phase !== "ended") return false;
  engine.recordSummary(current);
  store.put("call", current);
  return true;
}

// The activity upsert is idempotent. A database failure or an interrupted claim
// goes back to pending for the watchdog. It never speaks and never invents staff speech.
export async function runSummarySync({ load, save, sync, now = Date.now() }) {
  const current = await load();
  const call = current?.call;
  const established = call?.phase === "ended" && customerEstablished(call);
  if (!established) {
    await save((fresh, effect) => {
      if (fresh && fresh.summarySync !== "synced") fresh.summarySync = "local";
      if (effect) effect.status = "done";
    });
    return { saved: false };
  }
  try {
    const result = await sync(call, current.messages || []);
    if (!result?.saved) {
      await save((fresh, effect) => {
        if (fresh && fresh.summarySync !== "synced") fresh.summarySync = "local";
        if (effect) {
          effect.status = "done";
          effect.error = result?.reason || "not-saved";
        }
      });
      return { saved: false };
    }
    await save((fresh, effect) => {
      if (!fresh) return;
      if (fresh.customerId !== call.customerId || fresh.matchStatus !== "matched") {
        fresh.summarySync = "pending";
        if (effect) {
          effect.status = "pending";
          effect.nextAt = now;
        }
        return;
      }
      fresh.summarySync = "synced";
      fresh.summaryJobId = result.job_id || null;
      fresh.summaryCustomerId = fresh.customerId;
      if (effect) {
        effect.status = "done";
        effect.error = null;
      }
    });
    return { saved: true };
  } catch (error) {
    const message = error?.message || "Call summary failed";
    await save((fresh, effect) => {
      const attempts = effect?.attempts || 1;
      const failed = attempts >= 8;
      if (fresh) fresh.summarySync = failed ? "failed" : "pending";
      if (effect) {
        effect.status = failed ? "failed" : "pending";
        effect.error = message;
        effect.nextAt = now + Math.min(300000, 5000 * 2 ** Math.min(attempts, 6));
      }
    });
    return { saved: false, retry: true };
  }
}

export async function saveCallSummary(client, call, messages = []) {
  if (!call?.customerId) return { saved: false, reason: "no-identity" };
  const summary = callSummary(call, messages);
  const { data, error } = await client.rpc("voice_805_save_summary", {
    p_call_sid: call.sid,
    p_customer_id: call.customerId,
    p_phone: call.from || "",
    p_summary: summary.text,
    p_outcome: summary.outcome,
    p_stream_detached: summary.streamDetached,
  });
  if (error) throw new Error(error.message || "Call summary failed");
  return data || { saved: false };
}

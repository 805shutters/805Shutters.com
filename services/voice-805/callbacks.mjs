export async function saveCallback(client, fields) {
  const { data, error } = await client.rpc("voice_805_save_callback", fields);
  if (error) throw new Error(error.message || "Callback list update failed");
  return data;
}

export async function logFailure(client, action, callId, detail) {
  const { error } = await client.rpc("voice_805_log_failure", {
    p_action: action,
    p_call_id: callId || null,
    p_detail: String(detail || "").slice(0, 500),
  });
  if (error) throw new Error(error.message || "Failure log failed");
}

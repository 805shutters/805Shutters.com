export async function matchCustomerByPhone(client, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const keys = [...new Set([phone, national, digits].filter(Boolean))];
  const { data, error } = await client.from("crm_customers").select("id").in("phone", keys);
  if (error) throw new Error(error.message || "Customer lookup failed");
  const ids = [...new Set((data || []).map((row) => row.id).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

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

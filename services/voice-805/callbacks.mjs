import { callerTranscriptText } from './message-intake.mjs';

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

// Same idempotent callback RPC used by the live Message Center, followed by an
// independent read. Neither a transport success nor a model claim proves a save.
export async function savePhoneMessage(client, call, message) {
  const transcript = callerTranscriptText(call) || message.text;
  const reason = `${message.completed ? 'Received' : message.confirmed ? 'Confirmed' : 'Unconfirmed'} message: ${message.text}`;
  const row = await saveCallback(client, {
    p_call_sid: call.sid, p_caller_name: message.name || '', p_callback_number: message.callback || '',
    p_reason: reason, p_transcript: transcript, p_recording_url: '',
    p_call_time: new Date(call.createdAt).toISOString(), p_phone: call.from || '',
    p_status: 'needs_callback', p_appointment_id: null, p_customer_id: call.customerId || message.customerId || null,
  });
  if (!row?.id || row.call_sid !== call.sid) throw new Error('Message write not verified');
  const { data, error } = await client.from('crm_callback_items').select('id,call_sid,caller_name,callback_number,call_time,transcript,reason,recording_url,status').eq('call_sid', call.sid).single();
  if (error || data?.id !== row.id || data.call_sid !== call.sid || data.reason !== reason || data.transcript !== transcript || data.callback_number !== (message.callback || '') || data.recording_url !== '') throw new Error('Message readback not verified');
  return { verified: true, ...data };
}

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendVoiceAgentOwnerAlert, VoiceAgentOwnerAlertInput } from "@/lib/voice-agent/owner-alerts";

export const runtime = "nodejs";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validVoiceAgentSecret(request: NextRequest): boolean {
  const secret = process.env.XAI_VOICE_AGENT_WEBHOOK_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerSecret = request.headers.get("x-voice-agent-secret") || "";
  const provided = bearer || headerSecret;
  return Boolean(provided) && safeEqual(provided, secret);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest) {
  if (!validVoiceAgentSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input: VoiceAgentOwnerAlertInput = {
    type: readString(payload.type) || readString(payload.event_type),
    callerName: readString(payload.callerName) || readString(payload.caller_name) || readString(payload.name),
    callerPhone: readString(payload.callerPhone) || readString(payload.caller_phone) || readString(payload.phone),
    summary: readString(payload.summary),
    message: readString(payload.message) || readString(payload.voicemail),
    callbackWindow: readString(payload.callbackWindow) || readString(payload.callback_window),
    callId: readString(payload.callId) || readString(payload.call_id) || readString(payload.conversation_id),
  };

  const result = await sendVoiceAgentOwnerAlert(input);
  if (!result.sent) {
    return NextResponse.json(
      { sent: false, skipped: result.skipped, error: result.result?.error || result.result?.skipped },
      { status: 503 },
    );
  }

  return NextResponse.json({ sent: true });
}

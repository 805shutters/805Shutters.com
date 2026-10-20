# Grok media receptionist

The live answer path is Twilio Media Streams to the Grok Voice API (`grok-voice-3.0`). Hosted SIP and ConversationRelay are not used for this flow.

1. Twilio answers and plays the fixed greeting in Grok's `ara` voice: "Thank you for calling 805 Shutters. We appreciate you supporting local business. Let me get you over to one of our team members immediately." The audio is rendered once with `POST https://api.x.ai/v1/tts` (`voice_id` `ara`, `language` `en`, wav at 8000 Hz). A live response is PCM 16-bit mono at 8000 Hz with a streaming header (RIFF size `0x80000023`, data size `0x7fffffff`); both sizes are rewritten from the file length before the wav is stored in the private `voice-805-prompts` bucket as `ara-{name}.wav` and served from `/twilio/prompts/greeting.wav` through `<Play>`. `<Say>` is used only when that audio is not available yet. The same cache covers the unavailable line and the voicemail prompt. After the greeting, conference wait audio is a looped ringing tone; it does not repeat speech.
2. Mike and Jessica start ringing when the call is answered, in parallel with that greeting, for `VOICE_805_OFFER_SECONDS` (default 20). The offer window is not extended by the greeting. Each leg uses `MachineDetection=Enable` and async AMD. Only `AnsweredBy=human` bridges. Machine, beep, silence, fax, and unknown results hang up that leg. The caller's leg is not redirected until the greeting audio finishes.
3. If nobody answers, the caller is connected to `wss://{origin}/twilio/media/{call id}`. The WebSocket is authorized with the Twilio signature on the canonical HTTPS URL. The API key is not in the URL.
4. Grok apologizes and asks whether the caller wants to leave a message or schedule a consultation. Scheduling asks when first, then uses city, street address, geocoding, calendar availability, and travel checks. A missed requested time returns the closest open times. If none fit, the caller leaves a message.
5. A save happens only after the exact readback has played and the caller says yes. Ambiguous speech, silence, interruption, or a correction does not save. Appointments commit through `voice_805_book_confirmed` only when `VOICE_805_BOOKING_AUTHORIZED=true` and the dataset is production. Messages are verified in `crm_callback_items`.
6. If Grok fails, `/twilio/fallback.xml` plays the voicemail prompt in the cached Grok voice when that wav is ready, then records a voicemail. `<Say>` remains the fallback.

The realtime socket stays `wss://api.x.ai/v1/realtime?model=grok-voice-3.0` with session voice `ara` and G.711 `audio/pcmu`. The media WebSocket is accepted before the call row is loaded, because the hosted gateway turns a non-101 response to an Upgrade request into HTTP 502. xAI's current voice docs list `grok-voice-3.0` as the flagship model (`grok-voice-latest` is only an alias) and document `POST /v1/tts` plus the `ara` voice. An unauthenticated `POST /v1/tts` and `GET /v1/realtime?model=grok-voice-3.0` both returned HTTP 401, so those paths exist. `VOICE_805_XAI_API_KEY` was not in this environment, so live synthesis and an authenticated realtime handshake were not run. `GET /v1/tts/voices` timed out without a status and was not treated as verified.

Suggested URLs after a future deploy, with `ORIGIN` equal to `VOICE_805_PUBLIC_ORIGIN`:

- Voice webhook: `POST {ORIGIN}/twilio/inbound`
- Status callback: `POST {ORIGIN}/twilio/status`
- Fallback: `POST {ORIGIN}/twilio/fallback.xml`

Leave `VOICE_805_MODE=standby` until greeting audio, both handsets, machine detection, spoken confirmation, and a verified CRM save have been observed on a real call. Do not buy Grok credits or change the live number from this branch.

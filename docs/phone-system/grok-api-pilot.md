# Grok greeting and xAI console agent

The greeting is cached `ara` TTS. If nobody answers, Twilio dials the xAI console voice agent over SIP. This function does not open a Grok websocket.

1. Twilio answers and plays the fixed greeting in Grok's `ara` voice: "Thank you for calling 805 Shutters. We appreciate you supporting local business. Let me get you over to one of our team members immediately." The audio is rendered once with `POST https://api.x.ai/v1/tts` (`voice_id` `ara`, `language` `en`, wav at 8000 Hz). A live response is PCM 16-bit mono at 8000 Hz with a streaming header (RIFF size `0x80000023`, data size `0x7fffffff`); both sizes are rewritten from the file length before the wav is stored in the private `voice-805-prompts` bucket as `ara-{name}.wav` and served from `/twilio/prompts/greeting.wav` through `<Play>`. `<Say>` is used only when that audio is not available yet. The same cache covers the unavailable line and the voicemail prompt. After the greeting, conference wait audio is a silent `<Pause>`; it does not repeat speech.
2. Mike and Jessica start ringing when the call is answered, in parallel with that greeting, for `VOICE_805_OFFER_SECONDS` (default 20). The offer window is not extended by the greeting. Each leg uses `MachineDetection=Enable` and async AMD. Only `AnsweredBy=human` bridges. Machine, beep, silence, fax, and unknown results hang up that leg. The caller's leg is not redirected until the greeting audio finishes.
3. If nobody answers, Twilio `<Dial>`s `VOICE_805_XAI_SIP_URI`. The expected value is `sip:+18055908050@sip.voice.x.ai;transport=tls` with no query string. The function adds `X-805-Call-Id` as a SIP header. The Dial action is `POST {ORIGIN}/twilio/continue/{call id}` with a 30 second ring timeout. `DialCallStatus` `completed` or `answered` hangs up. `failed`, `no-answer`, `busy`, or `canceled` returns the voicemail `<Record>`. A missing or invalid SIP URI returns that voicemail immediately. Registering the number with xAI is a separate step and is not called from this repo.
4. The console agent posts to bearer-authenticated tools on this function. `save_message` writes `crm_callback_items` through `voice_805_save_callback` and matches one customer by phone. `check_availability` reads open consultation times for a Pacific `preferred_time` and does not geocode or save. `book_consultation` stays closed unless `VOICE_805_BOOKING_AUTHORIZED=true` and the dataset is production. The tool secret is `VOICE_805_AGENT_TOOL_TOKEN`.
5. If the SIP leg fails, the Dial action plays the voicemail prompt in the cached Grok voice when that wav is ready, then records. `<Say>` remains the fallback. The carrier fallback URL stays `POST {ORIGIN}/twilio/fallback.xml`.

`POST /v1/tts` with voice `ara` is unchanged. This function does not open `wss://api.x.ai/v1/realtime`.

Suggested URLs after a future deploy, with `ORIGIN` equal to `VOICE_805_PUBLIC_ORIGIN`:

- Voice webhook: `POST {ORIGIN}/twilio/inbound`
- Status callback: `POST {ORIGIN}/twilio/status`
- Fallback: `POST {ORIGIN}/twilio/fallback.xml`

Leave `VOICE_805_MODE=standby` until greeting audio, both handsets, machine detection, the SIP agent, and a verified callback save have been observed on a real call. Do not buy Grok credits or change the live number from this branch.

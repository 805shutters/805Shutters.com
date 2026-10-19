# Grok media receptionist

The live answer path is Twilio Media Streams to the Grok Voice API (`grok-voice-3.0`). Hosted SIP and ConversationRelay are not used for this flow.

1. Twilio answers and says: "Thank you for calling 805 Shutters. We appreciate you supporting local business. Let me get you over to one of our team members immediately."
2. Mike and Jessica ring together for `VOICE_805_OFFER_SECONDS` (default 20). Each leg uses `MachineDetection=Enable` and async AMD. Only `AnsweredBy=human` bridges. Machine, beep, silence, fax, and unknown results hang up that leg.
3. If nobody answers, the caller is connected to `wss://{origin}/twilio/media/{call id}`. The WebSocket is authorized with the Twilio signature on the canonical HTTPS URL. The API key is not in the URL.
4. Grok apologizes and asks whether the caller wants to leave a message or schedule a consultation. Scheduling asks when first, then uses city, street address, geocoding, calendar availability, and travel checks. A missed requested time returns the closest open times. If none fit, the caller leaves a message.
5. A save happens only after the exact readback has played and the caller says yes. Ambiguous speech, silence, interruption, or a correction does not save. Appointments commit through `voice_805_book_confirmed` only when `VOICE_805_BOOKING_AUTHORIZED=true` and the dataset is production. Messages are verified in `crm_callback_items`.
6. If Grok fails, `/twilio/fallback.xml` plays a short prompt and records a voicemail.

Suggested URLs after a future deploy, with `ORIGIN` equal to `VOICE_805_PUBLIC_ORIGIN`:

- Voice webhook: `POST {ORIGIN}/twilio/inbound`
- Status callback: `POST {ORIGIN}/twilio/status`
- Fallback: `POST {ORIGIN}/twilio/fallback.xml`

Leave `VOICE_805_MODE=standby` until greeting audio, both handsets, machine detection, spoken confirmation, and a verified CRM save have been observed on a real call. Do not buy Grok credits or change the live number from this branch.

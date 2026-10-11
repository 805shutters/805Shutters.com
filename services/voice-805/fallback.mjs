import { xml, twiml } from "./security.mjs";
const say = value => `<Say>${xml(value)}</Say>`;
export function fallback(engine, call, step, p, config) {
  if (call.phase === "ended") return twiml("<Hangup/>");
  const url = (next) =>
    xml(`${config.origin}/twilio/fallback/${call.id}/${next}`);
  const gather = (next, prompt, input = "speech", extra = "") =>
    twiml(
      `<Gather input="${input}" actionOnEmptyResult="true" action="${url(next)}" timeout="7" speechTimeout="auto" ${extra}>${say(prompt)}</Gather>`,
    );
  const current = engine.store.get("draft", call.id) || { id: call.id };
  if (step === "name")
    return gather("number", config.fallbackGreeting + " Please say your name.");
  if (step === "number") {
    current.name = (p.get("SpeechResult") || "").slice(0, 120);
    engine.store.put("draft", current);
    return gather(
      "message",
      "Enter your callback number including country code, followed by the pound key.",
      "dtmf",
      'finishOnKey="#"',
    );
  }
  if (step === "message") {
    current.callback = "+" + (p.get("Digits") || "");
    engine.store.put("draft", current);
    return gather("confirm", "Please say your short message.");
  }
  if (step === "confirm") {
    current.message = (p.get("SpeechResult") || "").slice(0, 2000);
    engine.store.put("draft", current);
    return gather(
      "save",
      `Your name is ${current.name}. Your callback number is ${[...(current.callback || "")].join(" ")}. Your message is ${current.message}. Press 1 to confirm and save, or any other key to start again.`,
      "dtmf",
      'numDigits="1"',
    );
  }
  if (step === "save" && p.get("Digits") === "1") {
    try {
      engine.saveMessage(
        call.id,
        { ...current, confirmed: true },
        `fallback:${call.id}`,
      );
      return twiml(
        say(
          "Your message has been saved for the 805 Shutters team. Thank you.",
        ) + "<Hangup/>",
      );
    } catch {
      return twiml(
        say("Your message could not be saved. Please try again.") +
          `<Redirect>${url("name")}</Redirect>`,
      );
    }
  }
  return twiml(`<Redirect>${url("name")}</Redirect>`);
}

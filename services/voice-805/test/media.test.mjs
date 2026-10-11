import { EventEmitter } from "node:events";
import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../store.mjs";
import { Engine } from "../engine.mjs";
import { MediaBridge } from "../media.mjs";
import { loadConfig } from "../config.mjs";
class Socket extends EventEmitter {
  static instances = [];
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.bufferedAmount = 0;
    Socket.instances.push(this);
  }
  send(value) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close");
  }
  receive(event) {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
}
test("media binds account/call/token; greeting playback precedes offers; disconnect blocks residual audio", () => {
  const store = new Store(":memory:");
  try {
    const config = {
      ...loadConfig({}),
      accountSid: "AC805",
      controlKey: "secret",
      offerSeconds: 25,
      greeting: "Test greeting",
      closedGreeting: "Test closed",
    };
    const engine = new Engine(store, config),
      bridge = new MediaBridge(engine, config, Socket);
    const call = engine.inbound("CA805", "+15555550100");
    call.open = true;
    store.put("call", call);
    const twilio = new Socket();
    bridge.attach(twilio);
    twilio.receive({
      event: "start",
      start: {
        customParameters: { callId: call.id, token: bridge.token(call) },
        accountSid: "AC805",
        callSid: "CA805",
        streamSid: "MZ805",
        mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000 },
      },
    });
    const xai = Socket.instances.at(-1);
    xai.emit("open");
    xai.receive({ type: "session.updated" });
    assert.equal(xai.sent[0].session.audio.input.format.type, "audio/pcmu");
    xai.receive({ type: "response.output_audio.delta", delta: "AAAA" });
    xai.receive({ type: "response.done" });
    assert.equal(store.get("call", call.id).phase, "greeting");
    const mark = twilio.sent.find((e) => e.event === "mark");
    twilio.receive({ event: "mark", streamSid: "MZ805", mark: mark.mark });
    assert.equal(store.get("call", call.id).phase, "offering");
    bridge.disconnect(call.id);
    const count = twilio.sent.length;
    xai.receive({ type: "response.output_audio.delta", delta: "BBBB" });
    assert.equal(twilio.sent.length, count);
    assert.equal(twilio.sent.at(-1).event, "clear");
    assert.equal(xai.readyState, 3);
  } finally {
    store.close();
  }
});
test("a mismatched stream identity is closed without connecting xAI", () => {
  const store = new Store(":memory:");
  try {
    const config = {
        ...loadConfig({}),
        accountSid: "AC805",
        controlKey: "secret",
      },
      engine = new Engine(store, config),
      bridge = new MediaBridge(engine, config, Socket),
      call = engine.inbound("CA805", "anonymous"),
      twilio = new Socket(),
      before = Socket.instances.length;
    bridge.attach(twilio);
    twilio.receive({
      event: "start",
      start: {
        customParameters: { callId: call.id, token: "wrong" },
        accountSid: "ACmts",
        callSid: call.sid,
      },
    });
    assert.equal(twilio.readyState, 3);
    assert.equal(Socket.instances.length, before);
  } finally {
    store.close();
  }
});

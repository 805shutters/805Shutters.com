"use client";
import { useRef, useState } from "react";
export function MessageActions({
  id,
  disabled,
  action,
}: {
  id: string;
  disabled: boolean;
  action: (path: string, body: unknown) => Promise<boolean>;
}) {
  const [composing, setComposing] = useState(false),
    [text, setText] = useState(""),
    [consent, setConsent] = useState(false);
  const sendId = useRef<string | null>(null);
  async function send() {
    sendId.current ??= crypto.randomUUID();
    if (
      await action(`messages/${id}/text`, {
        text,
        consent,
        commandId: sendId.current,
      })
    ) {
      setText("");
      setConsent(false);
      setComposing(false);
      sendId.current = null;
    }
  }
  return (
    <div className="mt-4">
      <div className="flex flex-wrap">
        <button
          disabled={disabled}
          onClick={() =>
            void action(`messages/${id}/callback`, {
              commandId: crypto.randomUUID(),
            })
          }
        >
          Call back through 805
        </button>
        <button disabled={disabled} onClick={() => setComposing(!composing)}>
          {composing ? "Close text draft" : "Text from 805"}
        </button>
      </div>
      {composing && (
        <div className="mt-3">
          <label>
            Reply text
            <textarea
              maxLength={1000}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                sendId.current = null;
              }}
            />
          </label>
          <label className="mt-2 block">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I have permission to text this customer.
          </label>
          <button
            disabled={disabled || !consent || !text.trim()}
            onClick={() => void send()}
          >
            Send text from 805
          </button>
          <p className="text-sm text-slate-600">
            Delivery status appears with the message. Your personal number is
            not used.
          </p>
        </div>
      )}
    </div>
  );
}

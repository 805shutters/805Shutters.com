import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MOBILE_QUOTE_ROOM_PRESETS,
  newMobileQuoteWindow,
  type MobileQuoteWindow,
} from "@/lib/crm/mobile-quote-draft";
import { MobileRoomSelector } from "./MobileRoomSelector";

const noop = () => undefined;

function renderRoomSelector(window: MobileQuoteWindow) {
  return renderToStaticMarkup(React.createElement(MobileRoomSelector, {
    window,
    onSelectRoom: noop,
    onSelectBedroom: noop,
    onCustomRoomChange: noop,
    onSelectLetter: noop,
  }));
}

describe("MobileRoomSelector", () => {
  it("renders all 15 room buttons in order, with no initial input, letters, or dropdown", () => {
    const markup = renderRoomSelector(newMobileQuoteWindow());
    let previousIndex = -1;
    for (const room of MOBILE_QUOTE_ROOM_PRESETS) {
      const index = markup.indexOf(`>${room}</button>`);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(MOBILE_QUOTE_ROOM_PRESETS).toHaveLength(15);
    expect(markup).not.toMatch(/<input|Window letter|<select|combobox/i);
  });

  it("renders Bedroom choices but no letters until a numbered bedroom is selected", () => {
    const bedroom = { ...newMobileQuoteWindow(), room: "Bedroom", roomChoice: "Bedroom" as const };
    const pendingMarkup = renderRoomSelector(bedroom);
    for (let number = 1; number <= 5; number += 1) {
      expect(pendingMarkup).toContain(`>Bedroom ${number}</button>`);
    }
    expect(pendingMarkup).not.toContain("Window letter");

    const selectedMarkup = renderRoomSelector({ ...bedroom, room: "Bedroom 2" });
    expect(selectedMarkup).toMatch(/aria-pressed="true">Bedroom 2<\/button>/);
    expect(selectedMarkup).toContain("Window letter");
    expect(selectedMarkup).not.toMatch(/<select|combobox/i);
  });

  it("renders Custom input and letters only for a concrete name, including selected-letter markup", () => {
    const custom = { ...newMobileQuoteWindow(), roomChoice: "Custom" as const };
    const emptyMarkup = renderRoomSelector(custom);
    expect(emptyMarkup).toMatch(/<input[^>]*placeholder="Enter room name"/);
    expect(emptyMarkup).not.toContain("Window letter");

    const namedMarkup = renderRoomSelector({ ...custom, room: "Sunroom", position: "C" });
    expect(namedMarkup).toMatch(/<input[^>]*value="Sunroom"/);
    expect(namedMarkup).toContain("Window letter");
    expect(namedMarkup).toMatch(/aria-pressed="true">C<\/button>/);
    expect(namedMarkup).not.toMatch(/<select|combobox/i);
  });
});

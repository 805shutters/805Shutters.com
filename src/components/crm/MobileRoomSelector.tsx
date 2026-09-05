"use client";

import {
  hasConcreteMobileQuoteRoom,
  mobileQuoteRoomChoice,
  MOBILE_QUOTE_ROOM_PRESETS,
  MOBILE_QUOTE_WINDOW_LETTERS,
  type MobileQuoteRoomChoice,
  type MobileQuoteWindow,
} from "@/lib/crm/mobile-quote-draft";
import styles from "./MobileQuoteWalkthrough.module.css";

export function MobileRoomSelector({
  window,
  onSelectRoom,
  onSelectBedroom,
  onCustomRoomChange,
  onSelectLetter,
}: {
  window: MobileQuoteWindow;
  onSelectRoom: (room: MobileQuoteRoomChoice) => void;
  onSelectBedroom: (room: string) => void;
  onCustomRoomChange: (room: string) => void;
  onSelectLetter: (letter: string) => void;
}) {
  const choice = mobileQuoteRoomChoice(window);
  const concreteRoom = hasConcreteMobileQuoteRoom(window);
  const selectedLetter = MOBILE_QUOTE_WINDOW_LETTERS.includes(
    window.position as (typeof MOBILE_QUOTE_WINDOW_LETTERS)[number],
  ) ? window.position : "";

  return <div className={styles.roomSelector}>
    <div className={styles.quickButtons} role="group" aria-label="Room presets">
      {MOBILE_QUOTE_ROOM_PRESETS.map((room) => <button
        key={room}
        type="button"
        aria-pressed={choice === room}
        onClick={() => onSelectRoom(room)}
      >{room}</button>)}
    </div>
    {choice === "Bedroom" && <div className={styles.bedroomButtons} role="group" aria-label="Bedroom number">
      {[1, 2, 3, 4, 5].map((number) => {
        const room = `Bedroom ${number}`;
        return <button key={room} type="button" aria-pressed={window.room === room} onClick={() => onSelectBedroom(room)}>{room}</button>;
      })}
    </div>}
    {choice === "Custom" && <label>Room name<input
      value={window.room}
      onChange={(event) => onCustomRoomChange(event.target.value)}
      placeholder="Enter room name"
      autoFocus
    /></label>}
    {concreteRoom && <fieldset className={styles.windowLetters}>
      <legend>Window letter</legend>
      {window.position && !selectedLetter && <p>Existing position: {window.position}</p>}
      <div className={styles.quickButtons} role="group" aria-label="Window letter">
        {MOBILE_QUOTE_WINDOW_LETTERS.map((letter) => <button
          key={letter}
          type="button"
          aria-pressed={selectedLetter === letter}
          onClick={() => onSelectLetter(letter)}
        >{letter}</button>)}
      </div>
    </fieldset>}
  </div>;
}

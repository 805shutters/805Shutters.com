"use client";

import { useEffect, useState } from "react";
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
  const selectedBedroom = choice === "Bedroom" && /^Bedroom [1-5]$/.test(window.room) ? window.room : "";
  const selectedLetter = MOBILE_QUOTE_WINDOW_LETTERS.includes(window.position as (typeof MOBILE_QUOTE_WINDOW_LETTERS)[number]) ? window.position : "";
  const [roomOpen, setRoomOpen] = useState(() => !choice || (choice === "Custom" && !window.room.trim()));
  const [bedroomOpen, setBedroomOpen] = useState(() => !selectedBedroom);
  const [letterOpen, setLetterOpen] = useState(() => !selectedLetter);

  useEffect(() => { if (!choice || (choice === "Custom" && !window.room.trim())) setRoomOpen(true); }, [choice, window.room]);
  useEffect(() => { if (choice === "Bedroom" && !selectedBedroom) setBedroomOpen(true); }, [choice, selectedBedroom]);
  useEffect(() => { if (concreteRoom && !selectedLetter) setLetterOpen(true); }, [concreteRoom, selectedLetter]);

  const roomSummary = choice === "Custom" && window.room.trim() ? window.room : choice;
  const roomChoices = choice && !roomOpen ? [choice] : MOBILE_QUOTE_ROOM_PRESETS;
  const bedroomChoices = selectedBedroom && !bedroomOpen ? [selectedBedroom] : [1, 2, 3, 4, 5].map((number) => `Bedroom ${number}`);
  const letterChoices = selectedLetter && !letterOpen ? [selectedLetter] : MOBILE_QUOTE_WINDOW_LETTERS;

  return <div className={styles.roomSelector}>
    <div className={styles.quickButtons} role="group" aria-label="Room presets">
      {roomChoices.map((room) => {
        const selected = choice === room;
        return <button
          key={room}
          type="button"
          aria-pressed={selected}
          aria-expanded={selected ? roomOpen : undefined}
          aria-label={selected ? `${roomSummary} selected. ${roomOpen ? "Choose a room" : "Show room choices"}` : undefined}
          onClick={() => {
            if (selected) {
              if (choice === "Custom") setRoomOpen(true);
              else setRoomOpen((open) => !open);
              return;
            }
            onSelectRoom(room);
            if (room === "Custom") setRoomOpen(true);
            else setRoomOpen(false);
            if (room === "Bedroom") setBedroomOpen(true);
          }}
        >{selected ? roomSummary : room}</button>;
      })}
    </div>
    {choice === "Bedroom" && <div className={styles.bedroomButtons} role="group" aria-label="Bedroom number">
      {bedroomChoices.map((room) => {
        const selected = window.room === room;
        return <button
          key={room}
          type="button"
          aria-pressed={selected}
          aria-expanded={selected ? bedroomOpen : undefined}
          aria-label={selected ? `${room} selected. ${bedroomOpen ? "Choose a bedroom number" : "Show bedroom numbers"}` : undefined}
          onClick={() => {
            if (selected) setBedroomOpen((open) => !open);
            else { onSelectBedroom(room); setBedroomOpen(false); }
          }}
        >{room}</button>;
      })}
    </div>}
    {choice === "Custom" && roomOpen && <div className={styles.customRoom}><div><label htmlFor={`custom-room-${window.id}`}>Room name</label><input
      id={`custom-room-${window.id}`}
      value={window.room}
      onChange={(event) => onCustomRoomChange(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter" && window.room.trim()) setRoomOpen(false); }}
      placeholder="Enter room name"
      autoFocus
    /></div><button type="button" disabled={!window.room.trim()} onClick={() => setRoomOpen(false)}>Done</button></div>}
    {concreteRoom && <fieldset className={styles.windowLetters}>
      <legend>Window letter</legend>
      {window.position && !selectedLetter && <p>Existing position: {window.position}</p>}
      <div className={styles.quickButtons} role="group" aria-label="Window letter">
        {letterChoices.map((letter) => {
          const selected = selectedLetter === letter;
          return <button
            key={letter}
            type="button"
            aria-pressed={selected}
            aria-expanded={selected ? letterOpen : undefined}
            aria-label={selected ? `${letter} selected. ${letterOpen ? "Choose a window letter" : "Show window letters"}` : undefined}
            onClick={() => {
              if (selected) setLetterOpen((open) => !open);
              else { onSelectLetter(letter); setLetterOpen(false); }
            }}
          >{letter}</button>;
        })}
      </div>
    </fieldset>}
  </div>;
}

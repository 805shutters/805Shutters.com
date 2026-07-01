import { useState } from "react";
import { ROOM_PRESETS } from "@mts/lib/quoteConstants";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { Plus } from "lucide-react";

interface RoomPresetButtonsProps {
  onSelect: (room: string) => void;
  disabled?: boolean;
  lineNumbers?: ReadonlyMap<string, readonly number[]>;
}

const ROOM_PRESET_SET = new Set<string>(ROOM_PRESETS);

function formatLineNumbers(lineNumbers: readonly number[]) {
  return lineNumbers.join(", ");
}

export function RoomPresetButtons({ onSelect, disabled = false, lineNumbers }: RoomPresetButtonsProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const customRoomsWithLineNumbers = Array.from(lineNumbers?.entries() ?? [])
    .filter(([room, numbers]) => numbers.length > 0 && !ROOM_PRESET_SET.has(room))
    .sort(([roomA], [roomB]) => roomA.localeCompare(roomB));

  const handleCustomSubmit = () => {
    if (!disabled && customName.trim()) {
      onSelect(customName.trim());
      setCustomName("");
      setShowCustom(false);
    }
  };

  return (
    <div className="quote-add-card rounded-[1.5rem] border border-white/80 bg-white/60 p-3 shadow-[0_18px_45px_rgba(15,35,70,0.07)] backdrop-blur">
      <div className="quote-add-button-row flex flex-wrap gap-2">
        {ROOM_PRESETS.map((room) => {
          const numbers = lineNumbers?.get(room) ?? [];

          return (
            <button
              key={room}
              disabled={disabled}
              onClick={() => onSelect(room)}
              className="quote-room-option rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-bold text-[#1c1c1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,35,70,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1c1c1a] hover:bg-[#1c1c1a] hover:text-white hover:shadow-[0_14px_28px_rgba(15,35,70,0.16)] disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:translate-y-0"
            >
              <span>{room}</span>
              {numbers.length > 0 && (
                <span className="quote-count-badge" title={`Line ${formatLineNumbers(numbers)}`}>
                  {formatLineNumbers(numbers)}
                </span>
              )}
            </button>
          );
        })}

        {customRoomsWithLineNumbers.map(([room, numbers]) => (
          <button
            key={room}
            disabled={disabled}
            onClick={() => onSelect(room)}
            className="quote-room-option rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-bold text-[#1c1c1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,35,70,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1c1c1a] hover:bg-[#1c1c1a] hover:text-white hover:shadow-[0_14px_28px_rgba(15,35,70,0.16)] disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:translate-y-0"
          >
            <span>{room}</span>
            <span className="quote-count-badge" title={`Line ${formatLineNumbers(numbers)}`}>
              {formatLineNumbers(numbers)}
            </span>
          </button>
        ))}

        {showCustom ? (
          <div className="flex items-center gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Room name"
              className="quote-room-custom-input h-10 w-40 rounded-full border-slate-300 bg-white"
              autoFocus
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
                if (e.key === "Escape") setShowCustom(false);
              }}
            />
            <Button size="sm" onClick={handleCustomSubmit} disabled={disabled}>
              Add
            </Button>
          </div>
        ) : (
          <button
            disabled={disabled}
            onClick={() => setShowCustom(true)}
            className="quote-room-option flex items-center gap-1 rounded-full border border-dashed border-[#1c1c1a] bg-white/80 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1c1c1a] hover:text-white disabled:cursor-not-allowed disabled:opacity-100 disabled:hover:translate-y-0"
          >
            <Plus className="h-3 w-3" />
            Custom
          </button>
        )}
      </div>
    </div>
  );
}

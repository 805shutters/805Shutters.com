import { useState } from "react";
import { ROOM_PRESETS } from "@mts/lib/quoteConstants";
import { Button } from "@mts/components/ui/button";
import { Input } from "@mts/components/ui/input";
import { Plus } from "lucide-react";

interface RoomPresetButtonsProps {
  onSelect: (room: string) => void;
}

export function RoomPresetButtons({ onSelect }: RoomPresetButtonsProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");

  const handleCustomSubmit = () => {
    if (customName.trim()) {
      onSelect(customName.trim());
      setCustomName("");
      setShowCustom(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-white/80 bg-white/60 p-3 shadow-[0_18px_45px_rgba(15,35,70,0.07)] backdrop-blur">
      <div className="mb-2 px-1 text-[0.7rem] font-black uppercase tracking-[0.22em] text-slate-500">
        Rooms
      </div>
      <div className="flex flex-wrap gap-2">
        {ROOM_PRESETS.map((room) => (
          <button
            key={room}
            onClick={() => onSelect(room)}
            className="rounded-full border border-slate-300 bg-white/95 px-4 py-2 text-sm font-bold text-[#1c1c1a] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_18px_rgba(15,35,70,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#1c1c1a] hover:bg-[#1c1c1a] hover:text-white hover:shadow-[0_14px_28px_rgba(15,35,70,0.16)]"
          >
            {room}
          </button>
        ))}

        {showCustom ? (
          <div className="flex items-center gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Room name"
              className="h-10 w-40 rounded-full border-slate-300 bg-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSubmit();
                if (e.key === "Escape") setShowCustom(false);
              }}
            />
            <Button size="sm" onClick={handleCustomSubmit}>
              Add
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-[#1c1c1a] bg-white/80 px-4 py-2 text-sm font-bold text-slate-500 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1c1c1a] hover:text-white"
          >
            <Plus className="h-3 w-3" />
            Custom
          </button>
        )}
      </div>
    </div>
  );
}

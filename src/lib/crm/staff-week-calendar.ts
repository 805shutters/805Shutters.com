import { losAngelesTimeString } from "@/lib/booking/availability";
import type { CrmCalendarEvent } from "./types";
import { monthDayEvents } from "./staff-month-calendar";

export function weekCalendarDays(anchor: string) {
  const date = new Date(`${anchor}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return Array.from({ length: 7 }, (_, index) => new Date(date.getTime() + index * 86400000).toISOString().slice(0, 10));
}
export function shiftCalendarWeek(anchor: string, delta: number) {
  return new Date(Date.parse(`${anchor}T12:00:00Z`) + delta * 7 * 86400000).toISOString().slice(0, 10);
}
const minutes = (value: string) => {
  const [hour, minute] = losAngelesTimeString(new Date(value)).split(":").map(Number);
  return hour * 60 + minute;
};
function interval(event: CrmCalendarEvent, date: string) {
  // Clip multi-day events to this date without expanding the visible week.
  const sameDay = (value: string) => new Intl.DateTimeFormat("en-CA", {timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value)) === date;
  return { start: sameDay(event.start_at) ? minutes(event.start_at) : 0, end: sameDay(event.end_at) ? minutes(event.end_at) : 1440 };
}
export function weekTimeBounds(events: CrmCalendarEvent[], days: string[]) {
  let start = 8 * 60, end = 18 * 60;
  for (const date of days) for (const event of monthDayEvents(events, date)) {
    const time = interval(event, date);
    if (time.end - time.start >= 12 * 60 || event.event_type === "block") continue;
    start = Math.min(start, Math.floor(time.start / 60) * 60);
    end = Math.max(end, Math.ceil(time.end / 60) * 60);
  }
  return { start, end };
}
export function weekDayLayout(events: CrmCalendarEvent[], date: string, bounds: {start:number;end:number}) {
  const ordered = monthDayEvents(events, date).map(event => ({event, ...interval(event,date)})).filter(item => item.end > bounds.start && item.start < bounds.end);
  const result: {event:CrmCalendarEvent;top:number;height:number;lane:number;lanes:number}[] = [];
  let group: typeof ordered = [], groupEnd = -1;
  const flush = () => {
    const lanes: number[] = [];
    const items = group.map(item => {
      let lane = lanes.findIndex(end => end <= item.start);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = item.end;
      const start = Math.max(bounds.start,item.start), end = Math.min(bounds.end,item.end);
      return {event:item.event,lane,top:(start-bounds.start)/(bounds.end-bounds.start)*100,height:(end-start)/(bounds.end-bounds.start)*100};
    });
    result.push(...items.map(item=>({...item,lanes:lanes.length})));group=[];
  };
  for (const item of ordered) {
    if (group.length && item.start >= groupEnd) flush();
    if (!group.length) groupEnd = item.end;
    group.push(item);groupEnd=Math.max(groupEnd,item.end);
  }
  flush();return result;
}

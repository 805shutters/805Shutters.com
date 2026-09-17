import { describe, expect, it } from "vitest";
import { weekCalendarDays, shiftCalendarWeek, weekTimeBounds, weekDayLayout } from "./staff-week-calendar";
import type { CrmCalendarEvent } from "./types";
const event = (id:string,start:string,end:string) => ({id,start_at:start,end_at:end,status:"scheduled",event_type:"sales_consult"}) as CrmCalendarEvent;
describe("weekly staff calendar",()=>{
  it.each([['2026-09-16','2026-09-13','2026-09-19'],['2026-10-01','2026-09-27','2026-10-03'],['2027-01-01','2026-12-27','2027-01-02'],['2026-11-01','2026-11-01','2026-11-07']])("shows exactly Sunday through Saturday for %s",(date,first,last)=>{
    const days=weekCalendarDays(date);expect(days).toHaveLength(7);expect(days[0]).toBe(first);expect(days[6]).toBe(last);expect(new Set(days).size).toBe(7);
  });
  it("moves by calendar weeks across daylight saving boundaries",()=>{expect(shiftCalendarWeek('2026-11-01',1)).toBe('2026-11-08');expect(shiftCalendarWeek('2026-03-08',-1)).toBe('2026-03-01');});
  it("places appointments by Pacific time and separates overlaps within each day",()=>{
    const events=[event('a','2026-09-18T16:00:00Z','2026-09-18T17:00:00Z'),event('b','2026-09-18T16:30:00Z','2026-09-18T17:30:00Z'),event('c','2026-09-18T18:00:00Z','2026-09-18T19:00:00Z')];
    const layout=weekDayLayout(events,'2026-09-18',{start:480,end:1080});expect(layout.map(({top,height,lane,lanes})=>({top,height,lane,lanes}))).toEqual([{top:10,height:10,lane:0,lanes:2},{top:15,height:10,lane:1,lanes:2},{top:30,height:10,lane:0,lanes:1}]);
  });
  it("includes early and late appointments without expanding for all-day blocks",()=>{
    const days=weekCalendarDays('2026-09-18');const events=[event('early','2026-09-18T13:30:00Z','2026-09-18T14:30:00Z'),event('late','2026-09-19T02:00:00Z','2026-09-19T03:00:00Z'),event('all','2026-09-18T07:00:00Z','2026-09-19T07:00:00Z')];expect(weekTimeBounds(events,days)).toEqual({start:360,end:1200});
    const layout=weekDayLayout(events,'2026-09-18',{start:360,end:1200});expect(layout.every(item=>item.top>=0&&item.height>0&&item.top+item.height<=100)).toBe(true);
  });
});

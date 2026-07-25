export type CalendarOverlapEvent = {
  id: string;
  start_at: string;
  end_at: string;
};

export type CalendarOverlapLane = {
  lane: number;
  laneCount: number;
};

export function buildCalendarOverlapLayout(events: CalendarOverlapEvent[]) {
  const valid = events
    .map((event) => ({
      ...event,
      start: new Date(event.start_at).getTime(),
      end: new Date(event.end_at).getTime(),
    }))
    .filter((event) => Number.isFinite(event.start) && Number.isFinite(event.end) && event.end > event.start)
    .sort((left, right) => left.start - right.start || right.end - left.end || left.id.localeCompare(right.id));
  const layout = new Map<string, CalendarOverlapLane>();
  let group: Array<{ id: string; start: number; end: number; lane: number }> = [];
  let groupEnd = Number.NEGATIVE_INFINITY;
  let laneEnds: number[] = [];

  function commitGroup() {
    if (!group.length) return;
    const laneCount = Math.max(1, laneEnds.length);
    for (const event of group) layout.set(event.id, { lane: event.lane, laneCount });
    group = [];
    laneEnds = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  }

  for (const event of valid) {
    if (group.length && event.start >= groupEnd) commitGroup();
    let lane = laneEnds.findIndex((end) => end <= event.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(event.end);
    } else {
      laneEnds[lane] = event.end;
    }
    group.push({ id: event.id, start: event.start, end: event.end, lane });
    groupEnd = Math.max(groupEnd, event.end);
  }
  commitGroup();
  return layout;
}

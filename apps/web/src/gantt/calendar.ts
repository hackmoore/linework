import { toDayNumber, type GanttCalendar } from "@linework/shared";

/** 1899-12-25, a Monday before the earliest allowed date, so weekday counting has a fixed origin. */
const BASE_DAY = toDayNumber("1899-12-25");

/**
 * Working-day arithmetic. Days are day numbers (see toDayNumber). A "point" is the start
 * of a day, so a task covering days 10..12 runs from point 10 to point 13.
 * Indexes count working days from a fixed origin, which turns scheduling into integer maths.
 */
export interface WorkCalendar {
  readonly skipsDays: boolean;
  isWorkday(day: number): boolean;
  /** Number of working days before a point. */
  index(point: number): number;
  /** The day number of the working day with this index. */
  dayAt(index: number): number;
  /** Working days in [startDay, endDay], inclusive. */
  count(startDay: number, endDay: number): number;
  /** First working day on or after a day. */
  nextWorkday(day: number): number;
}

export function makeCalendar(calendar: GanttCalendar): WorkCalendar {
  const { skipWeekends } = calendar;
  const isWeekend = (day: number): boolean => {
    const weekday = (((day - BASE_DAY) % 7) + 7) % 7; // 0 = Monday
    return weekday >= 5;
  };
  // Holidays that fall on otherwise-working days, sorted, for counting.
  const holidays = [...new Set(calendar.holidays.map(toDayNumber))]
    .filter((d) => !(skipWeekends && isWeekend(d)))
    .sort((a, b) => a - b);
  const holidaySet = new Set(holidays);

  const holidaysBefore = (point: number): number => {
    let lo = 0;
    let hi = holidays.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((holidays[mid] ?? Infinity) < point) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const weekdaysBefore = (point: number): number => {
    const n = point - BASE_DAY;
    if (!skipWeekends) return n;
    const full = Math.floor(n / 7);
    const rest = n - full * 7;
    return full * 5 + Math.min(rest, 5);
  };

  const isWorkday = (day: number): boolean => !(skipWeekends && isWeekend(day)) && !holidaySet.has(day);
  const index = (point: number): number => weekdaysBefore(point) - holidaysBefore(point);

  const dayAt = (i: number): number => {
    // Smallest day d whose following point has more than i working days before it.
    let lo = BASE_DAY + i;
    let hi = BASE_DAY + Math.ceil(i * 1.5) + holidays.length + 14;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (index(mid + 1) > i) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  return {
    skipsDays: skipWeekends || holidays.length > 0,
    isWorkday,
    index,
    dayAt,
    count: (startDay, endDay) => Math.max(0, index(endDay + 1) - index(startDay)),
    nextWorkday: (day) => dayAt(index(day)),
  };
}

export const ALL_DAYS: GanttCalendar = { skipWeekends: false, holidays: [] };

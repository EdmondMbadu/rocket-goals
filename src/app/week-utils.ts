export type WeekRange = {
  weekId: string;
  weekStart: Date;
  weekEnd: Date;
};

export function toDateOnly(value: Date): Date {
  const next = new Date(value.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function getStartOfWeekMonday(value: Date): Date {
  const date = toDateOnly(value);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function getEndOfWeekSunday(value: Date): Date {
  const start = getStartOfWeekMonday(value);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function formatDateId(value: Date): string {
  const date = toDateOnly(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateId(value: string): Date | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const parts = value.split('-').map(part => Number(part));
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    return null;
  }
  const [year, month, day] = parts;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

export function getWeekRange(value: Date): WeekRange {
  const weekStart = getStartOfWeekMonday(value);
  const weekEnd = getEndOfWeekSunday(value);
  const weekId = formatDateId(weekStart);
  return { weekId, weekStart, weekEnd };
}

export function enumerateWeeks(startDate: Date, endDate: Date): WeekRange[] {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (end.getTime() < start.getTime()) {
    return [];
  }

  const ranges: WeekRange[] = [];
  let cursor = getStartOfWeekMonday(start);
  while (cursor.getTime() <= end.getTime()) {
    const range = getWeekRange(cursor);
    ranges.push(range);
    cursor = addDays(cursor, 7);
  }
  return ranges;
}

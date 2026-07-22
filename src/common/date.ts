export enum PeriodType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

export const today = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const DAY_IN_MILLISECONDS = 86_400_000;

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  const date = toUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateString(date);
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = toUtcDate(value);
  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
}

export interface GoalPeriodRange {
  index: number;
  start: string;
  end: string;
}

function addMonthsClamped(value: string, amount: number): string {
  const date = toUtcDate(value);
  const originalDay = date.getUTCDate();
  const targetMonthStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();

  targetMonthStart.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return toDateString(targetMonthStart);
}

export function goalPeriodForIndex(
  goalStart: string,
  type: PeriodType,
  interval: number,
  index: number,
): GoalPeriodRange {
  const safeInterval = Math.max(1, interval);
  const safeIndex = Math.max(1, index);

  if (type === PeriodType.MONTHLY) {
    const start = addMonthsClamped(goalStart, (safeIndex - 1) * safeInterval);
    const nextStart = addMonthsClamped(goalStart, safeIndex * safeInterval);

    return {
      index: safeIndex,
      start,
      end: addDays(nextStart, -1),
    };
  }

  const periodDays =
    type === PeriodType.WEEKLY ? safeInterval * 7 : safeInterval;
  const start = addDays(goalStart, (safeIndex - 1) * periodDays);

  return {
    index: safeIndex,
    start,
    end: addDays(start, periodDays - 1),
  };
}

export function goalPeriodEnd(
  start: string,
  type: PeriodType,
  interval = 1,
): string {
  return goalPeriodForIndex(start, type, interval, 1).end;
}

export function goalPeriodForDate(
  goalStart: string,
  type: PeriodType,
  interval: number,
  targetDate: string,
): GoalPeriodRange {
  const safeInterval = Math.max(1, interval);

  if (type === PeriodType.MONTHLY) {
    const base = toUtcDate(goalStart);
    const target = toUtcDate(targetDate);
    const monthDifference =
      (target.getUTCFullYear() - base.getUTCFullYear()) * 12 +
      target.getUTCMonth() -
      base.getUTCMonth();
    let index = Math.max(1, Math.floor(monthDifference / safeInterval) + 1);
    let range = goalPeriodForIndex(goalStart, type, safeInterval, index);

    if (targetDate < range.start && index > 1) {
      index -= 1;
      range = goalPeriodForIndex(goalStart, type, safeInterval, index);
    } else if (targetDate > range.end) {
      index += 1;
      range = goalPeriodForIndex(goalStart, type, safeInterval, index);
    }

    return range;
  }

  const periodDays =
    type === PeriodType.WEEKLY ? safeInterval * 7 : safeInterval;
  const elapsedDays = Math.floor(
    (toUtcDate(targetDate).getTime() - toUtcDate(goalStart).getTime()) /
      DAY_IN_MILLISECONDS,
  );
  const index = Math.max(1, Math.floor(elapsedDays / periodDays) + 1);

  return goalPeriodForIndex(goalStart, type, safeInterval, index);
}

export function addPeriod(
  start: string,
  type: PeriodType,
  interval: number,
): string {
  const date = new Date(`${start}T00:00:00Z`);

  if (type === PeriodType.DAILY)
    date.setUTCDate(date.getUTCDate() + interval - 1);

  if (type === PeriodType.WEEKLY)
    date.setUTCDate(date.getUTCDate() + interval * 7 - 1);

  if (type === PeriodType.MONTHLY) {
    const originalDay = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + interval);

    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();

    date.setUTCDate(Math.min(originalDay, lastDay) - 1);
  }

  return date.toISOString().slice(0, 10);
}

export function periodKey(type: PeriodType, value = today()): string {
  const date = new Date(`${value}T00:00:00Z`);

  if (type === PeriodType.WEEKLY) {
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
  }

  if (type === PeriodType.MONTHLY) date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

export enum PeriodType {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

export const today = (): string =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

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

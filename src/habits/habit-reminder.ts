import { BadRequestException } from "@nestjs/common";
import { localClock } from "../push/reminder-time";

// Habit logs and their daily targets use the Korean calendar day.
export const HABIT_REMINDER_TIMEZONE = "Asia/Seoul";

export function validateHabitReminder(
  time: string | null,
  days: number[],
): void {
  if (
    !Array.isArray(days) ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(days).size !== days.length ||
    days.length > 7
  ) {
    throw new BadRequestException("반복 요일을 다시 선택해주세요.");
  }
  if (
    time !== null &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || days.length === 0)
  ) {
    throw new BadRequestException("알림 시간과 반복 요일을 선택해주세요.");
  }
}

export function nextHabitReminderAt(
  now: Date,
  time: string | null,
  days: number[],
  lastReminderDate: string | null = null,
): Date | null {
  if (!time || days.length === 0) return null;
  const date = localClock(now, HABIT_REMINDER_TIMEZONE).date;
  const calendarDay = new Date(`${date}T00:00:00Z`);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = calendarDay.toISOString().slice(0, 10);
    const candidate = new Date(`${day}T${time}:00+09:00`);
    if (
      days.includes(calendarDay.getUTCDay()) &&
      day !== lastReminderDate &&
      candidate.getTime() > now.getTime()
    ) {
      return candidate;
    }
    calendarDay.setUTCDate(calendarDay.getUTCDate() + 1);
  }
  return null;
}

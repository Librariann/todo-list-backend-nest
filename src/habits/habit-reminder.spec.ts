import { describe, expect, it } from "@jest/globals";
import { nextHabitReminderAt, validateHabitReminder } from "./habit-reminder";

describe("habit reminder schedule (Asia/Seoul)", () => {
  const weekdays = [1, 2, 3, 4, 5];
  const everyDay = [0, 1, 2, 3, 4, 5, 6];

  it("skips the weekend after Friday's reminder", () => {
    const next = nextHabitReminderAt(
      new Date("2026-11-06T09:00:00+09:00"),
      "09:00",
      weekdays,
    );
    expect(next?.toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });

  it("schedules today's reminder if the time has not passed", () => {
    const next = nextHabitReminderAt(
      new Date("2026-11-05T08:59:00+09:00"),
      "09:00",
      weekdays,
    );
    expect(next?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
  });

  it("does not schedule another reminder on an already processed day", () => {
    const next = nextHabitReminderAt(
      new Date("2026-11-05T09:00:00+09:00"),
      "21:00",
      everyDay,
      "2026-11-05",
    );
    expect(next?.toISOString()).toBe("2026-11-06T12:00:00.000Z");
  });

  it("handles a weekly reminder across a year boundary", () => {
    const next = nextHabitReminderAt(
      new Date("2026-12-31T23:59:00+09:00"),
      "00:00",
      [5],
    );
    expect(next?.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("disables the schedule when reminders are off", () => {
    expect(nextHabitReminderAt(new Date(), null, [])).toBeNull();
  });

  it("requires valid time and at least one unique weekday", () => {
    expect(() => validateHabitReminder("24:00", weekdays)).toThrow();
    expect(() => validateHabitReminder("09:00", [])).toThrow();
    expect(() => validateHabitReminder("09:00", [1, 1])).toThrow();
    expect(() => validateHabitReminder("09:00", [7])).toThrow();
    expect(() => validateHabitReminder("09:00", [1.5])).toThrow();
    expect(() => validateHabitReminder("09:00", [0, 6])).not.toThrow();
    expect(() => validateHabitReminder(null, [])).not.toThrow();
  });
});

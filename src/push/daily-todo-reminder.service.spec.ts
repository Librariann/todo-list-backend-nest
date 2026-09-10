import { jest } from "@jest/globals";
import { NotificationPreference } from "../entities/notification-preference.entity";
import { DailyTodoReminderService } from "./daily-todo-reminder.service";
import { calculateNextReminderAt, localClock } from "./reminder-time";

describe("DailyTodoReminderService", () => {
  it("calculates the user's local date and time", () => {
    expect(localClock(new Date("2026-09-10T00:00:00.000Z"), "Asia/Seoul")).toEqual({
      date: "2026-09-10",
      time: "09:00",
    });
  });

  it("calculates the next reminder in UTC", () => {
    expect(
      calculateNextReminderAt(
        new Date("2026-09-10T00:01:00.000Z"),
        "09:00",
        "Asia/Seoul",
      ).toISOString(),
    ).toBe("2026-09-11T00:00:00.000Z");
  });

  it("sends one reminder for today's remaining todos", async () => {
    const preference = {
      userId: 7,
      pushEnabled: true,
      dailyReminderTime: "09:00",
      timezone: "Asia/Seoul",
      nextReminderAt: new Date("2026-09-10T00:00:00.000Z"),
    } as NotificationPreference;
    const preferences = {
      find: jest.fn(() => Promise.resolve([preference])),
      save: jest.fn((value: NotificationPreference) => Promise.resolve(value)),
    };
    const todos = { countBy: jest.fn(() => Promise.resolve(3)) };
    const push = {
      sendToUser: jest.fn(() =>
        Promise.resolve({ targetedDevices: 1, accepted: 1, failed: 0 }),
      ),
    };
    const service = new DailyTodoReminderService(
      preferences as never,
      todos as never,
      push as never,
    );

    await service.dispatchDueReminders(new Date("2026-09-10T00:00:00.000Z"));

    expect(push.sendToUser).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        type: "DAILY_TODO_REMINDER",
        data: { screen: "todos", date: "2026-09-10" },
      }),
    );
    expect(preference.nextReminderAt?.toISOString()).toBe(
      "2026-09-11T00:00:00.000Z",
    );
    expect(preferences.save).toHaveBeenCalledWith(preference);
  });

  it("does not query todos when no reminder is due", async () => {
    const preferences = {
      find: jest.fn(() => Promise.resolve([])),
      save: jest.fn(),
    };
    const todos = { countBy: jest.fn() };
    const push = { sendToUser: jest.fn() };
    const service = new DailyTodoReminderService(
      preferences as never,
      todos as never,
      push as never,
    );

    await service.dispatchDueReminders(new Date("2026-09-10T00:30:00.000Z"));

    expect(preferences.find).toHaveBeenCalled();
    expect(todos.countBy).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(preferences.save).not.toHaveBeenCalled();
  });
});

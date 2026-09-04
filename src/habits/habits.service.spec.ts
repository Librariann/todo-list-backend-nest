import { describe, expect, it, jest } from "@jest/globals";
import { WorkType } from "../entities/challenge.entity";
import { Habit, HabitLog, HabitStreak } from "../entities/habit.entity";
import { HabitsService } from "./habits.service";

function setup(dailyTarget = 1) {
  const habit = {
    id: 9,
    userId: 7,
    name: "물 마시기",
    description: null,
    dailyTarget,
    unit: "잔",
    isActive: true,
    createdAt: new Date("2026-09-15T00:00:00Z"),
  } as Habit;
  const log = {
    id: 21,
    habitId: 9,
    userId: 7,
    logDate: "2026-09-15",
    currentCount: 0,
    isAchieved: false,
  } as HabitLog;
  const streak = {
    id: 31,
    habitId: 9,
    userId: 7,
    currentStreak: 1,
    longestStreak: 1,
  } as HabitStreak;
  const habitRepository = {
    findOne: jest.fn(() => Promise.resolve(habit)),
  };
  const logRepository = {
    findOneBy: jest.fn(() => Promise.resolve(log)),
    create: jest.fn((value: Partial<HabitLog>) => value as HabitLog),
    save: jest.fn((value: HabitLog) => Promise.resolve(value)),
  };
  const streakRepository = {
    findOneBy: jest.fn(() => Promise.resolve(streak)),
    create: jest.fn((value: Partial<HabitStreak>) => value as HabitStreak),
    save: jest.fn((value: HabitStreak) => Promise.resolve(value)),
  };
  const challenges = {
    recalculateProgress: jest.fn(() => Promise.resolve([])),
  };
  const manager = {
    getRepository: jest.fn((target: unknown) => {
      if (target === Habit) return habitRepository;
      if (target === HabitLog) return logRepository;
      if (target === HabitStreak) return streakRepository;
      throw new Error("unexpected repository");
    }),
  };
  const dataSource = {
    transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const service = new HabitsService(
    {} as never,
    {} as never,
    {} as never,
    challenges as never,
    dataSource as never,
  );

  return {
    service,
    habitRepository,
    log,
    logRepository,
    streak,
    streakRepository,
    challenges,
    manager,
  };
}

describe("HabitsService.increment", () => {
  it("locks the habit and updates completion side effects in one transaction", async () => {
    const {
      service,
      habitRepository,
      log,
      streak,
      streakRepository,
      challenges,
      manager,
    } = setup();

    const result = await service.increment(7, 9);

    expect(habitRepository.findOne).toHaveBeenCalledWith({
      where: { id: 9, userId: 7 },
      lock: { mode: "pessimistic_write" },
    });
    expect(log.currentCount).toBe(1);
    expect(log.isAchieved).toBe(true);
    expect(streak.currentStreak).toBe(2);
    expect(streakRepository.save).toHaveBeenCalledTimes(1);
    expect(challenges.recalculateProgress).toHaveBeenCalledWith(
      7,
      WorkType.HABITS,
      manager,
    );
    expect(result.habit.todayAchieved).toBe(true);
  });

  it("does not update streak or challenges before reaching the daily target", async () => {
    const { service, log, streakRepository, challenges } = setup(2);

    const result = await service.increment(7, 9);

    expect(log.currentCount).toBe(1);
    expect(log.isAchieved).toBe(false);
    expect(streakRepository.save).not.toHaveBeenCalled();
    expect(challenges.recalculateProgress).not.toHaveBeenCalled();
    expect(result.habit.todayAchieved).toBe(false);
  });
});

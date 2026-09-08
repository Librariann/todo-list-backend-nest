import { describe, expect, it, jest } from "@jest/globals";
import { PeriodType } from "../common/date";
import { Goal, GoalProcess, GoalStreak } from "../entities/goal.entity";
import { GoalsService } from "./goals.service";

function goal(recurrenceType: PeriodType, targetCount = 1): Goal {
  return {
    id: 9,
    userId: 7,
    name: "꾸준히 이어가기",
    description: null,
    recurrenceType,
    interval: 1,
    startDate: "2026-09-01",
    targetCount,
    isActive: true,
  } as Goal;
}

function process(entity: Goal): GoalProcess {
  return {
    id: 21,
    goalId: entity.id,
    userId: entity.userId,
    periodIndex: 2,
    periodStart: "2026-09-01",
    periodEnd: "2099-12-31",
    currentCount: 0,
    isAchieved: false,
    achievedAt: null,
    isFinalized: false,
    goal: entity,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  } as GoalProcess;
}

function setup(entity: Goal, currentProcess: GoalProcess, currentStreak = 1) {
  const streak = {
    id: 31,
    goalId: entity.id,
    userId: entity.userId,
    currentStreak,
    longestStreak: currentStreak,
  } as GoalStreak;
  const goalRepository = {
    findOneBy: jest.fn(() => Promise.resolve(entity)),
  };
  const processRepository = {
    findOne: jest.fn(() => Promise.resolve(currentProcess)),
    find: jest.fn(() => Promise.resolve([] as GoalProcess[])),
    create: jest.fn((value: Partial<GoalProcess>) => value as GoalProcess),
    save: jest.fn((value: GoalProcess) => Promise.resolve(value)),
  };
  const streakRepository = {
    findOneBy: jest.fn(() => Promise.resolve(streak)),
    save: jest.fn((value: GoalStreak) => Promise.resolve(value)),
  };
  const challenges = {
    record: jest.fn(() => Promise.resolve([])),
  };
  const service = new GoalsService(
    goalRepository as never,
    processRepository as never,
    streakRepository as never,
    challenges as never,
  );

  return { service, streak, processRepository, streakRepository };
}

describe("GoalsService.achieve", () => {
  it.each([PeriodType.DAILY, PeriodType.WEEKLY, PeriodType.MONTHLY])(
    "increments the %s streak immediately when the period is achieved",
    async (recurrenceType) => {
      const entity = goal(recurrenceType);
      const currentProcess = process(entity);
      const { service, streak, streakRepository } = setup(
        entity,
        currentProcess,
      );

      const result = await service.achieve(7, 9);

      expect(result.achieved).toBe(true);
      expect(streak.currentStreak).toBe(2);
      expect(streak.longestStreak).toBe(2);
      expect(streakRepository.save).toHaveBeenCalledWith(streak);
    },
  );

  it("does not increment the streak before reaching the target count", async () => {
    const entity = goal(PeriodType.DAILY, 2);
    const currentProcess = process(entity);
    const { service, streak, streakRepository } = setup(entity, currentProcess);

    const result = await service.achieve(7, 9);

    expect(result.achieved).toBe(false);
    expect(streak.currentStreak).toBe(1);
    expect(streakRepository.save).not.toHaveBeenCalled();
  });
});

describe("GoalsService.resetExpired", () => {
  it("does not increment an already reflected achieved streak again", async () => {
    const entity = goal(PeriodType.DAILY);
    entity.isActive = false;
    const expiredProcess = process(entity);
    expiredProcess.periodEnd = "2026-09-01";
    expiredProcess.isAchieved = true;
    const { service, streak, processRepository, streakRepository } = setup(
      entity,
      expiredProcess,
      2,
    );
    processRepository.find.mockResolvedValue([expiredProcess]);

    await service.resetExpired();

    expect(expiredProcess.isFinalized).toBe(true);
    expect(streak.currentStreak).toBe(2);
    expect(streakRepository.save).not.toHaveBeenCalled();
  });

  it("resets the streak when an expired period was missed", async () => {
    const entity = goal(PeriodType.WEEKLY);
    entity.isActive = false;
    const expiredProcess = process(entity);
    expiredProcess.periodEnd = "2026-09-01";
    const { service, streak, processRepository, streakRepository } = setup(
      entity,
      expiredProcess,
      2,
    );
    processRepository.find.mockResolvedValue([expiredProcess]);

    await service.resetExpired();

    expect(streak.currentStreak).toBe(0);
    expect(streakRepository.save).toHaveBeenCalledWith(streak);
  });
});

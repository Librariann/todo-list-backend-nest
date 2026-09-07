import { BadRequestException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { today, PeriodType } from "../src/common/date";
import { Goal, GoalProcess, GoalStreak } from "../src/entities/goal.entity";
import { Habit, HabitLog, HabitStreak } from "../src/entities/habit.entity";
import { User, UserRole, UserStatus } from "../src/entities/user.entity";
import { GoalsService } from "../src/goals/goals.service";
import { HabitsService } from "../src/habits/habits.service";

describe("completion concurrency", () => {
  let dataSource: DataSource;
  let userId: number;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL is required");
    const databaseName = new URL(url).pathname.slice(1);
    if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
      throw new Error(
        "TEST_DATABASE_URL must point to a dedicated test database",
      );
    }

    const bootstrap = new DataSource({ type: "postgres", url });
    await bootstrap.initialize();
    await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "todo_list"');
    await bootstrap.destroy();

    dataSource = new DataSource({
      type: "postgres",
      url,
      schema: "todo_list",
      entities: [
        User,
        Habit,
        HabitLog,
        HabitStreak,
        Goal,
        GoalProcess,
        GoalStreak,
      ],
      dropSchema: true,
      synchronize: true,
    });
    await dataSource.initialize();

    const user = await dataSource.getRepository(User).save({
      nickname: "동시성테스트",
      email: "concurrency@growdo.test",
      password: "not-used",
      name: null,
      phoneNumber: null,
      provider: null,
      providerId: null,
      appleRefreshToken: null,
      appleClientId: null,
      status: UserStatus.ACTIVE,
      role: UserRole.USER,
    });
    userId = Number(user.id);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it("counts a simultaneous habit completion only once for streaks", async () => {
    const habits = dataSource.getRepository(Habit);
    const logs = dataSource.getRepository(HabitLog);
    const streaks = dataSource.getRepository(HabitStreak);
    const habit = await habits.save({
      userId,
      name: "물 마시기",
      description: null,
      dailyTarget: 1,
      unit: "잔",
      isActive: true,
    });
    await streaks.save({
      userId,
      habitId: Number(habit.id),
      currentStreak: 0,
      longestStreak: 0,
    });
    const challenges = { recalculateProgress: jest.fn().mockResolvedValue([]) };
    const service = new HabitsService(
      habits,
      logs,
      streaks,
      challenges as never,
      dataSource,
    );

    await Promise.all([
      service.increment(userId, Number(habit.id)),
      service.increment(userId, Number(habit.id)),
    ]);

    const savedLog = await logs.findOneByOrFail({
      userId,
      habitId: Number(habit.id),
      logDate: today(),
    });
    const savedStreak = await streaks.findOneByOrFail({
      userId,
      habitId: Number(habit.id),
    });
    expect(savedLog.currentCount).toBe(2);
    expect(savedLog.isAchieved).toBe(true);
    expect(savedStreak.currentStreak).toBe(1);
    expect(challenges.recalculateProgress).toHaveBeenCalledTimes(1);
  });

  it("accepts only one simultaneous request for an already completed goal", async () => {
    const goals = dataSource.getRepository(Goal);
    const processes = dataSource.getRepository(GoalProcess);
    const streaks = dataSource.getRepository(GoalStreak);
    const currentDate = today();
    const goal = await goals.save({
      userId,
      name: "한 번 완료하기",
      description: null,
      recurrenceType: PeriodType.DAILY,
      interval: 1,
      startDate: currentDate,
      targetCount: 1,
      isActive: true,
    });
    await processes.save({
      userId,
      goalId: Number(goal.id),
      periodIndex: 1,
      periodStart: currentDate,
      periodEnd: currentDate,
      currentCount: 0,
      isAchieved: false,
      achievedAt: null,
      isFinalized: false,
    });
    await streaks.save({
      userId,
      goalId: Number(goal.id),
      currentStreak: 0,
      longestStreak: 0,
    });
    const challenges = { recalculateProgress: jest.fn().mockResolvedValue([]) };
    const service = new GoalsService(
      goals,
      processes,
      streaks,
      challenges as never,
      dataSource,
    );

    const results = await Promise.allSettled([
      service.achieve(userId, Number(goal.id)),
      service.achieve(userId, Number(goal.id)),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.any(BadRequestException) });
    const savedProcess = await processes.findOneByOrFail({
      userId,
      goalId: Number(goal.id),
    });
    const savedStreak = await streaks.findOneByOrFail({
      userId,
      goalId: Number(goal.id),
    });
    expect(savedProcess.currentCount).toBe(1);
    expect(savedProcess.isAchieved).toBe(true);
    expect(savedStreak.currentStreak).toBe(1);
    expect(challenges.recalculateProgress).toHaveBeenCalledTimes(1);
  });
});

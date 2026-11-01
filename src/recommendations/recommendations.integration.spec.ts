import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { DataSource } from "typeorm";
import { addDays, PeriodType, today } from "../common/date";
import { Goal, GoalProcess, GoalStreak } from "../entities/goal.entity";
import { Habit, HabitLog, HabitStreak } from "../entities/habit.entity";
import {
  Recommendation,
  RecommendationState,
  RecommendationStatus,
} from "../entities/recommendation.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { User } from "../entities/user.entity";
import { GoalsService } from "../goals/goals.service";
import { HabitsService } from "../habits/habits.service";
import { TodosService } from "../todos/todos.service";
import { RecommendationContextService } from "./recommendation-context.service";
import { RecommendationsService } from "./recommendations.service";
import { RecommendationAiClient } from "./recommendation-ai-client";
import type { ValidRecommendation } from "./recommendation.types";

// Opt-in only: never load or connect to the app's DATABASE_URL.
const databaseUrl = process.env.RECOMMENDATIONS_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("recommendations PostgreSQL transactions", () => {
  let db: DataSource;
  let user: User;
  let other: User;
  let goals: GoalsService;
  let context: RecommendationContextService;
  let model: {
    available: boolean;
    timeoutMs: number;
    generate: jest.Mock<Promise<ValidRecommendation[]>, []>;
  };
  let service: RecommendationsService;

  function createService(
    inference = model as unknown as RecommendationAiClient,
  ): RecommendationsService {
    return new RecommendationsService(
      db.getRepository(Recommendation),
      db.getRepository(RecommendationState),
      db,
      new ConfigService({
        AI_RECOMMENDATIONS_COOLDOWN_SECONDS: "300",
        AI_RECOMMENDATIONS_DAILY_LIMIT: "3",
      }),
      context,
      inference,
      new TodosService(db.getRepository(Todo), {} as never, db),
      new HabitsService(
        db.getRepository(Habit),
        db.getRepository(HabitLog),
        db.getRepository(HabitStreak),
        {} as never,
        db,
      ),
      goals,
    );
  }

  async function seedRecommendation(
    type: ValidRecommendation["type"] = "todo",
    title = "추천으로 등록하기",
  ): Promise<Recommendation> {
    return db.getRepository(Recommendation).save({
      userId: user.id,
      generationId: randomUUID(),
      type,
      title,
      reason: "기록을 바탕으로 제안했어요.",
      sourceIds: ["todo:1"],
      payload:
        type === "todo"
          ? { targetDate: today() }
          : type === "habit"
            ? { dailyTarget: 2, unit: "회" }
            : {
                recurrenceType: PeriodType.WEEKLY,
                startDate: today(),
                interval: 1,
                targetCount: 3,
              },
      status: RecommendationStatus.PENDING,
      createdItemId: null,
    });
  }

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(parsed.hostname) ||
      !parsed.pathname.endsWith("_test")
    ) {
      throw new Error(
        "Integration tests require a disposable localhost database ending in _test",
      );
    }
    db = new DataSource({
      type: "postgres",
      url: databaseUrl,
      schema: "todo_list",
      synchronize: false,
      entities: [
        User,
        Todo,
        Habit,
        HabitLog,
        HabitStreak,
        Goal,
        GoalProcess,
        GoalStreak,
        Recommendation,
        RecommendationState,
      ],
    });
    await db.initialize();
    await db.query("CREATE SCHEMA IF NOT EXISTS todo_list");
    await db.synchronize();
    await db.query(
      "DROP TABLE todo_list.ai_recommendations, todo_list.ai_recommendation_states",
    );
    const migration = await readFile(
      resolve(
        __dirname,
        "../../migrations/20261030_add_ai_recommendations.sql",
      ),
      "utf8",
    );
    await db.query(migration);
    await db.query(migration);
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query("DROP SCHEMA IF EXISTS todo_list CASCADE");
      await db.destroy();
    }
  });

  beforeEach(async () => {
    const repo = db.getRepository(User);
    const suffix = randomUUID().slice(0, 8);
    user = await repo.save({
      nickname: `추천${suffix}`,
      email: `${suffix}@example.test`,
      password: "test-only",
    });
    other = await repo.save({
      nickname: `다른${suffix}`,
      email: `other${suffix}@example.test`,
      password: "test-only",
    });
    goals = new GoalsService(
      db.getRepository(Goal),
      db.getRepository(GoalProcess),
      db.getRepository(GoalStreak),
      {} as never,
      db,
    );
    context = new RecommendationContextService(
      db.getRepository(Todo),
      db.getRepository(Habit),
      db.getRepository(HabitLog),
      db.getRepository(Goal),
      db.getRepository(GoalProcess),
      db.getRepository(Recommendation),
    );
    model = {
      available: true,
      timeoutMs: 1000,
      generate: jest.fn<Promise<ValidRecommendation[]>, []>(),
    };
    service = createService();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (db?.isInitialized)
      await db.query("TRUNCATE TABLE todo_list.users RESTART IDENTITY CASCADE");
  });

  it("isolates recommendations from another user", async () => {
    const item = await seedRecommendation();
    await expect(
      service.accept(Number(other.id), Number(item.id)),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.dismiss(Number(other.id), Number(item.id)),
    ).rejects.toThrow(NotFoundException);
    expect((await service.list(Number(other.id))).items).toEqual([]);
    expect(await db.getRepository(Todo).countBy({ userId: user.id })).toBe(0);
  });

  it("concurrent accepts from separate service instances create exactly one todo", async () => {
    const item = await seedRecommendation();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        (index % 2 ? service : createService()).accept(
          Number(user.id),
          Number(item.id),
        ),
      ),
    );
    expect(new Set(results.map((result) => result.createdItemId)).size).toBe(1);
    expect(await db.getRepository(Todo).countBy({ userId: user.id })).toBe(1);
    expect(
      results.every(
        (result) => result.status === RecommendationStatus.ACCEPTED,
      ),
    ).toBe(true);
  });

  it("creates habit and goal setup rows in the same transaction", async () => {
    const habit = await seedRecommendation("habit", "짧게 독서하기");
    const goal = await seedRecommendation("goal", "일주일에 세 번 독서하기");
    await service.accept(Number(user.id), Number(habit.id));
    await service.accept(Number(user.id), Number(goal.id));
    expect(
      await db.getRepository(HabitStreak).countBy({ userId: user.id }),
    ).toBe(1);
    const createdGoal = await db
      .getRepository(Goal)
      .findOneByOrFail({ userId: user.id });
    expect(createdGoal.targetCount).toBe(3);
    expect(
      await db.getRepository(GoalProcess).countBy({ goalId: createdGoal.id }),
    ).toBe(1);
    expect(
      await db.getRepository(GoalStreak).countBy({ goalId: createdGoal.id }),
    ).toBe(1);
  });

  it("rolls back task and supporting records if registration fails", async () => {
    const item = await seedRecommendation("goal");
    const create = goals.create.bind(goals);
    jest.spyOn(goals, "create").mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error("simulate failure after goal, period and streak writes");
    });
    await expect(
      service.accept(Number(user.id), Number(item.id)),
    ).rejects.toThrow("simulate failure");
    expect(await db.getRepository(Goal).countBy({ userId: user.id })).toBe(0);
    expect(
      await db.getRepository(GoalProcess).countBy({ userId: user.id }),
    ).toBe(0);
    expect(
      await db.getRepository(GoalStreak).countBy({ userId: user.id }),
    ).toBe(0);
    expect(
      (await db.getRepository(Recommendation).findOneByOrFail({ id: item.id }))
        .status,
    ).toBe(RecommendationStatus.PENDING);
  });

  it("rejects expired dates and dismissed recommendations", async () => {
    const expired = await seedRecommendation();
    await db
      .getRepository(Recommendation)
      .update(expired.id, { payload: { targetDate: addDays(today(), -1) } });
    await expect(
      service.accept(Number(user.id), Number(expired.id)),
    ).rejects.toThrow(ConflictException);
    const dismissed = await seedRecommendation("habit");
    await service.dismiss(Number(user.id), Number(dismissed.id));
    await expect(
      service.accept(Number(user.id), Number(dismissed.id)),
    ).rejects.toThrow(ConflictException);
  });

  it("does not call the model without user records", async () => {
    expect((await service.generate(Number(user.id))).items).toEqual([]);
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("builds only this user's records and excludes today's unfinished periods from failure statistics", async () => {
    await seedHistory();
    await db.getRepository(Todo).save({
      userId: other.id,
      name: "다른 사용자의 비공개 기록",
      targetDate: today(),
      status: TodoStatus.DONE,
      orderIndex: 1,
    });
    const goal = await db.getRepository(Goal).save({
      userId: user.id,
      name: "독서 이어가기",
      startDate: addDays(today(), -7),
      recurrenceType: PeriodType.DAILY,
      interval: 1,
      targetCount: 1,
      isActive: true,
    });
    await db.getRepository(GoalProcess).save([
      {
        userId: user.id,
        goalId: goal.id,
        periodIndex: 1,
        periodStart: addDays(today(), -1),
        periodEnd: addDays(today(), -1),
        currentCount: 1,
        isAchieved: true,
        isFinalized: true,
      },
      {
        userId: user.id,
        goalId: goal.id,
        periodIndex: 2,
        periodStart: today(),
        periodEnd: today(),
        currentCount: 0,
        isAchieved: false,
        isFinalized: false,
      },
    ]);
    const data = await context.build(Number(user.id));
    expect(JSON.stringify(data)).not.toContain("비공개");
    expect(
      data.sources.find((source) => source.type === "goal")?.facts,
    ).toMatchObject({ completedPeriods: 1, achievedPeriods: 1 });
    expect(JSON.stringify(data).length).toBeLessThanOrEqual(8000);
  });

  it("stores generated recommendations and selection state across requests", async () => {
    const history = await seedHistory();
    model.generate.mockResolvedValueOnce([
      {
        type: "habit",
        title: "짧게 독서하기",
        reason: "기록 기반 추천",
        sourceIds: [`todo:${history.id}`],
        payload: { dailyTarget: 1, unit: "회" },
      },
    ]);
    const generated = await service.generate(Number(user.id));
    expect(generated.items).toHaveLength(1);
    await service.accept(Number(user.id), generated.items[0].id);
    const loaded = await createService().list(Number(user.id));
    expect(loaded.items[0].status).toBe(RecommendationStatus.ACCEPTED);
    expect(loaded.items[0].createdItemId).toBeGreaterThan(0);
    expect((await service.list(Number(other.id))).items).toEqual([]);
  });

  async function seedHistory(): Promise<Todo> {
    return db.getRepository(Todo).save({
      userId: user.id,
      name: "독서하기",
      targetDate: addDays(today(), -1),
      status: TodoStatus.DONE,
      orderIndex: 1,
    });
  }

  const liveTest = process.env.RECOMMENDATIONS_LIVE_TEST === "1" ? it : it.skip;
  liveTest(
    "generates and registers a recommendation with the Qwen model",
    async () => {
      const config = new ConfigService();
      const ai = new RecommendationAiClient(config);
      if (!ai.available)
        throw new Error("Configure the Qwen URL and API key first.");
      await seedHistory();
      await db.getRepository(Todo).save([
        {
          userId: user.id,
          name: "산책하기",
          targetDate: addDays(today(), -2),
          status: TodoStatus.DONE,
          orderIndex: 1,
        },
        {
          userId: user.id,
          name: "영어 단어 복습하기",
          targetDate: addDays(today(), -3),
          status: TodoStatus.DONE,
          orderIndex: 1,
        },
      ]);

      const live = createService(ai);
      const generated = await live.generate(Number(user.id));
      expect(generated.items.length).toBeGreaterThan(0);
      expect(generated.items.length).toBeLessThanOrEqual(3);
      expect(
        generated.items.every(({ reason }) =>
          /독서하기|산책하기|영어 단어 복습하기/.test(reason),
        ),
      ).toBe(true);
      const accepted = await live.accept(
        Number(user.id),
        generated.items[0].id,
      );
      expect(accepted.status).toBe(RecommendationStatus.ACCEPTED);
      expect(accepted.createdItemId).toBeGreaterThan(0);
      const repository =
        accepted.type === "todo"
          ? db.getRepository(Todo)
          : accepted.type === "habit"
            ? db.getRepository(Habit)
            : db.getRepository(Goal);
      expect(
        await repository.findOneBy({
          id: accepted.createdItemId!,
          userId: user.id,
        }),
      ).toMatchObject({ name: accepted.title });
      expect(
        (await live.accept(Number(user.id), accepted.id)).createdItemId,
      ).toBe(accepted.createdItemId);
    },
    200_000,
  );

  it("persists a lease across service instances and keeps the cooldown after success", async () => {
    await seedHistory();
    let release!: (items: ValidRecommendation[]) => void;
    let started!: () => void;
    const inProgress = new Promise<void>((resolve) => {
      started = resolve;
    });
    model.generate.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const first = service.generate(Number(user.id));
    await inProgress;
    await expect(createService().generate(Number(user.id))).rejects.toThrow(
      HttpException,
    );
    expect(model.generate).toHaveBeenCalledTimes(1);
    release([]);
    await first;
    expect(
      (await createService().list(Number(user.id))).retryAfterSeconds,
    ).toBeGreaterThan(0);
    await expect(createService().generate(Number(user.id))).rejects.toThrow(
      HttpException,
    );
    const state = await db
      .getRepository(RecommendationState)
      .findOneByOrFail({ userId: user.id });
    expect(state.attempts).toBe(1);
    expect(state.leaseToken).toBeNull();
  });

  it("releases a failed inference lease while retaining the inference budget", async () => {
    await seedHistory();
    model.generate.mockRejectedValueOnce(new Error("model failure"));
    await expect(service.generate(Number(user.id))).rejects.toThrow(
      "model failure",
    );
    const state = await db
      .getRepository(RecommendationState)
      .findOneByOrFail({ userId: user.id });
    expect(state.leaseToken).toBeNull();
    expect(state.attempts).toBe(1);
    expect(
      (await service.list(Number(user.id))).retryAfterSeconds,
    ).toBeGreaterThan(0);
  });

  it("enforces the daily budget even after the cooldown expires", async () => {
    await seedHistory();
    await db.getRepository(RecommendationState).save({
      userId: user.id,
      generationDate: today(),
      attempts: 3,
      lastAttemptAt: new Date(Date.now() - 600_000),
    });
    await expect(service.generate(Number(user.id))).rejects.toThrow(
      "오늘 받을 수 있는 추천",
    );
    expect(model.generate).not.toHaveBeenCalled();
  });

  it("filters duplicates against all upcoming todos, not just the prompt subset", async () => {
    await seedHistory();
    await db.getRepository(Todo).save({
      userId: user.id,
      name: "짧게 독서하기",
      targetDate: addDays(today(), 2),
      status: TodoStatus.READY,
      orderIndex: 1,
    });
    model.generate.mockResolvedValueOnce([
      {
        type: "todo",
        title: "짧게 독서하기",
        reason: "기록 기반 추천",
        sourceIds: ["todo:1"],
        payload: { targetDate: today() },
      },
    ]);
    const result = await service.generate(Number(user.id));
    expect(result.items).toEqual([]);
  });
});

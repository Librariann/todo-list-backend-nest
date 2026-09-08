import { BadRequestException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Repository } from "typeorm";
import { PeriodType } from "../common/date";
import {
  Challenge,
  ChallengeAssignment,
  ChallengeRotationRun,
  ChallengeRotationSetting,
  UserProgressChallenge,
  WorkType,
} from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import type { PointsService } from "../points/points.service";
import { ChallengesService } from "./challenges.service";

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 1,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    name: "할 일 도전",
    description: "할 일을 완료해요",
    icon: null,
    workType: WorkType.TODOS,
    recurrenceType: PeriodType.DAILY,
    targetCount: 1,
    dailyMaxCount: 1,
    point: 30,
    isActive: true,
    ...overrides,
  };
}

function progress(): UserProgressChallenge {
  return {
    id: 1,
    userId: 7,
    challengeId: 1,
    periodType: PeriodType.DAILY,
    periodKey: "2026-08-24",
    currentCount: 1,
    isAchieved: true,
  } as UserProgressChallenge;
}

function assignmentFromChallenge(
  challengeEntity: Challenge,
  overrides: Partial<ChallengeAssignment> = {},
): ChallengeAssignment {
  return {
    id: 101,
    createdAt: new Date("2026-08-24T00:00:00Z"),
    updatedAt: new Date("2026-08-24T00:00:00Z"),
    challengeId: challengeEntity.id,
    challenge: challengeEntity,
    periodType: challengeEntity.recurrenceType,
    periodKey: "2026-08-24",
    position: 1,
    name: challengeEntity.name,
    description: challengeEntity.description,
    icon: challengeEntity.icon,
    workType: challengeEntity.workType,
    targetCount: challengeEntity.targetCount,
    dailyMaxCount: challengeEntity.dailyMaxCount,
    point: challengeEntity.point,
    ...overrides,
  };
}

function attachTransactionManager(
  assignmentRepository: Repository<ChallengeAssignment>,
  challengeRepository: Repository<Challenge>,
  rotationSettingRepository: Repository<ChallengeRotationSetting>,
  rotationRunRepository: Repository<ChallengeRotationRun>,
  progressRepository?: Repository<UserProgressChallenge>,
): void {
  (assignmentRepository as unknown as { manager: unknown }).manager = {
    query: jest.fn(() => Promise.resolve()),
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback({
        query: jest.fn(() => Promise.resolve()),
        getRepository: (entity: unknown) => {
          if (entity === ChallengeAssignment) return assignmentRepository;
          if (entity === ChallengeRotationSetting)
            return rotationSettingRepository;
          if (entity === ChallengeRotationRun) return rotationRunRepository;
          if (entity === UserProgressChallenge && progressRepository)
            return progressRepository;
          return challengeRepository;
        },
      }),
    ),
  };
}

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 10,
    userId: 7,
    status: TodoStatus.DONE,
    targetDate: "2026-08-24",
    ...overrides,
  } as Todo;
}

describe("ChallengesService.syncTodoProgress", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-08-24T12:00:00+09:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const setup = (
    completedTodos: Todo[],
    challengeEntity = challenge(),
    progressEntity: UserProgressChallenge | null = progress(),
  ) => {
    const challengeRepository = {
      findBy: jest.fn((where: Partial<Challenge>) =>
        Promise.resolve(
          where.recurrenceType === challengeEntity.recurrenceType
            ? [challengeEntity]
            : [],
        ),
      ),
    } as unknown as Repository<Challenge>;
    const assignmentRepository = {
      find: jest.fn(({ where }: { where: Partial<ChallengeAssignment> }) =>
        Promise.resolve(
          where.periodType === challengeEntity.recurrenceType
            ? [assignmentFromChallenge(challengeEntity)]
            : [],
        ),
      ),
      findBy: jest.fn(() => Promise.resolve([])),
    } as unknown as Repository<ChallengeAssignment>;
    const rotationSettingRepository = {
      findOneBy: jest.fn(({ periodType }: Partial<ChallengeRotationSetting>) =>
        Promise.resolve({
          periodType,
          selectionCount: 5,
          cooldownPeriods: 2,
        } as ChallengeRotationSetting),
      ),
    } as unknown as Repository<ChallengeRotationSetting>;
    const createdProgress = progressEntity ?? progress();
    const createProgress = jest.fn((value: Partial<UserProgressChallenge>) =>
      Object.assign(createdProgress, value),
    );
    const saveProgress = jest
      .fn()
      .mockImplementation((value) => Promise.resolve(value));
    const progressRepository = {
      findOne: jest.fn(() => Promise.resolve(progressEntity)),
      create: createProgress,
      save: saveProgress,
    } as unknown as Repository<UserProgressChallenge>;
    const rotationRunRepository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    } as unknown as Repository<ChallengeRotationRun>;
    attachTransactionManager(
      assignmentRepository,
      challengeRepository,
      rotationSettingRepository,
      rotationRunRepository,
      progressRepository,
    );
    const todoRepository = {
      find: jest.fn(() => Promise.resolve(completedTodos)),
    } as unknown as Repository<Todo>;
    const awardChallenge = jest.fn();
    const revokeChallenge = jest.fn();
    const points = {
      awardChallenge,
      revokeChallenge,
    } as unknown as PointsService;

    return {
      service: new ChallengesService(
        challengeRepository,
        assignmentRepository,
        rotationSettingRepository,
        rotationRunRepository,
        progressRepository,
        todoRepository,
        points,
      ),
      points,
      awardChallenge,
      revokeChallenge,
      progressEntity: createdProgress,
      createProgress,
      saveProgress,
    };
  };

  it("keeps the achievement when another completed todo still satisfies it", async () => {
    const { service, revokeChallenge, progressEntity } = setup([todo()]);

    await service.syncTodoProgress(7);

    expect(progressEntity.currentCount).toBe(1);
    expect(progressEntity.isAchieved).toBe(true);
    expect(revokeChallenge).not.toHaveBeenCalled();
  });

  it("reverts achievement and points when completed todos drop below target", async () => {
    const { service, revokeChallenge, progressEntity } = setup([]);

    await service.syncTodoProgress(7);

    expect(progressEntity.currentCount).toBe(0);
    expect(progressEntity.isAchieved).toBe(false);
    expect(revokeChallenge).toHaveBeenCalledTimes(1);
  });

  it("applies the daily maximum while aggregating a weekly challenge", async () => {
    const weekly = challenge({
      recurrenceType: PeriodType.WEEKLY,
      targetCount: 5,
      dailyMaxCount: 2,
    });
    const completed = [
      todo(),
      todo({ id: 11 }),
      todo({ id: 12 }),
      todo({ id: 13, targetDate: "2026-08-25" }),
    ];
    const { service, progressEntity, saveProgress } = setup(
      completed,
      weekly,
      null,
    );

    await service.syncTodoProgress(7);

    expect(progressEntity.periodKey).toBe("2026-08-24");
    expect(progressEntity.currentCount).toBe(3);
    expect(progressEntity.isAchieved).toBe(false);
    expect(saveProgress).toHaveBeenCalledTimes(1);
  });

  it("awards points once when progress reaches the target", async () => {
    const pending = progress();
    pending.currentCount = 0;
    pending.isAchieved = false;
    const { service, awardChallenge, progressEntity } = setup(
      [todo()],
      challenge(),
      pending,
    );

    const achievements = await service.syncTodoProgress(7);

    expect(progressEntity.isAchieved).toBe(true);
    expect(awardChallenge).toHaveBeenCalledWith(
      7,
      30,
      1,
      PeriodType.DAILY,
      undefined,
      "2026-08-24",
    );
    expect(achievements).toEqual([
      {
        challengeId: 1,
        name: "할 일 도전",
        description: "할 일을 완료해요",
        point: 30,
        periodType: PeriodType.DAILY,
        periodKey: "2026-08-24",
      },
    ]);
  });

  it("does not create an empty progress row", async () => {
    const { service, createProgress, saveProgress } = setup(
      [],
      challenge(),
      null,
    );

    await service.syncTodoProgress(7);

    expect(createProgress).not.toHaveBeenCalled();
    expect(saveProgress).not.toHaveBeenCalled();
  });
});

describe("ChallengesService challenge rotation", () => {
  const setupRotation = (
    candidates: Challenge[],
    recent: ChallengeAssignment[],
    selectionCount: number,
    cooldownPeriods: number,
    progressCount = 0,
  ) => {
    let current: ChallengeAssignment[] = [];
    const challengeRepository = {
      findBy: jest.fn((where: Partial<Challenge>) =>
        Promise.resolve(
          where.recurrenceType === PeriodType.DAILY ? candidates : [],
        ),
      ),
    } as unknown as Repository<Challenge>;
    const assignmentRepository = {
      find: jest.fn(() => Promise.resolve(current)),
      findBy: jest.fn(() => Promise.resolve(recent)),
      delete: jest.fn(() => {
        current = [];
        return Promise.resolve({ raw: [], affected: 0 });
      }),
      createQueryBuilder: jest.fn(() => {
        let values: Partial<ChallengeAssignment>[] = [];
        const builder = {
          insert: jest.fn(() => builder),
          values: jest.fn((items: Partial<ChallengeAssignment>[]) => {
            values = items;
            return builder;
          }),
          orIgnore: jest.fn(() => builder),
          execute: jest.fn(() => {
            current = values.map(
              (item) =>
                ({
                  ...item,
                  challenge: candidates.find(
                    ({ id }) => Number(id) === Number(item.challengeId),
                  ),
                }) as ChallengeAssignment,
            );
            return Promise.resolve({
              identifiers: [],
              generatedMaps: [],
              raw: [],
            });
          }),
        };
        return builder;
      }),
    } as unknown as Repository<ChallengeAssignment>;
    const rotationSettingRepository = {
      findOneBy: jest.fn(() =>
        Promise.resolve({
          periodType: PeriodType.DAILY,
          selectionCount,
          cooldownPeriods,
        } as ChallengeRotationSetting),
      ),
    } as unknown as Repository<ChallengeRotationSetting>;
    const rotationRunRepository = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    } as unknown as Repository<ChallengeRotationRun>;
    const progressRepository = {
      count: jest.fn(() => Promise.resolve(progressCount)),
    } as unknown as Repository<UserProgressChallenge>;
    attachTransactionManager(
      assignmentRepository,
      challengeRepository,
      rotationSettingRepository,
      rotationRunRepository,
      progressRepository,
    );
    const service = new ChallengesService(
      challengeRepository,
      assignmentRepository,
      rotationSettingRepository,
      rotationRunRepository,
      progressRepository,
      {} as Repository<Todo>,
      {} as PointsService,
    ) as unknown as {
      ensureAssignments(
        type: PeriodType,
        value: string,
      ): Promise<ChallengeAssignment[]>;
      rerollRotation(
        type: PeriodType,
        actorUserId: number,
        value: string,
        selectedChallengeIds: number[],
      ): Promise<ChallengeAssignment[]>;
    };

    return service;
  };

  it("selects the configured number without reusing the previous period", async () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      challenge({ id: index + 1, name: `일일 도전 ${index + 1}` }),
    );
    const previous = candidates.slice(0, 5).map(
      (item, index) =>
        ({
          challengeId: item.id,
          periodType: PeriodType.DAILY,
          periodKey: "2026-08-26",
          position: index + 1,
        }) as ChallengeAssignment,
    );
    const service = setupRotation(candidates, previous, 7, 1);

    const result = await service.ensureAssignments(
      PeriodType.DAILY,
      "2026-08-27",
    );

    expect(result).toHaveLength(7);
    expect(
      result
        .map(({ challengeId }) => Number(challengeId))
        .sort((left, right) => left - right),
    ).toEqual([6, 7, 8, 9, 10, 11, 12]);

    candidates[5].targetCount = 99;
    candidates[5].point = 999;
    const unchanged = await service.ensureAssignments(
      PeriodType.DAILY,
      "2026-08-27",
    );
    const snapshot = unchanged.find(
      ({ challengeId }) => Number(challengeId) === 6,
    );
    expect(snapshot?.targetCount).toBe(1);
    expect(snapshot?.point).toBe(30);
  });

  it("relaxes cooldown and returns every unique candidate when the pool is short", async () => {
    const candidates = Array.from({ length: 3 }, (_, index) =>
      challenge({ id: index + 1, name: `부족한 도전 ${index + 1}` }),
    );
    const recent = candidates.map(
      (item, index) =>
        ({
          challengeId: item.id,
          periodType: PeriodType.DAILY,
          periodKey: "2026-08-26",
          position: index + 1,
        }) as ChallengeAssignment,
    );
    const service = setupRotation(candidates, recent, 5, 3);

    const result = await service.ensureAssignments(
      PeriodType.DAILY,
      "2026-08-27",
    );

    expect(result).toHaveLength(3);
    expect(
      result
        .map(({ challengeId }) => Number(challengeId))
        .sort((left, right) => left - right),
    ).toEqual([1, 2, 3]);
  });

  it("always selects at least one candidate from every available work type", async () => {
    const candidates = [
      ...Array.from({ length: 4 }, (_, index) =>
        challenge({
          id: index + 1,
          name: `습관 도전 ${index + 1}`,
          workType: WorkType.HABITS,
        }),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        challenge({
          id: index + 5,
          name: `할 일 도전 ${index + 1}`,
          workType: WorkType.TODOS,
        }),
      ),
      challenge({ id: 8, name: "유일한 목표 도전", workType: WorkType.GOALS }),
    ];
    const recentGoal = [
      {
        challengeId: 8,
        periodType: PeriodType.DAILY,
        periodKey: "2026-08-26",
        position: 1,
      } as ChallengeAssignment,
    ];
    const service = setupRotation(candidates, recentGoal, 5, 3);

    const result = await service.ensureAssignments(
      PeriodType.DAILY,
      "2026-08-27",
    );

    expect(result).toHaveLength(5);
    expect(result.map(({ workType }) => workType)).toEqual(
      expect.arrayContaining([WorkType.HABITS, WorkType.TODOS, WorkType.GOALS]),
    );
    expect(result.some(({ challengeId }) => Number(challengeId) === 8)).toBe(
      true,
    );
  });

  it("honors a one-item limit and prioritizes a work type that has not appeared", async () => {
    const candidates = [
      challenge({ id: 1, workType: WorkType.HABITS }),
      challenge({ id: 2, workType: WorkType.TODOS }),
      challenge({ id: 3, workType: WorkType.GOALS }),
    ];
    const history = [
      assignmentFromChallenge(candidates[0], {
        periodKey: "2026-08-26",
      }),
      assignmentFromChallenge(candidates[1], {
        id: 102,
        periodKey: "2026-08-25",
      }),
    ];
    const service = setupRotation(candidates, history, 1, 3);

    const result = await service.ensureAssignments(
      PeriodType.DAILY,
      "2026-08-27",
    );

    expect(result).toHaveLength(1);
    expect(result[0].workType).toBe(WorkType.GOALS);
  });

  it("blocks a manual reroll after user progress has been recorded", async () => {
    const candidates = [challenge({ id: 1 }), challenge({ id: 2 })];
    const service = setupRotation(candidates, [], 1, 1, 1);
    await service.ensureAssignments(PeriodType.DAILY, "2026-08-27");

    await expect(
      service.rerollRotation(PeriodType.DAILY, 99, "2026-08-27", [2]),
    ).rejects.toThrow(BadRequestException);
  });
});

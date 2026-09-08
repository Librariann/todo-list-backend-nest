import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, EntityManager, In, Repository } from "typeorm";
import {
  addDays,
  goalPeriodEnd,
  periodKey,
  PeriodType,
  today,
} from "../common/date";
import {
  Challenge,
  ChallengeAssignment,
  ChallengeRotationRun,
  ChallengeRotationStatus,
  ChallengeRotationSetting,
  ChallengeRotationTrigger,
  UserProgressChallenge,
  WorkType,
} from "../entities/challenge.entity";
import { Todo, TodoStatus } from "../entities/todo.entity";
import { PointsService } from "../points/points.service";
import type { CreateChallengeDto } from "./dto/create-challenges.dto";
import type { UpdateChallengeDto } from "./dto/update-challenges.dto";

const DEFAULT_ROTATION_SETTINGS: Record<
  PeriodType,
  { selectionCount: number; cooldownPeriods: number }
> = {
  [PeriodType.DAILY]: { selectionCount: 5, cooldownPeriods: 3 },
  [PeriodType.WEEKLY]: { selectionCount: 5, cooldownPeriods: 2 },
  [PeriodType.MONTHLY]: { selectionCount: 5, cooldownPeriods: 2 },
};

export interface ChallengeOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string | null;
  icon: string | null;
  recurrenceType: PeriodType;
  workType: WorkType;
  targetCount: number;
  dailyMaxCount: number;
  point: number;
  isActive: boolean;
  isSelected: boolean;
}

export interface ChallengeProgressOutput extends ChallengeOutput {
  currentCount: number;
  isAchieved: boolean;
  periodType: PeriodType;
  periodKey: string;
}

export interface ChallengeAchievementOutput {
  challengeId: number;
  name: string;
  description: string | null;
  point: number;
  periodType: PeriodType;
  periodKey: string;
}

export interface ChallengeRotationSettingOutput {
  periodType: PeriodType;
  selectionCount: number;
  cooldownPeriods: number;
}

export interface ChallengeRotationRunOutput {
  id: number;
  createdAt: Date;
  periodType: PeriodType;
  periodKey: string;
  trigger: ChallengeRotationTrigger;
  status: ChallengeRotationStatus;
  requestedCount: number;
  selectedCount: number;
  selectedChallenges: Array<{
    id: number;
    name: string;
    workType: WorkType;
  }>;
  actorUserId: number | null;
  message: string | null;
}

export interface ChallengeRotationPreviewOutput {
  periodType: PeriodType;
  periodKey: string;
  requestedCount: number;
  candidates: ChallengeOutput[];
}

export function challengeResponse(
  challenge: Challenge,
  isSelected = false,
): ChallengeOutput {
  return {
    id: challenge.id,
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt,
    name: challenge.name,
    description: challenge.description,
    icon: challenge.icon,
    recurrenceType: challenge.recurrenceType,
    workType: challenge.workType,
    targetCount: challenge.targetCount,
    dailyMaxCount: challenge.dailyMaxCount,
    point: challenge.point,
    isActive: challenge.isActive,
    isSelected,
  };
}

export function assignmentResponse(
  assignment: ChallengeAssignment,
  isSelected = true,
): ChallengeOutput {
  return {
    id: Number(assignment.challengeId),
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    name: assignment.name,
    description: assignment.description,
    icon: assignment.icon,
    recurrenceType: assignment.periodType,
    workType: assignment.workType,
    targetCount: assignment.targetCount,
    dailyMaxCount: assignment.dailyMaxCount,
    point: assignment.point,
    isActive: assignment.challenge?.isActive ?? true,
    isSelected,
  };
}

export function progressResponse(
  progress: UserProgressChallenge,
): ChallengeProgressOutput {
  if (progress.assignment) {
    return {
      ...assignmentResponse(progress.assignment, false),
      id: progress.id,
      currentCount: progress.currentCount,
      isAchieved: progress.isAchieved,
      periodType: progress.periodType,
      periodKey: progress.periodKey,
    };
  }

  return {
    id: progress.id,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
    name: progress.challenge.name,
    description: progress.challenge.description,
    icon: progress.challenge.icon,
    recurrenceType: progress.challenge.recurrenceType,
    workType: progress.challenge.workType,
    targetCount: progress.challenge.targetCount,
    dailyMaxCount: progress.challenge.dailyMaxCount,
    point: progress.challenge.point,
    isActive: progress.challenge.isActive,
    isSelected: false,
    currentCount: progress.currentCount,
    isAchieved: progress.isAchieved,
    periodType: progress.periodType,
    periodKey: progress.periodKey,
  };
}

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,

    @InjectRepository(ChallengeAssignment)
    private readonly assignments: Repository<ChallengeAssignment>,

    @InjectRepository(ChallengeRotationSetting)
    private readonly rotationSettingRepository: Repository<ChallengeRotationSetting>,

    @InjectRepository(ChallengeRotationRun)
    private readonly rotationRuns: Repository<ChallengeRotationRun>,

    @InjectRepository(UserProgressChallenge)
    private readonly progresses: Repository<UserProgressChallenge>,

    @InjectRepository(Todo)
    private readonly todos: Repository<Todo>,

    private readonly points: PointsService,
  ) {}

  @Cron("5 0 0 * * *", { timeZone: "Asia/Seoul" })
  async rotateChallenges(): Promise<void> {
    await Promise.all(
      Object.values(PeriodType).map((type) =>
        this.ensureAssignments(type, today(), ChallengeRotationTrigger.CRON),
      ),
    );
  }

  private async rotationSetting(
    type: PeriodType,
    manager?: EntityManager,
  ): Promise<ChallengeRotationSettingOutput> {
    const repository =
      manager?.getRepository(ChallengeRotationSetting) ??
      this.rotationSettingRepository;
    const setting = await repository.findOneBy({
      periodType: type,
    });
    if (setting) {
      return {
        periodType: type,
        selectionCount: setting.selectionCount,
        cooldownPeriods: setting.cooldownPeriods,
      };
    }

    const defaults = DEFAULT_ROTATION_SETTINGS[type];

    await repository
      .createQueryBuilder()
      .insert()
      .values({
        periodType: type,
        ...defaults,
      })
      .orIgnore()
      .execute();

    const created = await repository.findOneBy({
      periodType: type,
    });
    return {
      periodType: type,
      selectionCount: created?.selectionCount ?? defaults.selectionCount,
      cooldownPeriods: created?.cooldownPeriods ?? defaults.cooldownPeriods,
    };
  }

  async rotationSettings(): Promise<ChallengeRotationSettingOutput[]> {
    const settings = await Promise.all(
      Object.values(PeriodType).map((type) => this.rotationSetting(type)),
    );

    return settings;
  }

  async updateRotationSetting(
    periodType: PeriodType,
    selectionCount: number,
    cooldownPeriods: number,
  ): Promise<ChallengeRotationSettingOutput> {
    await this.rotationSettingRepository.upsert(
      { periodType, selectionCount, cooldownPeriods },
      ["periodType"],
    );

    return { periodType, selectionCount, cooldownPeriods };
  }

  private cooldownPeriodKeys(
    type: PeriodType,
    key: string,
    cooldownPeriods: number,
  ): string[] {
    return Array.from({ length: cooldownPeriods }, (_, index) => {
      const distance = index + 1;
      if (type === PeriodType.DAILY) return addDays(key, -distance);
      if (type === PeriodType.WEEKLY) return addDays(key, -7 * distance);

      const date = new Date(`${key}T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - distance);
      return date.toISOString().slice(0, 10);
    });
  }

  private shuffled<T>(items: T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [
        result[randomIndex],
        result[index],
      ];
    }
    return result;
  }

  private async ensureAssignments(
    type: PeriodType,
    value = today(),
    trigger = ChallengeRotationTrigger.LAZY,
  ): Promise<ChallengeAssignment[]> {
    const key = periodKey(type, value);
    const current = await this.assignments.find({
      where: { periodType: type, periodKey: key },
      relations: { challenge: true },
      order: { position: "ASC" },
    });

    if (current.length > 0) return current;

    try {
      return await this.assignments.manager.transaction((manager) =>
        this.ensureAssignmentsLocked(manager, type, key, trigger),
      );
    } catch (error) {
      await this.recordFailedRotation(type, key, trigger, null, error);
      throw error;
    }
  }

  private async ensureAssignmentsLocked(
    manager: EntityManager,
    type: PeriodType,
    key: string,
    trigger: ChallengeRotationTrigger,
  ): Promise<ChallengeAssignment[]> {
    // Serialize concurrent rotations (multiple requests, multiple cron
    // replicas) for this exact period so only one of them computes and
    // inserts the selection; the rest wait here and then read it back.
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
      `challenge-rotation:${type}:${key}`,
    ]);

    const assignmentsRepo = manager.getRepository(ChallengeAssignment);
    const existing = await assignmentsRepo.find({
      where: { periodType: type, periodKey: key },
      relations: { challenge: true },
      order: { position: "ASC" },
    });
    if (existing.length > 0) return existing;

    const { selectionCount, selected } = await this.selectRotationCandidates(
      manager,
      type,
      key,
    );

    if (selected.length > 0) {
      await assignmentsRepo
        .createQueryBuilder()
        .insert()
        .values(
          selected.map((challenge, index) => ({
            challengeId: challenge.id,
            periodType: type,
            periodKey: key,
            position: index + 1,
            name: challenge.name,
            description: challenge.description,
            icon: challenge.icon,
            workType: challenge.workType,
            targetCount: challenge.targetCount,
            dailyMaxCount: challenge.dailyMaxCount,
            point: challenge.point,
          })),
        )
        .execute();
    }

    await this.saveRotationRun(
      manager,
      type,
      key,
      trigger,
      selectionCount,
      selected,
      null,
    );

    return assignmentsRepo.find({
      where: { periodType: type, periodKey: key },
      relations: { challenge: true },
      order: { position: "ASC" },
    });
  }

  private async selectRotationCandidates(
    manager: EntityManager,
    type: PeriodType,
    key: string,
    deprioritizedIds: ReadonlySet<number> = new Set<number>(),
  ): Promise<{ selectionCount: number; selected: Challenge[] }> {
    const assignmentsRepo = manager.getRepository(ChallengeAssignment);
    const challengesRepo = manager.getRepository(Challenge);
    const { selectionCount, cooldownPeriods } = await this.rotationSetting(
      type,
      manager,
    );
    const candidates = await challengesRepo.findBy({
      recurrenceType: type,
      isActive: true,
    });
    const cooldownKeys = this.cooldownPeriodKeys(type, key, cooldownPeriods);
    const historyKeys = this.cooldownPeriodKeys(
      type,
      key,
      Math.max(cooldownPeriods, Object.values(WorkType).length),
    );
    const history =
      historyKeys.length > 0
        ? await assignmentsRepo.findBy({
            periodType: type,
            periodKey: In(historyKeys),
          })
        : [];
    const lastSeenPeriod = new Map<number, number>();
    history.forEach(({ challengeId, periodKey: assignedPeriodKey }) => {
      const challengeIdNumber = Number(challengeId);
      const periodIndex = cooldownKeys.indexOf(assignedPeriodKey);
      const existingIndex = lastSeenPeriod.get(challengeIdNumber);
      if (
        periodIndex >= 0 &&
        (existingIndex === undefined || periodIndex < existingIndex)
      ) {
        lastSeenPeriod.set(challengeIdNumber, periodIndex);
      }
    });
    const recentIds = new Set([
      ...lastSeenPeriod.keys(),
      ...deprioritizedIds.values(),
    ]);
    const preferred = this.shuffled(
      candidates.filter(({ id }) => !recentIds.has(Number(id))),
    );
    const fallback = this.shuffled(
      candidates.filter(({ id }) => recentIds.has(Number(id))),
    ).sort(
      (left, right) =>
        (lastSeenPeriod.get(Number(right.id)) ?? -1) -
        (lastSeenPeriod.get(Number(left.id)) ?? -1),
    );
    const orderedCandidates = [...preferred, ...fallback];
    const availableWorkTypes = Object.values(WorkType).filter((workType) =>
      candidates.some((candidate) => candidate.workType === workType),
    );
    const lastSeenWorkType = new Map<WorkType, number>();
    history.forEach(({ workType, periodKey: assignedPeriodKey }) => {
      const periodIndex = historyKeys.indexOf(assignedPeriodKey);
      const existingIndex = lastSeenWorkType.get(workType);
      if (
        periodIndex >= 0 &&
        (existingIndex === undefined || periodIndex < existingIndex)
      ) {
        lastSeenWorkType.set(workType, periodIndex);
      }
    });
    const prioritizedWorkTypes = this.shuffled(availableWorkTypes).sort(
      (left, right) =>
        (lastSeenWorkType.get(right) ?? Number.POSITIVE_INFINITY) -
        (lastSeenWorkType.get(left) ?? Number.POSITIVE_INFINITY),
    );
    const guaranteedWorkTypes = prioritizedWorkTypes.slice(
      0,
      Math.min(selectionCount, prioritizedWorkTypes.length),
    );
    const requiredByWorkType = guaranteedWorkTypes
      .map((workType) =>
        orderedCandidates.find((candidate) => candidate.workType === workType),
      )
      .filter((candidate): candidate is Challenge => candidate !== undefined);
    const effectiveSelectionCount = Math.min(candidates.length, selectionCount);
    const selectedIds = new Set(requiredByWorkType.map(({ id }) => Number(id)));
    const selected = [
      ...requiredByWorkType,
      ...orderedCandidates.filter(({ id }) => !selectedIds.has(Number(id))),
    ].slice(0, effectiveSelectionCount);
    return { selectionCount, selected };
  }

  private async saveRotationRun(
    manager: EntityManager,
    periodType: PeriodType,
    periodKeyValue: string,
    trigger: ChallengeRotationTrigger,
    requestedCount: number,
    selected: Challenge[],
    actorUserId: number | null,
  ): Promise<void> {
    const repository = manager.getRepository(ChallengeRotationRun);
    await repository.save(
      repository.create({
        periodType,
        periodKey: periodKeyValue,
        trigger,
        status: ChallengeRotationStatus.SUCCESS,
        requestedCount,
        selectedCount: selected.length,
        selectedChallenges: selected.map(({ id, name, workType }) => ({
          id: Number(id),
          name,
          workType,
        })),
        actorUserId,
        message: null,
      }),
    );
  }

  private async recordFailedRotation(
    periodType: PeriodType,
    periodKeyValue: string,
    trigger: ChallengeRotationTrigger,
    actorUserId: number | null,
    error: unknown,
  ): Promise<void> {
    try {
      const setting = await this.rotationSetting(periodType);
      await this.rotationRuns.save(
        this.rotationRuns.create({
          periodType,
          periodKey: periodKeyValue,
          trigger,
          status: ChallengeRotationStatus.FAILED,
          requestedCount: setting.selectionCount,
          selectedCount: 0,
          selectedChallenges: [],
          actorUserId,
          message:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "알 수 없는 오류",
        }),
      );
    } catch {
      // Keep the original rotation error when audit persistence also fails.
    }
  }

  async rotationHistory(
    periodType: PeriodType,
    limit = 12,
  ): Promise<ChallengeRotationRunOutput[]> {
    const runs = await this.rotationRuns.find({
      where: { periodType },
      order: { createdAt: "DESC" },
      take: Math.min(50, Math.max(1, limit)),
    });

    return runs.map((run) => ({
      id: Number(run.id),
      createdAt: run.createdAt,
      periodType: run.periodType,
      periodKey: run.periodKey,
      trigger: run.trigger,
      status: run.status,
      requestedCount: run.requestedCount,
      selectedCount: run.selectedCount,
      selectedChallenges: run.selectedChallenges,
      actorUserId: run.actorUserId === null ? null : Number(run.actorUserId),
      message: run.message,
    }));
  }

  async previewRotation(
    periodType: PeriodType,
    value = today(),
  ): Promise<ChallengeRotationPreviewOutput> {
    const key = periodKey(periodType, value);
    const current = await this.assignments.findBy({
      periodType,
      periodKey: key,
    });
    const { selectionCount, selected } = await this.selectRotationCandidates(
      this.assignments.manager,
      periodType,
      key,
      new Set(current.map(({ challengeId }) => Number(challengeId))),
    );

    return {
      periodType,
      periodKey: key,
      requestedCount: selectionCount,
      candidates: selected.map((challenge) => challengeResponse(challenge)),
    };
  }

  async rerollRotation(
    periodType: PeriodType,
    actorUserId: number,
    value = today(),
    selectedChallengeIds?: number[],
  ): Promise<ChallengeAssignment[]> {
    const key = periodKey(periodType, value);

    try {
      return await this.assignments.manager.transaction(async (manager) => {
        await manager.query(
          "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
          [`challenge-rotation:${periodType}:${key}`],
        );

        const assignmentsRepo = manager.getRepository(ChallengeAssignment);
        const current = await assignmentsRepo.find({
          where: { periodType, periodKey: key },
          order: { position: "ASC" },
        });
        const currentIds = current.map(({ id }) => Number(id));
        const progressCount =
          currentIds.length === 0
            ? 0
            : await manager.getRepository(UserProgressChallenge).count({
                where: { assignmentId: In(currentIds) },
              });

        if (progressCount > 0) {
          throw new BadRequestException(
            "이미 사용자 진행도가 기록된 기간은 재선발할 수 없습니다.",
          );
        }

        const previousChallengeIds = new Set(
          current.map(({ challengeId }) => Number(challengeId)),
        );
        if (currentIds.length > 0) {
          await assignmentsRepo.delete(currentIds);
        }

        let selectionCount: number;
        let selected: Challenge[];
        if (selectedChallengeIds) {
          const setting = await this.rotationSetting(periodType, manager);
          const activeCandidates = await manager
            .getRepository(Challenge)
            .findBy({
              recurrenceType: periodType,
              isActive: true,
            });
          const expectedCount = Math.min(
            setting.selectionCount,
            activeCandidates.length,
          );
          const candidateMap = new Map(
            activeCandidates.map((candidate) => [
              Number(candidate.id),
              candidate,
            ]),
          );
          selected = selectedChallengeIds
            .map((id) => candidateMap.get(Number(id)))
            .filter(
              (candidate): candidate is Challenge => candidate !== undefined,
            );
          selectionCount = setting.selectionCount;

          if (
            selected.length !== selectedChallengeIds.length ||
            selected.length !== expectedCount
          ) {
            throw new BadRequestException(
              "미리보기 결과가 현재 순환 설정과 달라졌습니다. 다시 미리보기 해주세요.",
            );
          }
        } else {
          const selection = await this.selectRotationCandidates(
            manager,
            periodType,
            key,
            previousChallengeIds,
          );
          selectionCount = selection.selectionCount;
          selected = selection.selected;
        }

        if (selected.length > 0) {
          await assignmentsRepo
            .createQueryBuilder()
            .insert()
            .values(
              selected.map((challenge, index) => ({
                challengeId: challenge.id,
                periodType,
                periodKey: key,
                position: index + 1,
                name: challenge.name,
                description: challenge.description,
                icon: challenge.icon,
                workType: challenge.workType,
                targetCount: challenge.targetCount,
                dailyMaxCount: challenge.dailyMaxCount,
                point: challenge.point,
              })),
            )
            .execute();
        }

        await this.saveRotationRun(
          manager,
          periodType,
          key,
          ChallengeRotationTrigger.MANUAL,
          selectionCount,
          selected,
          actorUserId,
        );

        return assignmentsRepo.find({
          where: { periodType, periodKey: key },
          relations: { challenge: true },
          order: { position: "ASC" },
        });
      });
    } catch (error) {
      await this.recordFailedRotation(
        periodType,
        key,
        ChallengeRotationTrigger.MANUAL,
        actorUserId,
        error,
      );
      throw error;
    }
  }

  private async currentAssignments(
    workType?: WorkType,
  ): Promise<ChallengeAssignment[]> {
    const assignments = (
      await Promise.all(
        Object.values(PeriodType).map((type) => this.ensureAssignments(type)),
      )
    ).flat();

    return assignments.filter(
      (assignment) => !workType || assignment.workType === workType,
    );
  }

  async list(): Promise<ChallengeOutput[]> {
    const challenges = await this.challenges.find({
      order: { createdAt: "DESC" },
    });
    const selectedIds = new Set(
      (await this.currentAssignments()).map(({ challengeId }) =>
        Number(challengeId),
      ),
    );
    const result = challenges.map((challenge) =>
      challengeResponse(challenge, selectedIds.has(Number(challenge.id))),
    );

    return result;
  }

  async create(dto: CreateChallengeDto): Promise<ChallengeOutput> {
    const exists = await this.challenges.exists({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(
        `이미 사용중인 도전과제명 입니다: ${dto.name}`,
      );
    }

    return challengeResponse(
      await this.challenges.save(this.challenges.create(dto)),
    );
  }

  async update(id: number, dto: UpdateChallengeDto): Promise<ChallengeOutput> {
    const item = await this.challenges.findOneBy({ id });

    if (!item) {
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    }

    Object.assign(item, dto);
    return challengeResponse(await this.challenges.save(item));
  }

  async remove(id: number): Promise<ChallengeOutput> {
    const item = await this.challenges.findOneBy({ id });
    if (!item) {
      throw new NotFoundException(`도전과제를 찾을 수 없습니다: ${id}`);
    }
    item.isActive = false;
    return challengeResponse(await this.challenges.save(item));
  }

  async withProgress(userId: number): Promise<ChallengeProgressOutput[]> {
    const active = await this.currentAssignments();

    const keys = [
      periodKey(PeriodType.DAILY),
      periodKey(PeriodType.WEEKLY),
      periodKey(PeriodType.MONTHLY),
    ];

    const progress = await this.progresses.find({
      where: { userId, periodKey: In(keys) },
      relations: { challenge: true, assignment: true },
    });

    const assignmentMap = new Map(
      progress
        .filter(
          ({ assignmentId }) =>
            assignmentId !== null && assignmentId !== undefined,
        )
        .map((item) => [Number(item.assignmentId), item]),
    );
    const challengeMap = new Map(
      progress.map((progress) => [Number(progress.challengeId), progress]),
    );
    const result = active.map((assignment) => {
      const item =
        assignmentMap.get(Number(assignment.id)) ??
        challengeMap.get(Number(assignment.challengeId));
      return {
        ...assignmentResponse(assignment, true),
        currentCount: item?.currentCount ?? 0,
        isAchieved: item?.isAchieved ?? false,
        periodType: assignment.periodType,
        periodKey: assignment.periodKey,
      };
    });

    return result;
  }

  async achieved(userId: number): Promise<ChallengeProgressOutput[]> {
    const progresses = await this.progresses.find({
      where: { userId, isAchieved: true },
      relations: { challenge: true, assignment: true },
      order: { createdAt: "DESC" },
    });

    const result = progresses.map(progressResponse);
    return result;
  }

  async record(
    userId: number,
    workType: WorkType,
  ): Promise<ChallengeAchievementOutput[]> {
    const items = await this.currentAssignments(workType);
    const achievements: ChallengeAchievementOutput[] = [];

    for (const assignment of items) {
      const key = assignment.periodKey;
      let progress = await this.progresses.findOne({
        where: [
          { userId, assignmentId: assignment.id },
          {
            userId,
            challengeId: assignment.challengeId,
            periodType: assignment.periodType,
            periodKey: key,
          },
        ],
      });

      if (!progress) {
        progress = this.progresses.create({
          userId,
          assignmentId: assignment.id,
          challengeId: assignment.challengeId,
          periodType: assignment.periodType,
          periodKey: key,
          currentCount: 0,
          isAchieved: false,
        });
      } else if (
        progress.assignmentId === null ||
        progress.assignmentId === undefined
      ) {
        progress.assignmentId = assignment.id;
      }

      //달성이 완료 됐거나 일일 최대 횟수를 초과하면 기록하지 않음
      if (
        progress.isAchieved ||
        progress.currentCount + 1 > assignment.dailyMaxCount
      ) {
        continue;
      }

      progress.currentCount += 1;

      // 달성 완료 시 포인트 지급, 완료여부 true로 변경
      if (progress.currentCount >= assignment.targetCount) {
        progress.isAchieved = true;
        await this.points.awardChallenge(
          userId,
          assignment.point,
          assignment.challengeId,
          assignment.periodType,
          undefined,
          key,
        );
        achievements.push({
          challengeId: Number(assignment.challengeId),
          name: assignment.name,
          description: assignment.description,
          point: assignment.point,
          periodType: assignment.periodType,
          periodKey: key,
        });
      }

      await this.progresses.save(progress);
    }

    return achievements;
  }

  async syncTodoProgress(
    userId: number,
    manager?: EntityManager,
  ): Promise<ChallengeAchievementOutput[]> {
    const progresses =
      manager?.getRepository(UserProgressChallenge) ?? this.progresses;
    const todos = manager?.getRepository(Todo) ?? this.todos;
    const items = await this.currentAssignments(WorkType.TODOS);
    const achievements: ChallengeAchievementOutput[] = [];

    for (const assignment of items) {
      const key = assignment.periodKey;
      const end = goalPeriodEnd(key, assignment.periodType, 1);
      const completed = await todos.find({
        where: {
          userId,
          status: TodoStatus.DONE,
          targetDate: Between(key, end),
        },
      });
      const countByDate = new Map<string, number>();
      completed.forEach((todo) => {
        countByDate.set(
          todo.targetDate,
          (countByDate.get(todo.targetDate) ?? 0) + 1,
        );
      });
      const contribution = Array.from(countByDate.values()).reduce(
        (total, count) => total + Math.min(count, assignment.dailyMaxCount),
        0,
      );
      const currentCount = Math.min(contribution, assignment.targetCount);

      let progress = await progresses.findOne({
        where: [
          { userId, assignmentId: assignment.id },
          {
            userId,
            challengeId: assignment.challengeId,
            periodType: assignment.periodType,
            periodKey: key,
          },
        ],
        lock: manager ? { mode: "pessimistic_write" } : undefined,
      });

      if (!progress && currentCount === 0) continue;
      if (!progress) {
        progress = progresses.create({
          userId,
          assignmentId: assignment.id,
          challengeId: assignment.challengeId,
          periodType: assignment.periodType,
          periodKey: key,
          currentCount: 0,
          isAchieved: false,
        });
      } else if (
        progress.assignmentId === null ||
        progress.assignmentId === undefined
      ) {
        progress.assignmentId = assignment.id;
      }

      const wasAchieved = progress.isAchieved;
      const isAchieved = currentCount >= assignment.targetCount;
      progress.currentCount = currentCount;
      progress.isAchieved = isAchieved;

      if (!wasAchieved && isAchieved) {
        await this.points.awardChallenge(
          userId,
          assignment.point,
          assignment.challengeId,
          assignment.periodType,
          manager,
          key,
        );
        achievements.push({
          challengeId: Number(assignment.challengeId),
          name: assignment.name,
          description: assignment.description,
          point: assignment.point,
          periodType: assignment.periodType,
          periodKey: key,
        });
      } else if (wasAchieved && !isAchieved) {
        await this.points.revokeChallenge(
          userId,
          assignment.challengeId,
          assignment.periodType,
          key,
          manager,
        );
      }

      await progresses.save(progress);
    }

    return achievements;
  }
}

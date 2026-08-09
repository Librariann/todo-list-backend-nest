import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import { ChallengesService } from "../challenges/challenges.service";
import { addPeriod, PeriodType, today } from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { Goal, GoalProcess, GoalStreak } from "../entities/goal.entity";

function goalResponse(g: Goal) {
  return {
    id: g.id,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    name: g.name,
    description: g.description,
    recurrenceType: g.recurrenceType,
    interval: g.interval,
    startDate: g.startDate,
    targetCount: g.targetCount,
  };
}
function processResponse(p: GoalProcess | null) {
  if (!p) return null;
  const target = p.goal.targetCount;
  const now = new Date(`${today()}T00:00:00Z`);
  const end = new Date(`${p.periodEnd}T00:00:00Z`);
  return {
    id: p.id,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    goalId: p.goalId,
    goalName: p.goal.name,
    periodIndex: p.periodIndex,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    currentCount: p.currentCount,
    targetCount: target,
    isAchieved: p.isAchieved,
    isFinalized: p.isFinalized,
    progressPercentage:
      target > 0 ? Math.min(100, (p.currentCount / target) * 100) : 0,
    daysRemaining: Math.max(
      0,
      Math.floor((end.getTime() - now.getTime()) / 86400000),
    ),
  };
}
function streakResponse(s: GoalStreak | null) {
  return s
    ? {
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        goalId: s.goalId,
        goalName: s.goal.name,
        currentStreak: s.currentStreak,
        longestStreak: s.longestStreak,
        isActive: s.currentStreak > 0,
      }
    : null;
}

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal) private readonly goals: Repository<Goal>,
    @InjectRepository(GoalProcess)
    private readonly processes: Repository<GoalProcess>,
    @InjectRepository(GoalStreak)
    private readonly streaks: Repository<GoalStreak>,
    private readonly challenges: ChallengesService,
  ) {}
  async create(
    userId: number,
    dto: {
      name: string;
      description?: string;
      recurrenceType: PeriodType;
      interval: number;
      startDate: string;
      targetCount: number;
    },
  ) {
    if (
      await this.goals.exists({
        where: { userId, name: dto.name, isActive: true },
      })
    )
      throw new ConflictException(
        `이미 동일한 이름의 활성 목표가 존재합니다: ${dto.name}`,
      );
    const goal = await this.goals.save(
      this.goals.create({
        ...dto,
        userId,
        description: dto.description ?? null,
        isActive: true,
      }),
    );
    await this.processes.save(
      this.processes.create({
        goalId: goal.id,
        userId,
        periodIndex: 1,
        periodStart: goal.startDate,
        periodEnd: addPeriod(
          goal.startDate,
          goal.recurrenceType,
          goal.interval,
        ),
        currentCount: 0,
        isAchieved: false,
        isFinalized: false,
      }),
    );
    await this.streaks.save(
      this.streaks.create({
        goalId: goal.id,
        userId,
        currentStreak: 0,
        longestStreak: 0,
      }),
    );
    return goalResponse(goal);
  }
  async list(userId: number) {
    return (
      await this.goals.find({
        where: { userId, isActive: true },
        order: { createdAt: "DESC" },
      })
    ).map(goalResponse);
  }
  async get(userId: number, id: number) {
    return goalResponse(await this.owned(userId, id));
  }
  async update(
    userId: number,
    id: number,
    dto: { name: string; description?: string; targetCount: number },
  ) {
    const goal = await this.owned(userId, id);
    if (
      dto.name !== goal.name &&
      (await this.goals.exists({
        where: { userId, name: dto.name, isActive: true },
      }))
    )
      throw new ConflictException(
        `이미 동일한 이름의 활성 목표가 존재합니다: ${dto.name}`,
      );
    goal.name = dto.name;
    goal.description = dto.description ?? null;
    goal.targetCount = dto.targetCount;
    return goalResponse(await this.goals.save(goal));
  }
  async deactivate(userId: number, id: number) {
    const goal = await this.owned(userId, id);
    goal.isActive = false;
    await this.goals.save(goal);
    const p = await this.current(userId, id);
    if (p) {
      p.isFinalized = true;
      await this.processes.save(p);
      await this.updateStreak(userId, id, p.isAchieved);
    }
  }
  async achieve(userId: number, id: number) {
    const goal = await this.owned(userId, id);
    const p = await this.current(userId, id);
    if (!p)
      throw new NotFoundException("활성 목표 프로세스를 찾을 수 없습니다");
    if (p.isAchieved) throw new BadRequestException("이미 달성된 목표입니다");
    p.currentCount += 1;
    if (p.currentCount >= goal.targetCount) {
      p.isAchieved = true;
      await this.challenges.record(userId, WorkType.GOALS);
    }
    await this.processes.save(p);
    p.goal = goal;
    return { data: processResponse(p), achieved: p.isAchieved };
  }
  async progress(userId: number, id: number) {
    const goal = await this.owned(userId, id);
    const p = await this.current(userId, id);
    if (p) p.goal = goal;
    return processResponse(p);
  }
  async streak(userId: number, id: number) {
    const goal = await this.owned(userId, id);
    const s = await this.streaks.findOneBy({ userId, goalId: id });
    if (s) s.goal = goal;
    return streakResponse(s);
  }
  async dashboard(userId: number) {
    const processes = await this.processes.find({
      where: { userId, isFinalized: false },
      relations: { goal: true },
      order: { periodStart: "DESC" },
    });
    const streaks = await this.streaks.find({
      where: { userId },
      relations: { goal: true },
    });
    const activeGoals = processes.map(processResponse);
    const activeStreaks = streaks.map(streakResponse);
    return {
      activeGoals,
      activeStreaks,
      stats: {
        totalActiveGoals: activeGoals.length,
        totalAchievedToday: processes.filter((p) => p.isAchieved).length,
        totalActiveStreaks: streaks.filter((s) => s.currentStreak > 0).length,
        longestCurrentStreak: Math.max(
          0,
          ...streaks.map((s) => s.currentStreak),
        ),
        maxStreakEver: Math.max(0, ...streaks.map((s) => s.longestStreak)),
        totalStreaksActive: streaks.filter((s) => s.currentStreak > 0).length,
      },
    };
  }
  private current(userId: number, goalId: number) {
    return this.processes.findOne({
      where: { userId, goalId, isFinalized: false },
      relations: { goal: true },
    });
  }
  private async owned(userId: number, id: number) {
    const goal = await this.goals.findOneBy({ id, userId });
    if (!goal) throw new NotFoundException(`목표를 찾을 수 없습니다: ${id}`);
    return goal;
  }
  private async updateStreak(
    userId: number,
    goalId: number,
    achieved: boolean,
  ) {
    const s = await this.streaks.findOneBy({ userId, goalId });
    if (!s) return;
    s.currentStreak = achieved ? s.currentStreak + 1 : 0;
    s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
    await this.streaks.save(s);
  }
  @Cron("0 0 1 * * *", { timeZone: "Asia/Seoul" }) async resetExpired() {
    for (const p of await this.processes.find({
      where: { isFinalized: false, periodEnd: LessThan(today()) },
      relations: { goal: true },
    })) {
      p.isFinalized = true;
      await this.processes.save(p);
      await this.updateStreak(p.userId, p.goalId, p.isAchieved);
      if (p.goal.isActive)
        await this.processes.save(
          this.processes.create({
            goalId: p.goalId,
            userId: p.userId,
            periodIndex: p.periodIndex + 1,
            periodStart: today(),
            periodEnd: addPeriod(
              today(),
              p.goal.recurrenceType,
              p.goal.interval,
            ),
            currentCount: 0,
            isAchieved: false,
            isFinalized: false,
          }),
        );
    }
  }
}

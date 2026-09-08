import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import {
  In,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from "typeorm";
import {
  ChallengeAchievementOutput,
  ChallengesService,
} from "../challenges/challenges.service";
import {
  goalPeriodEnd,
  goalPeriodForDate,
  goalPeriodForIndex,
  isValidDateString,
  PeriodType,
  today,
} from "../common/date";
import { WorkType } from "../entities/challenge.entity";
import { Goal, GoalProcess, GoalStreak } from "../entities/goal.entity";
import type { CreateGoalDto } from "./dto/create-goals.dto";

export interface GoalOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  name: string;
  description: string | null;
  recurrenceType: PeriodType;
  interval: number;
  startDate: string;
  targetCount: number;
}

export interface GoalProcessOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  goalId: number;
  goalName: string;
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  currentCount: number;
  targetCount: number;
  isAchieved: boolean;
  achievedAt: Date | null;
  isFinalized: boolean;
  progressPercentage: number;
  daysRemaining: number;
}

export interface GoalStreakOutput {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  goalId: number;
  goalName: string;
  currentStreak: number;
  longestStreak: number;
  isActive: boolean;
}

export interface GoalAchievementOutput {
  data: GoalProcessOutput;
  achieved: boolean;
  achievements: ChallengeAchievementOutput[];
}

export type GoalPeriodStatus = "ACTIVE" | "ACHIEVED" | "MISSED" | "UPCOMING";

export interface GoalDateOutput extends GoalOutput {
  streak: number;
  period: {
    id: number | null;
    index: number;
    start: string;
    end: string;
    currentCount: number;
    targetCount: number;
    isAchieved: boolean;
    isFinalized: boolean;
    achievedAt: Date | null;
    status: GoalPeriodStatus;
    canAchieve: boolean;
  };
}

export interface GoalDashboardOutput {
  activeGoals: GoalProcessOutput[];
  activeStreaks: GoalStreakOutput[];
  stats: {
    totalActiveGoals: number;
    totalAchievedToday: number;
    totalActiveStreaks: number;
    longestCurrentStreak: number;
    maxStreakEver: number;
    totalStreaksActive: number;
  };
}

function goalResponse(goal: Goal): GoalOutput {
  return {
    id: goal.id,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    name: goal.name,
    description: goal.description,
    recurrenceType: goal.recurrenceType,
    interval: goal.interval,
    startDate: goal.startDate,
    targetCount: goal.targetCount,
  };
}

function processResponse(process: GoalProcess): GoalProcessOutput {
  const target = process.goal.targetCount;
  const now = new Date(`${today()}T00:00:00Z`);
  const end = new Date(`${process.periodEnd}T00:00:00Z`);

  return {
    id: process.id,
    createdAt: process.createdAt,
    updatedAt: process.updatedAt,
    goalId: process.goalId,
    goalName: process.goal.name,
    periodIndex: process.periodIndex,
    periodStart: process.periodStart,
    periodEnd: process.periodEnd,
    currentCount: process.currentCount,
    targetCount: target,
    isAchieved: process.isAchieved,
    achievedAt: process.achievedAt,
    isFinalized: process.isFinalized,
    progressPercentage:
      target > 0 ? Math.min(100, (process.currentCount / target) * 100) : 0,
    daysRemaining: Math.max(
      0,
      Math.floor((end.getTime() - now.getTime()) / 86400000),
    ),
  };
}

function streakResponse(streak: GoalStreak): GoalStreakOutput {
  return {
    id: streak.id,
    createdAt: streak.createdAt,
    updatedAt: streak.updatedAt,
    goalId: streak.goalId,
    goalName: streak.goal.name,
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    isActive: streak.currentStreak > 0,
  };
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

  //Create Goals
  async create(userId: number, dto: CreateGoalDto): Promise<GoalOutput> {
    if (dto.startDate < today()) {
      throw new BadRequestException("지난 날짜에는 목표를 생성할 수 없습니다.");
    }

    const exists = await this.goals.exists({
      where: { userId, name: dto.name, isActive: true },
    });

    if (exists) {
      throw new ConflictException(
        `이미 동일한 이름의 활성 목표가 존재합니다: ${dto.name}`,
      );
    }

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
        periodEnd: goalPeriodEnd(
          goal.startDate,
          goal.recurrenceType,
          goal.interval,
        ),
        currentCount: 0,
        isAchieved: false,
        achievedAt: null,
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

  //Get Goals List
  async list(userId: number): Promise<GoalOutput[]> {
    const getFindLists = await this.goals.find({
      where: { userId, isActive: true },
      order: { createdAt: "DESC" },
    });
    const result = getFindLists.map(goalResponse);

    return result;
  }

  async get(userId: number, id: number): Promise<GoalOutput> {
    const goal = await this.owned(userId, id);
    return goalResponse(goal);
  }

  async byDate(userId: number, date: string): Promise<GoalDateOutput[]> {
    if (!isValidDateString(date)) {
      throw new BadRequestException(
        "조회 날짜는 YYYY-MM-DD 형식이어야 합니다.",
      );
    }

    const goals = await this.goals.find({
      where: { userId, isActive: true, startDate: LessThanOrEqual(date) },
      order: { createdAt: "DESC" },
    });

    if (goals.length === 0) return [];

    const goalIds = goals.map((goal) => goal.id);
    const [processes, streaks] = await Promise.all([
      this.processes.find({
        where: {
          userId,
          goalId: In(goalIds),
          periodStart: LessThanOrEqual(date),
          periodEnd: MoreThanOrEqual(date),
        },
      }),
      this.streaks.find({ where: { userId, goalId: In(goalIds) } }),
    ]);
    const processByGoalId = new Map(
      processes.map((process) => [Number(process.goalId), process]),
    );
    const streakByGoalId = new Map(
      streaks.map((streak) => [Number(streak.goalId), streak.currentStreak]),
    );
    const currentDate = today();

    return goals.map((goal) => {
      const process = processByGoalId.get(Number(goal.id));
      const calculatedPeriod = goalPeriodForDate(
        goal.startDate,
        goal.recurrenceType,
        goal.interval,
        date,
      );
      const periodStart = process?.periodStart ?? calculatedPeriod.start;
      const periodEnd = process?.periodEnd ?? calculatedPeriod.end;
      const isAchieved = process?.isAchieved ?? false;
      const isFinalized = process?.isFinalized ?? periodEnd < currentDate;
      const status: GoalPeriodStatus = isAchieved
        ? "ACHIEVED"
        : periodEnd < currentDate
          ? "MISSED"
          : periodStart > currentDate
            ? "UPCOMING"
            : "ACTIVE";

      return {
        ...goalResponse(goal),
        streak: streakByGoalId.get(Number(goal.id)) ?? 0,
        period: {
          id: process?.id ?? null,
          index: process?.periodIndex ?? calculatedPeriod.index,
          start: periodStart,
          end: periodEnd,
          currentCount: process?.currentCount ?? 0,
          targetCount: goal.targetCount,
          isAchieved,
          isFinalized,
          achievedAt: process?.achievedAt ?? null,
          status,
          canAchieve:
            process !== undefined &&
            date === currentDate &&
            periodStart <= currentDate &&
            currentDate <= periodEnd &&
            !isAchieved &&
            !isFinalized,
        },
      };
    });
  }

  async update(
    userId: number,
    id: number,
    dto: CreateGoalDto,
  ): Promise<GoalOutput> {
    const goal = await this.owned(userId, id);
    const exists = await this.goals.exists({
      where: { userId, name: dto.name, isActive: true },
    });

    //받은 데이터의 이름이 기존 목표 이름과 다르고, 동일한 이름의 활성화된 목표가 존재하면 충돌 예외 발생
    if (dto.name !== goal.name && exists) {
      throw new ConflictException(
        `이미 동일한 이름의 활성 목표가 존재합니다: ${dto.name}`,
      );
    }

    goal.name = dto.name;
    goal.description = dto.description ?? null;
    goal.targetCount = dto.targetCount;
    return goalResponse(await this.goals.save(goal));
  }
  async deactivate(userId: number, id: number): Promise<void> {
    const goal = await this.owned(userId, id);
    goal.isActive = false;
    await this.goals.save(goal);
    const currentGoals = await this.current(userId, id);
    if (currentGoals) {
      currentGoals.isFinalized = true;
      await this.processes.save(currentGoals);
      if (!currentGoals.isAchieved) {
        await this.updateStreak(userId, id, false);
      }
    }
  }
  async achieve(userId: number, id: number): Promise<GoalAchievementOutput> {
    const goal = await this.owned(userId, id);
    const currentDate = today();
    const currentGoals = await this.processes.findOne({
      where: {
        userId,
        goalId: id,
        isFinalized: false,
        periodStart: LessThanOrEqual(currentDate),
        periodEnd: MoreThanOrEqual(currentDate),
      },
      relations: { goal: true },
    });

    if (!currentGoals) {
      throw new BadRequestException("오늘 완료할 수 있는 목표 기간이 아닙니다");
    }

    if (currentGoals.isAchieved) {
      throw new BadRequestException("이미 달성된 목표입니다");
    }

    currentGoals.currentCount += 1;
    let achievements: ChallengeAchievementOutput[] = [];

    if (currentGoals.currentCount >= goal.targetCount) {
      currentGoals.isAchieved = true;
      currentGoals.achievedAt = new Date();
      achievements =
        (await this.challenges.record(userId, WorkType.GOALS)) ?? [];
    }

    await this.processes.save(currentGoals);
    if (currentGoals.isAchieved) {
      await this.updateStreak(userId, id, true);
    }
    currentGoals.goal = goal;

    return {
      data: processResponse(currentGoals),
      achieved: currentGoals.isAchieved,
      achievements,
    };
  }
  async progress(
    userId: number,
    id: number,
  ): Promise<GoalProcessOutput | null> {
    const goal = await this.owned(userId, id);
    const currentGoals = await this.current(userId, id);

    if (currentGoals) {
      currentGoals.goal = goal;
    }

    return currentGoals ? processResponse(currentGoals) : null;
  }

  async streak(userId: number, id: number): Promise<GoalStreakOutput | null> {
    const goal = await this.owned(userId, id);
    const streak = await this.streaks.findOneBy({ userId, goalId: id });

    if (streak) {
      streak.goal = goal;
    }

    return streak ? streakResponse(streak) : null;
  }

  async dashboard(userId: number): Promise<GoalDashboardOutput> {
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

  private current(userId: number, goalId: number): Promise<GoalProcess | null> {
    return this.processes.findOne({
      where: { userId, goalId, isFinalized: false },
      relations: { goal: true },
    });
  }

  private async owned(userId: number, id: number): Promise<Goal> {
    const goal = await this.goals.findOneBy({ id, userId });
    if (!goal) {
      throw new NotFoundException(`목표를 찾을 수 없습니다: ${id}`);
    }

    return goal;
  }

  private async updateStreak(
    userId: number,
    goalId: number,
    achieved: boolean,
  ): Promise<void> {
    const streak = await this.streaks.findOneBy({ userId, goalId });

    //streak이 존재하지 않으면 아무 작업도 수행하지 않고 종료
    if (!streak) {
      return;
    }

    streak.currentStreak = achieved ? streak.currentStreak + 1 : 0;
    streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
    await this.streaks.save(streak);
  }

  // 매시간 10분에 만료된 목표 기간을 마감하고 다음 기간을 준비
  @Cron("0 10 * * * *", { timeZone: "Asia/Seoul" })
  async resetExpired(): Promise<void> {
    for (const process of await this.processes.find({
      where: { isFinalized: false, periodEnd: LessThan(today()) },
      relations: { goal: true },
    })) {
      process.isFinalized = true;

      await this.processes.save(process);
      if (!process.isAchieved) {
        await this.updateStreak(process.userId, process.goalId, false);
      }

      if (process.goal.isActive) {
        let nextIndex = process.periodIndex + 1;
        let nextPeriod = goalPeriodForIndex(
          process.goal.startDate,
          process.goal.recurrenceType,
          process.goal.interval,
          nextIndex,
        );

        while (nextPeriod.end < today()) {
          await this.processes.save(
            this.processes.create({
              goalId: process.goalId,
              userId: process.userId,
              periodIndex: nextIndex,
              periodStart: nextPeriod.start,
              periodEnd: nextPeriod.end,
              currentCount: 0,
              isAchieved: false,
              achievedAt: null,
              isFinalized: true,
            }),
          );
          await this.updateStreak(process.userId, process.goalId, false);
          nextIndex += 1;
          nextPeriod = goalPeriodForIndex(
            process.goal.startDate,
            process.goal.recurrenceType,
            process.goal.interval,
            nextIndex,
          );
        }

        await this.processes.save(
          this.processes.create({
            goalId: process.goalId,
            userId: process.userId,
            periodIndex: nextIndex,
            periodStart: nextPeriod.start,
            periodEnd: nextPeriod.end,
            currentCount: 0,
            isAchieved: false,
            achievedAt: null,
            isFinalized: false,
          }),
        );
      }
    }
  }
}

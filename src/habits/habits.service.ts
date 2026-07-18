import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import { ChallengesService } from "../challenges/challenges.service";
import { WorkType } from "../entities/challenge.entity";
import { Habit, HabitLog, HabitStreak } from "../entities/habit.entity";
import { today } from "../common/date";
import type { CreateHabitDto } from "./dto/create-habits.dto";
import type { UpdateHabitDto } from "./dto/update-habits.dto";

export interface HabitOutput {
  id: number;
  name: string;
  description: string | null;
  dailyTarget: number;
  unit: string | null;
  isActive: boolean;
  createdAt: Date;
  todayCount: number;
  todayAchieved: boolean;
  currentStreak: number;
  longestStreak: number;
}

export interface HabitHistoryOutput {
  id: number;
  habitId: number;
  logDate: string;
  currentCount: number;
  isAchieved: boolean;
}

function response(
  habit: Habit,
  log?: HabitLog | null,
  streak?: HabitStreak | null,
): HabitOutput {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    dailyTarget: habit.dailyTarget,
    unit: habit.unit,
    isActive: habit.isActive,
    createdAt: habit.createdAt,
    todayCount: log?.currentCount ?? 0,
    todayAchieved: log?.isAchieved ?? false,
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
  };
}

@Injectable()
export class HabitsService {
  constructor(
    @InjectRepository(Habit) private readonly habits: Repository<Habit>,
    @InjectRepository(HabitLog) private readonly logs: Repository<HabitLog>,
    @InjectRepository(HabitStreak)
    private readonly streaks: Repository<HabitStreak>,
    private readonly challenges: ChallengesService,
  ) {}

  async create(userId: number, dto: CreateHabitDto): Promise<HabitOutput> {
    const existHabits = await this.habits.exists({
      where: { userId, name: dto.name, isActive: true },
    });

    if (existHabits) {
      throw new ConflictException(
        `이미 동일한 이름의 활성 습관이 존재합니다: ${dto.name}`,
      );
    }

    const habit = await this.habits.save(
      this.habits.create({ ...dto, userId, isActive: true }),
    );

    const streak = await this.streaks.save(
      this.streaks.create({
        habitId: habit.id,
        userId,
        currentStreak: 0,
        longestStreak: 0,
      }),
    );

    return response(habit, null, streak);
  }

  async list(userId: number): Promise<HabitOutput[]> {
    const items = await this.habits.find({
      where: { userId, isActive: true },
      order: { createdAt: "DESC" },
    });

    return Promise.all(
      items.map(async (habits) =>
        response(
          habits,
          await this.logs.findOneBy({ habitId: habits.id, logDate: today() }),
          await this.streaks.findOneBy({ habitId: habits.id, userId }),
        ),
      ),
    );
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateHabitDto,
  ): Promise<HabitOutput> {
    const getHabits = await this.owned(userId, id);
    const existsHabits = await this.habits.exists({
      where: { userId, name: dto.name, isActive: true },
    });

    //받은 dto.name이 존재하고, 기존 습관의 이름과 다르며, 이미 존재하는 습관이 있는 경우 충돌 예외 발생
    const habitsChecks =
      dto.name && dto.name !== getHabits.name && existsHabits;

    if (habitsChecks) {
      throw new ConflictException(
        `이미 동일한 이름의 활성 습관이 존재합니다: ${dto.name}`,
      );
    }

    Object.assign(getHabits, dto);
    await this.habits.save(getHabits);

    return response(
      getHabits,
      await this.logs.findOneBy({ habitId: id, logDate: today() }),
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }

  async deactivate(userId: number, id: number): Promise<void> {
    const getHabits = await this.owned(userId, id);
    getHabits.isActive = false;
    await this.habits.save(getHabits);
  }
  async increment(userId: number, id: number): Promise<HabitOutput> {
    const getHabits = await this.owned(userId, id);
    let log = await this.logs.findOneBy({
      habitId: id,
      userId,
      logDate: today(),
    });

    if (!log) {
      log = this.logs.create({
        habitId: id,
        userId,
        logDate: today(),
        currentCount: 0,
        isAchieved: false,
      });
    }

    const newlyAchieved =
      !log.isAchieved && log.currentCount + 1 >= getHabits.dailyTarget;
    log.currentCount += 1;

    if (newlyAchieved) {
      log.isAchieved = true;
    }

    await this.logs.save(log);

    if (newlyAchieved) {
      await this.challenges.record(userId, WorkType.HABITS);
    }

    return response(
      getHabits,
      log,
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }

  // 습관 카운터 감소
  async decrement(userId: number, id: number): Promise<HabitOutput> {
    const getHabits = await this.owned(userId, id);
    const log = await this.logs.findOneBy({
      habitId: id,
      userId,
      logDate: today(),
    });

    if (!log) {
      throw new NotFoundException("오늘 기록이 없습니다");
    }

    if (log.currentCount <= 0) {
      throw new BadRequestException("카운터가 이미 0입니다");
    }

    log.currentCount -= 1;

    await this.logs.save(log);

    return response(
      getHabits,
      log,
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }

  async history(
    userId: number,
    id: number,
    from: string,
    to: string,
  ): Promise<HabitHistoryOutput[]> {
    await this.owned(userId, id);

    return (
      await this.logs.find({
        where: { habitId: id, userId, logDate: Between(from, to) },
        order: { logDate: "ASC" },
      })
    ).map((log) => ({
      id: log.id,
      habitId: log.habitId,
      logDate: log.logDate,
      currentCount: log.currentCount,
      isAchieved: log.isAchieved,
    }));
  }
  private async owned(userId: number, id: number): Promise<Habit> {
    const habits = await this.habits.findOneBy({ id, userId });

    if (!habits) {
      throw new NotFoundException(`습관을 찾을 수 없습니다: ${id}`);
    }

    return habits;
  }

  //매일 0시 10분에 Streaks update
  //TODO: 추후 기능 변경 필요 - 매일 0시 10분이 아니라 달성시마다 체크해야함
  @Cron("0 10 0 * * *", { timeZone: "Asia/Seoul" })
  async updateDailyStreaks(): Promise<void> {
    const date = new Date(`${today()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    const yesterday = date.toISOString().slice(0, 10);

    for (const habits of await this.habits.findBy({ isActive: true })) {
      const log = await this.logs.findOneBy({
        habitId: habits.id,
        userId: habits.userId,
        logDate: yesterday,
      });

      let streaks = await this.streaks.findOneBy({
        habitId: habits.id,
        userId: habits.userId,
      });

      if (!streaks) {
        streaks = this.streaks.create({
          habitId: habits.id,
          userId: habits.userId,
          currentStreak: 0,
          longestStreak: 0,
        });
      }

      streaks.currentStreak = log?.isAchieved ? streaks.currentStreak + 1 : 0;

      streaks.longestStreak = Math.max(
        streaks.longestStreak,
        streaks.currentStreak,
      );

      await this.streaks.save(streaks);
    }
  }
}

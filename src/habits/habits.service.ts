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

function response(
  h: Habit,
  log?: HabitLog | null,
  streak?: HabitStreak | null,
) {
  return {
    id: h.id,
    name: h.name,
    description: h.description,
    dailyTarget: h.dailyTarget,
    unit: h.unit,
    isActive: h.isActive,
    createdAt: h.createdAt,
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
  async create(userId: number, dto: Partial<Habit>) {
    if (
      await this.habits.exists({
        where: { userId, name: dto.name, isActive: true },
      })
    )
      throw new ConflictException(
        `이미 동일한 이름의 활성 습관이 존재합니다: ${dto.name}`,
      );
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
  async list(userId: number) {
    const items = await this.habits.find({
      where: { userId, isActive: true },
      order: { createdAt: "DESC" },
    });
    return Promise.all(
      items.map(async (h) =>
        response(
          h,
          await this.logs.findOneBy({ habitId: h.id, logDate: today() }),
          await this.streaks.findOneBy({ habitId: h.id, userId }),
        ),
      ),
    );
  }
  async update(userId: number, id: number, dto: Partial<Habit>) {
    const h = await this.owned(userId, id);
    if (
      dto.name &&
      dto.name !== h.name &&
      (await this.habits.exists({
        where: { userId, name: dto.name, isActive: true },
      }))
    )
      throw new ConflictException(
        `이미 동일한 이름의 활성 습관이 존재합니다: ${dto.name}`,
      );
    Object.assign(h, dto);
    await this.habits.save(h);
    return response(
      h,
      await this.logs.findOneBy({ habitId: id, logDate: today() }),
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }
  async deactivate(userId: number, id: number) {
    const h = await this.owned(userId, id);
    h.isActive = false;
    await this.habits.save(h);
  }
  async increment(userId: number, id: number) {
    const h = await this.owned(userId, id);
    let log = await this.logs.findOneBy({
      habitId: id,
      userId,
      logDate: today(),
    });
    if (!log)
      log = this.logs.create({
        habitId: id,
        userId,
        logDate: today(),
        currentCount: 0,
        isAchieved: false,
      });
    const newlyAchieved =
      !log.isAchieved && log.currentCount + 1 >= h.dailyTarget;
    log.currentCount += 1;
    if (newlyAchieved) log.isAchieved = true;
    await this.logs.save(log);
    if (newlyAchieved) await this.challenges.record(userId, WorkType.HABITS);
    return response(
      h,
      log,
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }
  async decrement(userId: number, id: number) {
    const h = await this.owned(userId, id);
    const log = await this.logs.findOneBy({
      habitId: id,
      userId,
      logDate: today(),
    });
    if (!log) throw new NotFoundException("오늘 기록이 없습니다");
    if (log.currentCount <= 0)
      throw new BadRequestException("카운터가 이미 0입니다");
    log.currentCount -= 1;
    await this.logs.save(log);
    return response(
      h,
      log,
      await this.streaks.findOneBy({ habitId: id, userId }),
    );
  }
  async history(userId: number, id: number, from: string, to: string) {
    await this.owned(userId, id);
    return (
      await this.logs.find({
        where: { habitId: id, userId, logDate: Between(from, to) },
        order: { logDate: "ASC" },
      })
    ).map((l) => ({
      id: l.id,
      habitId: l.habitId,
      logDate: l.logDate,
      currentCount: l.currentCount,
      isAchieved: l.isAchieved,
    }));
  }
  private async owned(userId: number, id: number) {
    const h = await this.habits.findOneBy({ id, userId });
    if (!h) throw new NotFoundException(`습관을 찾을 수 없습니다: ${id}`);
    return h;
  }
  @Cron("0 10 0 * * *", { timeZone: "Asia/Seoul" }) async updateDailyStreaks() {
    const date = new Date(`${today()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    const yesterday = date.toISOString().slice(0, 10);
    for (const h of await this.habits.findBy({ isActive: true })) {
      const log = await this.logs.findOneBy({
        habitId: h.id,
        userId: h.userId,
        logDate: yesterday,
      });
      let s = await this.streaks.findOneBy({ habitId: h.id, userId: h.userId });
      if (!s)
        s = this.streaks.create({
          habitId: h.id,
          userId: h.userId,
          currentStreak: 0,
          longestStreak: 0,
        });
      s.currentStreak = log?.isAchieved ? s.currentStreak + 1 : 0;
      s.longestStreak = Math.max(s.longestStreak, s.currentStreak);
      await this.streaks.save(s);
    }
  }
}
